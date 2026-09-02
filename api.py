# ══════════════════════════════════════════════════════════════
#  API.PY  —  Python backend bridge  (SQLite + PyWebView)
#
#  FIXES applied previously:
#  [1] UUID-based IDs
#  [2] get_low_stock excludes stock=0
#  [3] FK REFERENCES + ON DELETE CASCADE on sale_items
#  [4] Per-year invoice seq via MAX(invoice_seq)
#
#  NEW FEATURES (this file):
#  [1.2] add_sale: stock pre-check + atomic rollback
#  [1.4] void_sale: marks invoice "ملغاة", restores stock
#  [1.5] orphan-safe delete: is_active archiving for med/patient/supplier
#  [1.6] atomic invoice numbering with BEGIN IMMEDIATE
#  [1.7] barcode uniqueness check in add_medicine
#  [2.8] pbkdf2_hmac password hashing (upgrade path from sha256/plain)
#  [2.10] login lockout: 5 failures → 2-minute temp lock
#  [3.13] role permission check helper _require_role()
#  [3.14] backup_database / restore_database
#  [3.15] get_profit_report
#  [3.16] audit_log table + get_audit_log
# ══════════════════════════════════════════════════════════════

import sqlite3, json, os, uuid, hashlib, hmac, secrets, shutil, csv, io
from datetime import datetime, date, timedelta

DB_PATH     = os.path.join(os.path.dirname(__file__), "pharmacy.db")
BACKUP_DIR  = os.path.join(os.path.dirname(__file__), "backups")

# ── in-memory login-failure tracker {username: (count, lockout_until)} ──
_LOGIN_FAILURES: dict = {}
_MAX_ATTEMPTS   = 5
_LOCKOUT_SECS   = 120


# ── low-level helpers ──────────────────────────────────────────
def _conn():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    return con

def _rows(cur):     return [dict(r) for r in cur.fetchall()]
def _ok(data=None): return json.dumps({"ok": True,  "data": data}, ensure_ascii=False, default=str)
def _err(msg: str): return json.dumps({"ok": False, "error": msg}, ensure_ascii=False)

def _new_id(prefix: str): return f"{prefix}-{uuid.uuid4().hex[:6].upper()}"

def auto_backup():
    """إنشاء لقطة SQLite سليمة؛ قابلة للاستدعاء من خيط الخلفية والاختبارات."""
    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = os.path.join(BACKUP_DIR, f"auto_pharmacy_{ts}.db")
    src, dst = sqlite3.connect(DB_PATH), sqlite3.connect(dest)
    try:
        src.backup(dst)
    finally:
        src.close(); dst.close()
    return dest


# ── FIX [1.6]: atomic invoice numbering ───────────────────────
def _next_invoice(con):
    """Must be called inside a BEGIN IMMEDIATE transaction."""
    year = datetime.now().year
    row  = con.execute(
        "SELECT COALESCE(MAX(invoice_seq),0) FROM sales WHERE invoice_year=?", (year,)
    ).fetchone()
    seq = row[0] + 1
    return f"INV-{year}-{seq:03d}", seq, year


# ── FIX [2.8]: pbkdf2_hmac password hashing ───────────────────
_PBKDF2_ITERS = 260_000

def _hash_password(pwd: str, salt: str = None) -> str:
    """Returns  'pbkdf2:<salt>:<hash>'  so we can detect the format."""
    if salt is None:
        salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256", pwd.encode("utf-8"), salt.encode("utf-8"), _PBKDF2_ITERS
    )
    return f"pbkdf2:{salt}:{dk.hex()}"

def _verify_password(pwd: str, stored: str) -> bool:
    """Supports pbkdf2 (new), raw sha256 (old), and plain (seed legacy)."""
    if stored.startswith("pbkdf2:"):
        _, salt, _ = stored.split(":", 2)
        return hmac.compare_digest(_hash_password(pwd, salt), stored)
    # legacy sha256
    if stored == hashlib.sha256(pwd.encode()).hexdigest():
        return True
    # legacy plain (seeds before hashing was added)
    return stored == pwd


# ── audit log helper ──────────────────────────────────────────
def _audit(con, user_id: str, action: str, entity: str,
           entity_id: str, details: str = ""):
    con.execute(
        "INSERT INTO audit_log(id,user_id,action,entity,entity_id,timestamp,details) "
        "VALUES(?,?,?,?,?,?,?)",
        (_new_id("AL"), user_id or "system", action, entity,
         entity_id, datetime.now().isoformat(), details)
    )


# ── role permission helper ────────────────────────────────────
_ROLE_PERMS = {
    "مدير النظام":     {"all"},
    "صيدلاني مسؤول":  {"sales","medicines","patients","suppliers","reports","invoices"},
    "مساعد صيدلي":    {"sales","medicines_view","invoices_view"},
}

def _has_perm(role: str, perm: str) -> bool:
    perms = _ROLE_PERMS.get(role, set())
    return "all" in perms or perm in perms


# ══════════════════════════════════════════════════════════════
#  SCHEMA INIT
# ══════════════════════════════════════════════════════════════
def init_db():
    con = _conn()
    con.executescript("""
    CREATE TABLE IF NOT EXISTS medicines (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        scientific_name TEXT,
        manufacturer TEXT,
        batch_number TEXT,
        category    TEXT NOT NULL,
        price       REAL NOT NULL,
        cost        REAL    DEFAULT 0,
        stock       INTEGER DEFAULT 0,
        min_stock   INTEGER DEFAULT 10,
        unit        TEXT    DEFAULT 'قرص',
        supplier_id TEXT,
        expiry      TEXT,
        barcode     TEXT,
        location    TEXT,
        description TEXT,
        is_active   INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS patients (
        id               TEXT PRIMARY KEY,
        name             TEXT NOT NULL,
        phone            TEXT NOT NULL,
        age              INTEGER,
        gender           TEXT,
        blood_type       TEXT,
        allergies        TEXT,
        chronic_diseases TEXT,
        address          TEXT,
        notes            TEXT,
        created_at       TEXT,
        is_active        INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS suppliers (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        contact       TEXT,
        phone         TEXT,
        email         TEXT,
        address       TEXT,
        tax_num       TEXT,
        payment_terms TEXT,
        status        TEXT    DEFAULT 'نشط',
        rating        INTEGER DEFAULT 3,
        total_orders  INTEGER DEFAULT 0,
        last_order    TEXT,
        is_active     INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS purchases (
        id             TEXT PRIMARY KEY,
        po_num         TEXT UNIQUE,
        supplier_id    TEXT,
        supplier_name  TEXT,
        status         TEXT DEFAULT 'مفتوح',
        total_cost     REAL DEFAULT 0,
        notes          TEXT,
        created_by     TEXT,
        created_at     TEXT,
        received_at    TEXT
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
        med_id      TEXT,
        med_name    TEXT,
        qty_ordered INTEGER DEFAULT 0,
        qty_received INTEGER DEFAULT 0,
        unit_cost   REAL DEFAULT 0,
        total_cost  REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS accounts (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        type        TEXT NOT NULL,
        balance     REAL DEFAULT 0,
        notes       TEXT,
        is_active   INTEGER DEFAULT 1,
        created_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
        id          TEXT PRIMARY KEY,
        account_id  TEXT NOT NULL REFERENCES accounts(id),
        type        TEXT NOT NULL,
        amount      REAL NOT NULL,
        description TEXT,
        ref_type    TEXT,
        ref_id      TEXT,
        created_by  TEXT,
        created_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS cash_sessions (
        id           TEXT PRIMARY KEY,
        opened_by    TEXT,
        opened_at    TEXT,
        closed_by    TEXT,
        closed_at    TEXT,
        opening_cash REAL DEFAULT 0,
        closing_cash REAL DEFAULT 0,
        expected_cash REAL DEFAULT 0,
        difference   REAL DEFAULT 0,
        sales_total  REAL DEFAULT 0,
        status       TEXT DEFAULT 'مفتوحة'
    );

    CREATE TABLE IF NOT EXISTS employees (
        id           TEXT PRIMARY KEY,
        full_name    TEXT NOT NULL,
        role         TEXT,
        phone        TEXT,
        national_id  TEXT,
        hire_date    TEXT,
        salary       REAL DEFAULT 0,
        hourly_rate  REAL DEFAULT 0,
        is_active    INTEGER DEFAULT 1,
        notes        TEXT
    );

    CREATE TABLE IF NOT EXISTS payroll (
        id           TEXT PRIMARY KEY,
        employee_id  TEXT NOT NULL REFERENCES employees(id),
        period       TEXT NOT NULL,
        base_salary  REAL DEFAULT 0,
        bonus        REAL DEFAULT 0,
        deductions   REAL DEFAULT 0,
        net_pay      REAL DEFAULT 0,
        paid_at      TEXT,
        paid_by      TEXT,
        notes        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_purchases_supplier  ON purchases(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_items_po   ON purchase_items(purchase_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_acc    ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date   ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_payroll_emp         ON payroll(employee_id);

    CREATE TABLE IF NOT EXISTS sales (
        id             TEXT PRIMARY KEY,
        invoice_num    TEXT UNIQUE,
        invoice_seq    INTEGER DEFAULT 0,
        invoice_year   INTEGER DEFAULT 0,
        patient_id     TEXT,
        patient_name   TEXT,
        subtotal       REAL,
        discount       REAL DEFAULT 0,
        tax            REAL DEFAULT 0,
        total          REAL,
        payment_method TEXT,
        cashier        TEXT,
        sale_date      TEXT,
        sale_time      TEXT,
        status         TEXT DEFAULT 'مكتمل',
        voided_by      TEXT,
        voided_at      TEXT
    );

    CREATE TABLE IF NOT EXISTS sale_items (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id  TEXT NOT NULL
                     REFERENCES sales(id) ON DELETE CASCADE,
        med_id   TEXT,
        name     TEXT,
        qty      INTEGER,
        price    REAL,
        total    REAL
    );

    CREATE TABLE IF NOT EXISTS prescriptions (
        id                TEXT PRIMARY KEY,
        patient_id        TEXT,
        doctor_name       TEXT NOT NULL,
        doctor_license    TEXT NOT NULL,
        prescription_type TEXT NOT NULL,
        sale_id           TEXT UNIQUE REFERENCES sales(id) ON DELETE CASCADE,
        date              TEXT NOT NULL,
        image_data        TEXT,
        created_by        TEXT,
        created_at        TEXT
    );

    CREATE TABLE IF NOT EXISTS debts (
        id TEXT PRIMARY KEY, patient_id TEXT, sale_id TEXT UNIQUE REFERENCES sales(id),
        amount REAL NOT NULL, paid_amount REAL DEFAULT 0, due_date TEXT,
        status TEXT DEFAULT 'مستحق', notes TEXT, created_at TEXT, updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS medicine_batches (
        id TEXT PRIMARY KEY, medicine_id TEXT NOT NULL REFERENCES medicines(id),
        batch_number TEXT, expiry TEXT, qty INTEGER DEFAULT 0, cost REAL DEFAULT 0, received_date TEXT
    );

    CREATE TABLE IF NOT EXISTS loyalty_points (
        patient_id TEXT PRIMARY KEY, points REAL DEFAULT 0, last_updated TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
        id          TEXT PRIMARY KEY,
        username    TEXT UNIQUE NOT NULL,
        password    TEXT NOT NULL,
        full_name   TEXT NOT NULL,
        role        TEXT DEFAULT 'صيدلاني',
        phone       TEXT,
        email       TEXT,
        created_at  TEXT,
        last_login  TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
        id        TEXT PRIMARY KEY,
        user_id   TEXT,
        action    TEXT,
        entity    TEXT,
        entity_id TEXT,
        timestamp TEXT,
        details   TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sales_date     ON sales(sale_date);
    CREATE INDEX IF NOT EXISTS idx_sales_year_seq ON sales(invoice_year, invoice_seq);
    CREATE INDEX IF NOT EXISTS idx_items_sale     ON sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_items_med      ON sale_items(med_id);
    CREATE INDEX IF NOT EXISTS idx_rx_date        ON prescriptions(date);
    CREATE INDEX IF NOT EXISTS idx_rx_patient     ON prescriptions(patient_id);
    CREATE INDEX IF NOT EXISTS idx_debts_status   ON debts(status,due_date);
    CREATE INDEX IF NOT EXISTS idx_batches_fefo   ON medicine_batches(medicine_id,expiry);
    CREATE INDEX IF NOT EXISTS idx_audit_ts       ON audit_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_entity   ON audit_log(entity, entity_id);
    """)

    # ── migrations ──
    def _add_col(table, col, typedef):
        cols = {r[1] for r in con.execute(f"PRAGMA table_info({table})").fetchall()}
        if col not in cols:
            con.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typedef}")

    _add_col("sales",     "invoice_seq",  "INTEGER DEFAULT 0")
    _add_col("sales",     "invoice_year", "INTEGER DEFAULT 0")
    _add_col("sales",     "voided_by",    "TEXT")
    _add_col("sales",     "voided_at",    "TEXT")
    _add_col("medicines", "is_active",         "INTEGER DEFAULT 1")
    _add_col("medicines", "scientific_name",   "TEXT")
    _add_col("medicines", "manufacturer",      "TEXT")
    _add_col("medicines", "batch_number",      "TEXT")
    _add_col("medicines", "company_barcode",   "TEXT")   # باركود الشركة المصنّعة
    _add_col("medicines", "pharmacy_barcode",  "TEXT")   # باركود الصيدلية الداخلي
    _add_col("medicines", "image_data",        "TEXT")   # صورة المنتج (base64)
    _add_col("medicines", "controlled",        "INTEGER DEFAULT 0")
    _add_col("medicines", "purchase_unit",     "TEXT")
    _add_col("medicines", "sale_unit",         "TEXT")
    _add_col("medicines", "conversion_factor", "INTEGER DEFAULT 1")
    _add_col("patients",  "is_active",    "INTEGER DEFAULT 1")
    _add_col("patients",  "insurance_company", "TEXT")
    _add_col("patients",  "policy_number",     "TEXT")
    _add_col("patients",  "coverage_pct",      "REAL DEFAULT 0")
    _add_col("suppliers", "is_active",    "INTEGER DEFAULT 1")
    _add_col("cash_sessions", "card_total",     "REAL DEFAULT 0")
    _add_col("cash_sessions", "transfer_total", "REAL DEFAULT 0")
    _add_col("cash_sessions", "credit_total",   "REAL DEFAULT 0")
    _add_col("cash_sessions", "actual_card",    "REAL DEFAULT 0")
    _add_col("cash_sessions", "actual_transfer","REAL DEFAULT 0")
    _add_col("cash_sessions", "actual_credit",  "REAL DEFAULT 0")
    _add_col("sales", "insurance_amount", "REAL DEFAULT 0")
    _add_col("sales", "patient_amount",   "REAL DEFAULT 0")
    _add_col("sales", "loyalty_discount", "REAL DEFAULT 0")
    con.execute("UPDATE medicines SET purchase_unit=COALESCE(NULLIF(purchase_unit,''),unit,'علبة')")
    con.execute("UPDATE medicines SET sale_unit=COALESCE(NULLIF(sale_unit,''),unit,'قرص')")
    con.execute("UPDATE medicines SET conversion_factor=1 WHERE conversion_factor IS NULL OR conversion_factor<1")
    # back-fill invoice_seq / invoice_year
    needs_fill = con.execute(
        "SELECT COUNT(*) FROM sales WHERE invoice_seq=0 AND invoice_num IS NOT NULL"
    ).fetchone()[0]
    if needs_fill:
        for row in con.execute("SELECT id,invoice_num FROM sales").fetchall():
            try:
                parts = row["invoice_num"].split("-")
                con.execute(
                    "UPDATE sales SET invoice_year=?,invoice_seq=? WHERE id=?",
                    (int(parts[1]), int(parts[2]), row["id"])
                )
            except Exception:
                pass

    con.commit()
    con.close()


# ══════════════════════════════════════════════════════════════
#  SEED
# ══════════════════════════════════════════════════════════════
def seed_if_empty():
    con = _conn()

    # ── users seed ──
    if con.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        today = date.today().isoformat()
        users = [
            (_new_id("U"), "admin",       _hash_password("admin123"),  "د. أحمد محمد",    "مدير النظام",    "0500000001", "admin@shifa.sa",    today, None),
            (_new_id("U"), "pharmacist",  _hash_password("123456"),    "خالد السعيد",      "صيدلاني مسؤول",  "0500000002", "khaled@shifa.sa",   today, None),
            (_new_id("U"), "assistant",   _hash_password("123456"),    "نورة القحطاني",    "مساعد صيدلي",    "0500000003", "noura@shifa.sa",    today, None),
        ]
        con.executemany(
            "INSERT INTO users(id,username,password,full_name,role,phone,email,created_at,last_login)"
            " VALUES(?,?,?,?,?,?,?,?,?)", users
        )
        con.commit()

    if con.execute("SELECT COUNT(*) FROM medicines").fetchone()[0] > 0:
        con.close(); return

    today     = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    two_days  = (date.today() - timedelta(days=2)).isoformat()
    year      = date.today().year

    medicines = [
        ("M001","أموكسيسيلين 500mg","مضادات حيوية",45,28,120,20,"كبسولة","S001","2026-08-01","6001000000001","A-1-2","مضاد حيوي واسع الطيف",1),
        ("M002","باراسيتامول 500mg","مسكنات",12,6,350,50,"قرص","S002","2027-03-15","6001000000002","A-2-1","مسكن ألم وخافض حرارة",1),
        ("M003","أوميبرازول 20mg","الجهاز الهضمي",38,22,85,15,"كبسولة","S001","2026-12-30","6001000000003","B-1-3","مثبط مضخة البروتون",1),
        ("M004","ميتفورمين 500mg","السكري",55,34,200,30,"قرص","S003","2026-09-20","6001000000004","C-2-1","علاج السكري من النوع الثاني",1),
        ("M005","أتورفاستاتين 10mg","القلب والأوعية",78,48,95,20,"قرص","S002","2027-01-10","6001000000005","C-1-4","لعلاج ارتفاع الكولسترول",1),
        ("M006","أملوديبين 5mg","القلب والأوعية",62,38,8,20,"قرص","S003","2026-11-05","6001000000006","C-1-5","لعلاج ارتفاع ضغط الدم",1),
        ("M007","فيتامين سي 1000mg","فيتامينات",28,15,280,40,"قرص","S004","2027-06-30","6001000000007","D-1-1","فيتامين سي فوار",1),
        ("M008","أنتاسيد جيل","الجهاز الهضمي",32,18,60,15,"علبة","S002","2026-10-15","6001000000008","B-2-2","لعلاج حموضة المعدة",1),
        ("M009","لوراتادين 10mg","الحساسية",35,20,5,15,"قرص","S001","2025-12-01","6001000000009","A-3-2","مضاد هيستامين",1),
        ("M010","إيبوبروفين 400mg","مسكنات",22,12,180,30,"قرص","S002","2027-04-20","6001000000010","A-2-3","مسكن ومضاد التهاب",1),
        ("M011","أزيثروميسين 250mg","مضادات حيوية",95,62,45,15,"كبسولة","S001","2026-07-30","6001000000011","A-1-3","مضاد حيوي للجهاز التنفسي",1),
        ("M012","غلوكوزامين 1500mg","مكملات",120,80,35,10,"قرص","S004","2027-02-28","6001000000012","D-2-1","لصحة المفاصل",1),
        ("M013","زنك 50mg","فيتامينات",18,9,400,60,"قرص","S004","2027-08-15","6001000000013","D-1-2","معدن الزنك",1),
        ("M014","أوميغا 3 1000mg","مكملات",95,58,110,20,"كبسولة","S004","2027-05-10","6001000000014","D-2-2","أحماض دهنية أوميغا 3",1),
        ("M015","بندازول 400mg","مضادات الطفيليات",28,15,70,15,"قرص","S003","2026-06-30","6001000000015","E-1-1","لعلاج الطفيليات المعوية",1),
    ]
    patients = [
        ("P001","محمد أحمد علي","0501234567",45,"ذكر","A+","بنسلين","ضغط دم - سكري","الرياض، حي النزهة","مريض منتظم","2024-01-15",1),
        ("P002","فاطمة حسن محمود","0551234567",32,"أنثى","O+","لا يوجد","حساسية موسمية","جدة، حي الروضة","","2024-02-20",1),
        ("P003","خالد عبدالله السعيد","0561234567",58,"ذكر","B+","سلفا","السكري - القلب","الدمام، حي الفيصلية","يأخذ ميتفورمين يومياً","2024-03-10",1),
        ("P004","نورة سالم القحطاني","0571234567",28,"أنثى","AB-","لا يوجد","لا يوجد","الرياض، حي المروج","","2024-04-05",1),
        ("P005","عمر يوسف الغامدي","0581234567",67,"ذكر","O-","أسبرين","كوليسترول - ضغط","مكة، حي العزيزية","مراجعة شهرية","2024-05-12",1),
        ("P006","سارة محمد الزهراني","0591234567",22,"أنثى","B-","لا يوجد","ربو","جدة، حي الحمراء","","2024-06-18",1),
    ]
    suppliers = [
        ("S001","شركة الدواء الحديث","عبدالرحمن الزهراني","0112345678","info@moderndrug.sa","الرياض، المنطقة الصناعية","300112345600003","30 يوم","نشط",5,45,"2026-07-15",1),
        ("S002","مستودع الشفاء الطبي","سامي العتيبي","0223456789","info@shifa-med.sa","جدة، حي الصناعية","300223456700004","15 يوم","نشط",4,38,"2026-07-20",1),
        ("S003","الوكيل الطبي الموحد","هاني الدوسري","0334567890","info@unified-med.sa","الدمام، المنطقة الصناعية","300334567800005","45 يوم","نشط",4,22,"2026-06-30",1),
        ("S004","توريدات الصحة والعافية","ليلى الشمري","0445678901","info@health-supply.sa","الرياض، حي العليا","300445678900006","30 يوم","غير نشط",3,15,"2026-05-10",1),
    ]

    con.executemany("INSERT INTO medicines(id,name,category,price,cost,stock,min_stock,unit,supplier_id,expiry,barcode,location,description,is_active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", medicines)
    con.executemany("INSERT INTO patients(id,name,phone,age,gender,blood_type,allergies,chronic_diseases,address,notes,created_at,is_active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",     patients)
    con.executemany("INSERT INTO suppliers(id,name,contact,phone,email,address,tax_num,payment_terms,status,rating,total_orders,last_order,is_active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", suppliers)

    sales_rows = [
        ("SL001","INV-2026-001",1,year,"P001","محمد أحمد علي",       79,  0,   3.95, 82.95, "نقدي",  "د. أحمد محمد",today,    "09:15","مكتمل",None,None),
        ("SL002","INV-2026-002",2,year,"P002","فاطمة حسن محمود",    119, 10,   5.45,114.45, "بطاقة", "د. أحمد محمد",today,    "10:30","مكتمل",None,None),
        ("SL003","INV-2026-003",3,year,"P003","خالد عبدالله السعيد",250,  0,  12.5, 262.5,  "نقدي",  "د. أحمد محمد",yesterday,"11:45","مكتمل",None,None),
        ("SL004","INV-2026-004",4,year,None,  "عميل عادي",           83,  5,   3.9,  81.9,  "نقدي",  "د. أحمد محمد",yesterday,"14:20","مكتمل",None,None),
        ("SL005","INV-2026-005",5,year,"P005","عمر يوسف الغامدي",  218,  0,  10.9, 228.9,  "تحويل", "د. أحمد محمد",two_days, "16:00","مكتمل",None,None),
        ("SL006","INV-2026-006",6,year,"P004","نورة سالم القحطاني",118,  0,   5.9, 123.9,  "بطاقة", "د. أحمد محمد",two_days, "09:00","مكتمل",None,None),
    ]
    con.executemany(
        "INSERT INTO sales(id,invoice_num,invoice_seq,invoice_year,patient_id,patient_name,"
        "subtotal,discount,tax,total,payment_method,cashier,sale_date,sale_time,status,voided_by,voided_at)"
        " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        sales_rows
    )
    con.executemany(
        "INSERT INTO sale_items(sale_id,med_id,name,qty,price,total) VALUES(?,?,?,?,?,?)",
        [
            ("SL001","M002","باراسيتامول 500mg",2,12,24),
            ("SL001","M004","ميتفورمين 500mg",1,55,55),
            ("SL002","M007","فيتامين سي 1000mg",3,28,84),
            ("SL002","M009","لوراتادين 10mg",1,35,35),
            ("SL003","M004","ميتفورمين 500mg",2,55,110),
            ("SL003","M005","أتورفاستاتين 10mg",1,78,78),
            ("SL003","M006","أملوديبين 5mg",1,62,62),
            ("SL004","M001","أموكسيسيلين 500mg",1,45,45),
            ("SL004","M003","أوميبرازول 20mg",1,38,38),
            ("SL005","M005","أتورفاستاتين 10mg",2,78,156),
            ("SL005","M006","أملوديبين 5mg",1,62,62),
            ("SL006","M007","فيتامين سي 1000mg",2,28,56),
            ("SL006","M013","زنك 50mg",1,18,18),
            ("SL006","M010","إيبوبروفين 400mg",2,22,44),
        ]
    )

    # ── seed حسابات افتراضية ──
    if con.execute("SELECT COUNT(*) FROM accounts").fetchone()[0] == 0:
        today = date.today().isoformat()
        accounts_seed = [
            (_new_id("AC"), "الصندوق الرئيسي",     "نقدي",     0.0, "الصندوق الرئيسي للصيدلية",        1, today),
            (_new_id("AC"), "البنك",                "بنكي",     0.0, "الحساب البنكي",                  1, today),
            (_new_id("AC"), "مصروفات التشغيل",      "مصروف",    0.0, "مصروفات الصيدلية اليومية",        1, today),
            (_new_id("AC"), "إيجار الصيدلية",       "مصروف",    0.0, "إيجار شهري",                     1, today),
            (_new_id("AC"), "رواتب الموظفين",       "مصروف",    0.0, "رواتب وأجور",                    1, today),
        ]
        con.executemany(
            "INSERT INTO accounts(id,name,type,balance,notes,is_active,created_at) VALUES(?,?,?,?,?,?,?)",
            accounts_seed
        )

    # ── seed موظف افتراضي ──
    if con.execute("SELECT COUNT(*) FROM employees").fetchone()[0] == 0:
        today = date.today().isoformat()
        con.execute(
            "INSERT INTO employees(id,full_name,role,phone,national_id,hire_date,salary,hourly_rate,is_active,notes)"
            " VALUES(?,?,?,?,?,?,?,?,?,?)",
            (_new_id("EMP"), "د. أحمد محمد", "صيدلاني مسؤول", "0500000001", "1234567890", today, 5000.0, 30.0, 1, "")
        )

    con.commit()
    con.close()


# ══════════════════════════════════════════════════════════════
#  API CLASS
# ══════════════════════════════════════════════════════════════
class PharmacyAPI:

    # ── MEDICINES ─────────────────────────────────────────────
    def get_medicines(self):
        con  = _conn()
        # FIX [1.5]: only return active medicines
        rows = _rows(con.execute(
            "SELECT * FROM medicines WHERE is_active=1 ORDER BY name"))
        con.close(); return _ok(rows)

    def get_medicine(self, mid: str):
        con = _conn()
        row = con.execute("SELECT * FROM medicines WHERE id=?", (mid,)).fetchone()
        con.close(); return _ok(dict(row) if row else None)

    def get_medicine_by_barcode(self, barcode: str):
        """أولوية المطابقة: باركود الصيدلية ثم الشركة ثم الباركود القديم."""
        con = _conn()
        row = con.execute(
            "SELECT * FROM medicines WHERE is_active=1 AND "
            "(pharmacy_barcode=? OR company_barcode=? OR barcode=?) "
            "ORDER BY CASE WHEN pharmacy_barcode=? THEN 1 "
            "WHEN company_barcode=? THEN 2 ELSE 3 END LIMIT 1",
            (barcode, barcode, barcode, barcode, barcode)
        ).fetchone()
        con.close(); return _ok(dict(row) if row else None)

    def add_medicine(self, data: str, user_id: str = None):
        try:
            d   = json.loads(data)
            con = _conn()
            # FIX [1.7]: barcode uniqueness check
            barcode = d.get("barcode", "").strip()
            company_barcode  = d.get("company_barcode",  "").strip()
            pharmacy_barcode = d.get("pharmacy_barcode", "").strip()
            if barcode:
                dup = con.execute(
                    "SELECT name FROM medicines WHERE barcode=? AND id!='' AND is_active=1",
                    (barcode,)
                ).fetchone()
                if dup:
                    con.close()
                    return _err(f"الباركود '{barcode}' مستخدم بالفعل للدواء: {dup['name']}")
            if company_barcode:
                dup = con.execute(
                    "SELECT name FROM medicines WHERE company_barcode=? AND is_active=1",
                    (company_barcode,)
                ).fetchone()
                if dup:
                    con.close()
                    return _err(f"باركود الشركة '{company_barcode}' مستخدم بالفعل للدواء: {dup['name']}")
            if pharmacy_barcode:
                dup = con.execute(
                    "SELECT name FROM medicines WHERE pharmacy_barcode=? AND is_active=1",
                    (pharmacy_barcode,)
                ).fetchone()
                if dup:
                    con.close()
                    return _err(f"باركود الصيدلية '{pharmacy_barcode}' مستخدم بالفعل للدواء: {dup['name']}")
            nid = _new_id("M")
            con.execute(
                "INSERT INTO medicines(id,name,scientific_name,manufacturer,batch_number,category,price,cost,stock,min_stock,"
                "unit,supplier_id,expiry,barcode,company_barcode,pharmacy_barcode,location,description,image_data,"
                "controlled,purchase_unit,sale_unit,conversion_factor,is_active)"
                " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)",
                (nid, d.get("name"), d.get("scientific_name"), d.get("manufacturer"), d.get("batch_number"), d.get("category"), d.get("price",0),
                 d.get("cost",0), d.get("stock",0), d.get("min_stock",10),
                 d.get("unit","قرص"), d.get("supplier_id"), d.get("expiry"),
                 barcode or None, company_barcode or None, pharmacy_barcode or None,
                 d.get("location"), d.get("description"), d.get("image_data"),
                 1 if d.get("controlled") else 0, d.get("purchase_unit") or d.get("unit") or "علبة",
                 d.get("sale_unit") or d.get("unit") or "قرص", max(1, int(d.get("conversion_factor") or 1)))
            )
            _audit(con, user_id, "ADD", "medicine", nid, d.get("name",""))
            con.commit(); con.close(); return _ok(nid)
        except Exception as e: return _err(str(e))

    def update_medicine(self, mid: str, data: str, user_id: str = None):
        try:
            d   = json.loads(data)
            con = _conn()
            # FIX [1.7]: barcode uniqueness on update
            barcode          = d.get("barcode",          "").strip()
            company_barcode  = d.get("company_barcode",  "").strip()
            pharmacy_barcode = d.get("pharmacy_barcode", "").strip()
            if barcode:
                dup = con.execute(
                    "SELECT name FROM medicines WHERE barcode=? AND id!=? AND is_active=1",
                    (barcode, mid)
                ).fetchone()
                if dup:
                    con.close()
                    return _err(f"الباركود '{barcode}' مستخدم بالفعل للدواء: {dup['name']}")
            if company_barcode:
                dup = con.execute(
                    "SELECT name FROM medicines WHERE company_barcode=? AND id!=? AND is_active=1",
                    (company_barcode, mid)
                ).fetchone()
                if dup:
                    con.close()
                    return _err(f"باركود الشركة '{company_barcode}' مستخدم بالفعل للدواء: {dup['name']}")
            if pharmacy_barcode:
                dup = con.execute(
                    "SELECT name FROM medicines WHERE pharmacy_barcode=? AND id!=? AND is_active=1",
                    (pharmacy_barcode, mid)
                ).fetchone()
                if dup:
                    con.close()
                    return _err(f"باركود الصيدلية '{pharmacy_barcode}' مستخدم بالفعل للدواء: {dup['name']}")
            old = con.execute("SELECT price FROM medicines WHERE id=?", (mid,)).fetchone()
            old_price = old["price"] if old else None
            con.execute(
                "UPDATE medicines SET name=?,scientific_name=?,manufacturer=?,batch_number=?,category=?,price=?,cost=?,stock=?,"
                "min_stock=?,unit=?,supplier_id=?,expiry=?,barcode=?,company_barcode=?,pharmacy_barcode=?,"
                "location=?,description=?,image_data=?,controlled=?,purchase_unit=?,sale_unit=?,conversion_factor=?"
                " WHERE id=?",
                (d.get("name"), d.get("scientific_name"), d.get("manufacturer"), d.get("batch_number"),
                 d.get("category"), d.get("price"), d.get("cost"),
                 d.get("stock"), d.get("min_stock"), d.get("unit"), d.get("supplier_id"),
                 d.get("expiry"), barcode or None, company_barcode or None, pharmacy_barcode or None,
                 d.get("location"), d.get("description"), d.get("image_data"),
                 1 if d.get("controlled") else 0, d.get("purchase_unit") or d.get("unit") or "علبة",
                 d.get("sale_unit") or d.get("unit") or "قرص", max(1, int(d.get("conversion_factor") or 1)), mid)
            )
            details = ""
            if old_price and old_price != d.get("price"):
                details = f"تغيير السعر: {old_price} → {d.get('price')}"
            _audit(con, user_id, "UPDATE", "medicine", mid, details or d.get("name",""))
            con.commit(); con.close(); return _ok()
        except Exception as e: return _err(str(e))

    def delete_medicine(self, mid: str, user_id: str = None):
        # FIX [1.5]: orphan-safe — check sale_items references, archive if used
        try:
            con = _conn()
            row = con.execute("SELECT name FROM medicines WHERE id=?", (mid,)).fetchone()
            if not row:
                con.close(); return _err("الدواء غير موجود")
            name = row["name"]
            linked = con.execute(
                "SELECT COUNT(*) FROM sale_items WHERE med_id=?", (mid,)
            ).fetchone()[0]
            if linked:
                # Archive instead of delete
                con.execute("UPDATE medicines SET is_active=0 WHERE id=?", (mid,))
                _audit(con, user_id, "ARCHIVE", "medicine", mid, f"{name} — له {linked} سجل مبيعات")
                con.commit(); con.close()
                return _ok({"archived": True, "message":
                    f"تم أرشفة '{name}' بدلاً من حذفه لأنه مرتبط بـ {linked} فاتورة مبيعات."})
            con.execute("DELETE FROM medicines WHERE id=?", (mid,))
            _audit(con, user_id, "DELETE", "medicine", mid, name)
            con.commit(); con.close(); return _ok({"archived": False})
        except Exception as e: return _err(str(e))

    def get_low_stock(self):
        con  = _conn()
        rows = _rows(con.execute(
            "SELECT * FROM medicines WHERE is_active=1 AND stock>0 AND stock<=min_stock ORDER BY stock"))
        con.close(); return _ok(rows)

    def get_expiring(self):
        cutoff = (date.today() + timedelta(days=90)).isoformat()
        con    = _conn()
        rows   = _rows(con.execute(
            "SELECT * FROM medicines WHERE is_active=1 AND expiry<=? AND stock>0 ORDER BY expiry",
            (cutoff,)))
        con.close(); return _ok(rows)

    def get_categories(self):
        con  = _conn()
        rows = [r[0] for r in con.execute(
            "SELECT DISTINCT category FROM medicines WHERE is_active=1 ORDER BY category"
        ).fetchall()]
        con.close(); return _ok(rows)

    # ── PATIENTS ──────────────────────────────────────────────
    def get_patients(self):
        con  = _conn()
        rows = _rows(con.execute(
            "SELECT * FROM patients WHERE is_active=1 ORDER BY name"))
        con.close(); return _ok(rows)

    def get_patient(self, pid: str):
        con = _conn()
        row = con.execute("SELECT * FROM patients WHERE id=?", (pid,)).fetchone()
        con.close(); return _ok(dict(row) if row else None)

    def add_patient(self, data: str, user_id: str = None):
        try:
            d, con = json.loads(data), _conn()
            nid = _new_id("P")
            con.execute(
                "INSERT INTO patients(id,name,phone,age,gender,blood_type,allergies,"
                "chronic_diseases,address,notes,created_at,insurance_company,policy_number,coverage_pct,is_active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)",
                (nid, d.get("name"), d.get("phone"), d.get("age"), d.get("gender"),
                 d.get("blood_type"), d.get("allergies"), d.get("chronic_diseases"),
                 d.get("address"), d.get("notes"), date.today().isoformat(),d.get("insurance_company"),d.get("policy_number"),d.get("coverage_pct",0))
            )
            _audit(con, user_id, "ADD", "patient", nid, d.get("name",""))
            con.commit(); con.close(); return _ok(nid)
        except Exception as e: return _err(str(e))

    def update_patient(self, pid: str, data: str, user_id: str = None):
        try:
            d, con = json.loads(data), _conn()
            con.execute(
                "UPDATE patients SET name=?,phone=?,age=?,gender=?,blood_type=?,"
                "allergies=?,chronic_diseases=?,address=?,notes=?,insurance_company=?,policy_number=?,coverage_pct=? WHERE id=?",
                (d.get("name"), d.get("phone"), d.get("age"), d.get("gender"),
                 d.get("blood_type"), d.get("allergies"), d.get("chronic_diseases"),
                 d.get("address"), d.get("notes"),d.get("insurance_company"),d.get("policy_number"),d.get("coverage_pct",0), pid)
            )
            _audit(con, user_id, "UPDATE", "patient", pid, d.get("name",""))
            con.commit(); con.close(); return _ok()
        except Exception as e: return _err(str(e))

    def delete_patient(self, pid: str, user_id: str = None):
        # FIX [1.5]: orphan-safe delete — archive if has sales history
        try:
            con = _conn()
            row = con.execute("SELECT name FROM patients WHERE id=?", (pid,)).fetchone()
            if not row:
                con.close(); return _err("المريض غير موجود")
            name = row["name"]
            linked = con.execute(
                "SELECT COUNT(*) FROM sales WHERE patient_id=?", (pid,)
            ).fetchone()[0]
            if linked:
                con.execute("UPDATE patients SET is_active=0 WHERE id=?", (pid,))
                _audit(con, user_id, "ARCHIVE", "patient", pid,
                       f"{name} — له {linked} فاتورة")
                con.commit(); con.close()
                return _ok({"archived": True, "message":
                    f"تم أرشفة '{name}' بدلاً من حذفه لأنه مرتبط بـ {linked} فاتورة مبيعات."})
            con.execute("DELETE FROM patients WHERE id=?", (pid,))
            _audit(con, user_id, "DELETE", "patient", pid, name)
            con.commit(); con.close(); return _ok({"archived": False})
        except Exception as e: return _err(str(e))

    # ── SUPPLIERS ─────────────────────────────────────────────
    def get_suppliers(self):
        con  = _conn()
        rows = _rows(con.execute(
            "SELECT * FROM suppliers WHERE is_active=1 ORDER BY name"))
        con.close(); return _ok(rows)

    def get_supplier(self, sid: str):
        con = _conn()
        row = con.execute("SELECT * FROM suppliers WHERE id=?", (sid,)).fetchone()
        con.close(); return _ok(dict(row) if row else None)

    def add_supplier(self, data: str, user_id: str = None):
        try:
            d, con = json.loads(data), _conn()
            nid = _new_id("S")
            con.execute(
                "INSERT INTO suppliers(id,name,contact,phone,email,address,tax_num,"
                "payment_terms,status,rating,total_orders,last_order,is_active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1)",
                (nid, d.get("name"), d.get("contact"), d.get("phone"),
                 d.get("email"), d.get("address"), d.get("tax_num"),
                 d.get("payment_terms","30 يوم"), d.get("status","نشط"),
                 d.get("rating",3), 0, None)
            )
            _audit(con, user_id, "ADD", "supplier", nid, d.get("name",""))
            con.commit(); con.close(); return _ok(nid)
        except Exception as e: return _err(str(e))

    def update_supplier(self, sid: str, data: str, user_id: str = None):
        try:
            d, con = json.loads(data), _conn()
            con.execute(
                "UPDATE suppliers SET name=?,contact=?,phone=?,email=?,address=?,"
                "tax_num=?,payment_terms=?,status=?,rating=? WHERE id=?",
                (d.get("name"), d.get("contact"), d.get("phone"), d.get("email"),
                 d.get("address"), d.get("tax_num"), d.get("payment_terms"),
                 d.get("status"), d.get("rating"), sid)
            )
            _audit(con, user_id, "UPDATE", "supplier", sid, d.get("name",""))
            con.commit(); con.close(); return _ok()
        except Exception as e: return _err(str(e))

    def delete_supplier(self, sid: str, user_id: str = None):
        # FIX [1.5]: orphan-safe — check linked medicines
        try:
            con = _conn()
            row = con.execute("SELECT name FROM suppliers WHERE id=?", (sid,)).fetchone()
            if not row:
                con.close(); return _err("المورد غير موجود")
            name = row["name"]
            linked = con.execute(
                "SELECT COUNT(*) FROM medicines WHERE supplier_id=? AND is_active=1", (sid,)
            ).fetchone()[0]
            if linked:
                con.execute("UPDATE suppliers SET is_active=0 WHERE id=?", (sid,))
                _audit(con, user_id, "ARCHIVE", "supplier", sid,
                       f"{name} — مرتبط بـ {linked} دواء")
                con.commit(); con.close()
                return _ok({"archived": True, "message":
                    f"تم أرشفة '{name}' بدلاً من حذفه لأنه مورّد لـ {linked} دواء."})
            con.execute("DELETE FROM suppliers WHERE id=?", (sid,))
            _audit(con, user_id, "DELETE", "supplier", sid, name)
            con.commit(); con.close(); return _ok({"archived": False})
        except Exception as e: return _err(str(e))

    # ── SALES ─────────────────────────────────────────────────
    def get_sales(self):
        con   = _conn()
        sales = _rows(con.execute(
            "SELECT * FROM sales ORDER BY sale_date DESC, sale_time DESC"))
        for s in sales:
            s["items"] = _rows(con.execute(
                "SELECT * FROM sale_items WHERE sale_id=?", (s["id"],)))
        con.close(); return _ok(sales)

    def get_sale(self, sale_id: str):
        con = _conn()
        row = con.execute("SELECT * FROM sales WHERE id=?", (sale_id,)).fetchone()
        if not row: con.close(); return _ok(None)
        s = dict(row)
        s["items"] = _rows(con.execute(
            "SELECT * FROM sale_items WHERE sale_id=?", (sale_id,)))
        con.close(); return _ok(s)

    def add_sale(self, data: str, user_id: str = None):
        # FIX [1.2]: stock pre-check + atomic rollback
        # FIX [1.6]: BEGIN IMMEDIATE for atomic invoice numbering
        try:
            d   = json.loads(data)
            con = sqlite3.connect(DB_PATH)
            con.row_factory = sqlite3.Row
            con.execute("PRAGMA foreign_keys=ON")
            con.execute("BEGIN IMMEDIATE")           # FIX [1.6]: atomic lock

            # ── FIX [1.2]: validate stock for ALL items before any INSERT ──
            items = d.get("items", [])
            controlled_items = []
            for item in items:
                med_row = con.execute(
                    "SELECT name, stock, controlled FROM medicines WHERE id=? AND is_active=1",
                    (item["medId"],)
                ).fetchone()
                if not med_row:
                    con.rollback(); con.close()
                    return _err(f"الدواء '{item.get('name',item['medId'])}' غير موجود في قاعدة البيانات")
                if med_row["stock"] < item["qty"]:
                    con.rollback(); con.close()
                    return _err(
                        f"المخزون غير كافٍ للدواء '{med_row['name']}': "
                        f"المتاح {med_row['stock']}، المطلوب {item['qty']}"
                    )
                if med_row["controlled"]:
                    controlled_items.append(med_row["name"])

            prescription = d.get("prescription") or {}
            if controlled_items:
                missing = [key for key in ("doctor_name", "doctor_license", "prescription_type")
                           if not str(prescription.get(key, "")).strip()]
                if missing:
                    con.rollback(); con.close()
                    return _err("لا يمكن بيع دواء خاضع للرقابة بدون روشتة مكتملة: " + "، ".join(controlled_items))

            nid = _new_id("SL")
            inv, seq, yr = _next_invoice(con)   # safe inside IMMEDIATE
            now    = datetime.now()
            s_date = now.strftime("%Y-%m-%d")
            s_time = now.strftime("%H:%M")

            total_due = float(d.get("total", 0) or 0)
            insurance_amount = 0.0
            patient_amount = total_due
            if d.get("patient_id"):
                patient_row = con.execute("SELECT coverage_pct FROM patients WHERE id=?", (d.get("patient_id"),)).fetchone()
                coverage = max(0, min(100, float(patient_row["coverage_pct"] or 0))) if patient_row else 0
                insurance_amount = round(total_due * coverage / 100, 2)
                patient_amount = round(total_due - insurance_amount, 2)
            loyalty_discount = 0.0
            if d.get("use_loyalty") and d.get("patient_id"):
                lp = con.execute("SELECT points FROM loyalty_points WHERE patient_id=?", (d.get("patient_id"),)).fetchone()
                valrow = con.execute("SELECT value FROM settings WHERE key='loyalty_point_value'").fetchone()
                point_value = max(0, float(valrow[0] if valrow else 1))
                available = float(lp["points"] if lp else 0)
                loyalty_discount = round(min(patient_amount, available * point_value), 2)
                used_points = loyalty_discount / point_value if point_value else 0
                if used_points:
                    con.execute("UPDATE loyalty_points SET points=MAX(0,points-?),last_updated=? WHERE patient_id=?",
                                (used_points,now.isoformat(),d.get("patient_id")))
                    patient_amount = round(patient_amount-loyalty_discount,2)
                    total_due = round(total_due-loyalty_discount,2)

            con.execute(
                "INSERT INTO sales(id,invoice_num,invoice_seq,invoice_year,"
                "patient_id,patient_name,subtotal,discount,tax,total,"
                "payment_method,cashier,sale_date,sale_time,status,insurance_amount,patient_amount,loyalty_discount)"
                " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (nid, inv, seq, yr,
                 d.get("patient_id"), d.get("patient_name"),
                 d.get("subtotal"), d.get("discount",0), d.get("tax",0), total_due,
                 d.get("payment_method","نقدي"), d.get("cashier",""),
                 s_date, s_time, "مكتمل",insurance_amount,patient_amount,loyalty_discount)
            )
            for item in items:
                con.execute(
                    "INSERT INTO sale_items(sale_id,med_id,name,qty,price,total)"
                    " VALUES(?,?,?,?,?,?)",
                    (nid, item["medId"], item["name"], item["qty"],
                     item["price"], item["total"])
                )
                con.execute(
                    "UPDATE medicines SET stock = stock - ? WHERE id=?",
                    (item["qty"], item["medId"])
                )
                # FEFO: الخصم من أقرب دفعة انتهاءً أولاً إن كانت الدفعات مسجلة.
                remaining = int(item["qty"])
                batches = con.execute(
                    "SELECT id,qty FROM medicine_batches WHERE medicine_id=? AND qty>0 "
                    "ORDER BY CASE WHEN expiry IS NULL OR expiry='' THEN 1 ELSE 0 END, expiry, received_date",
                    (item["medId"],)
                ).fetchall()
                for batch in batches:
                    if remaining <= 0: break
                    take = min(remaining, int(batch["qty"]))
                    con.execute("UPDATE medicine_batches SET qty=qty-? WHERE id=?", (take, batch["id"]))
                    remaining -= take
            if prescription:
                rx_id = _new_id("RX")
                con.execute(
                    "INSERT INTO prescriptions(id,patient_id,doctor_name,doctor_license,prescription_type,"
                    "sale_id,date,image_data,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (rx_id, d.get("patient_id"), str(prescription.get("doctor_name", "")).strip(),
                     str(prescription.get("doctor_license", "")).strip(),
                     str(prescription.get("prescription_type", "عادية")).strip(), nid,
                     prescription.get("date") or s_date, prescription.get("image_data"),
                     user_id or "system", now.isoformat())
                )
                _audit(con, user_id, "ADD_PRESCRIPTION", "prescription", rx_id, f"فاتورة {inv}")
            if d.get("payment_method") == "آجل":
                if not d.get("patient_id"):
                    con.rollback(); con.close(); return _err("البيع الآجل يتطلب اختيار مريض")
                debt_id = _new_id("DEBT")
                con.execute(
                    "INSERT INTO debts(id,patient_id,sale_id,amount,paid_amount,due_date,status,notes,created_at,updated_at) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (debt_id,d.get("patient_id"),nid,patient_amount,0,d.get("due_date") or (date.today()+timedelta(days=30)).isoformat(),
                     "مستحق",d.get("debt_notes",""),now.isoformat(),now.isoformat())
                )
                _audit(con,user_id,"ADD_DEBT","debt",debt_id,inv)

            # نقاط ولاء قابلة للتخصيص (الافتراضي نقطة لكل 100 من العملة).
            if d.get("patient_id"):
                setting = con.execute("SELECT value FROM settings WHERE key='loyalty_amount_per_point'").fetchone()
                threshold = max(1, float(setting[0] if setting else 100))
                earned = patient_amount / threshold
                con.execute("INSERT INTO loyalty_points(patient_id,points,last_updated) VALUES(?,?,?) "
                            "ON CONFLICT(patient_id) DO UPDATE SET points=points+excluded.points,last_updated=excluded.last_updated",
                            (d.get("patient_id"),earned,now.isoformat()))
            _audit(con, user_id, "ADD_SALE", "sale", nid, inv)
            con.commit(); con.close()
            return _ok({"id": nid, "invoiceNum": inv, "date": s_date, "time": s_time,
                        "total":total_due,"patientAmount":patient_amount,"insuranceAmount":insurance_amount,
                        "loyaltyDiscount":loyalty_discount})
        except Exception as e:
            try: con.rollback(); con.close()
            except Exception: pass
            return _err(str(e))

    def get_prescriptions_report(self, month: str = ""):
        """تقرير الفواتير المرتبطة بروشتات لشهر YYYY-MM."""
        month = (month or date.today().strftime("%Y-%m"))[:7]
        con = _conn()
        rows = _rows(con.execute(
            "SELECT p.*,s.invoice_num,s.patient_name,s.total,s.payment_method,s.cashier "
            "FROM prescriptions p JOIN sales s ON s.id=p.sale_id "
            "WHERE substr(p.date,1,7)=? ORDER BY p.date DESC,s.sale_time DESC", (month,)
        ))
        con.close()
        return _ok({"month": month, "count": len(rows), "items": rows})

    def get_top_selling_meds(self, limit: int = 50):
        con = _conn()
        rows = _rows(con.execute(
            "SELECT m.*,COALESCE(SUM(CASE WHEN s.status='مكتمل' THEN si.qty ELSE 0 END),0) sold_qty "
            "FROM medicines m LEFT JOIN sale_items si ON si.med_id=m.id LEFT JOIN sales s ON s.id=si.sale_id "
            "WHERE m.is_active=1 GROUP BY m.id ORDER BY sold_qty DESC,m.name LIMIT ?", (max(1,min(int(limit),500)),)
        ))
        con.close(); return _ok(rows)

    def search_medicines(self, query: str):
        q = f"%{(query or '').strip()}%"
        con = _conn()
        rows = _rows(con.execute(
            "SELECT * FROM medicines WHERE is_active=1 AND (name LIKE ? OR scientific_name LIKE ? OR "
            "pharmacy_barcode LIKE ? OR company_barcode LIKE ? OR barcode LIKE ?) ORDER BY name LIMIT 100",
            (q,q,q,q,q)
        ))
        con.close(); return _ok(rows)

    def get_debts(self, overdue_only: bool = False):
        con=_conn(); where="WHERE d.status!='مسدد'"
        if overdue_only: where += " AND d.due_date<date('now')"
        rows=_rows(con.execute(
            f"SELECT d.*,p.name patient_name,p.phone FROM debts d LEFT JOIN patients p ON p.id=d.patient_id {where} ORDER BY d.due_date,d.created_at DESC"))
        con.close(); return _ok(rows)

    def pay_debt(self, debt_id: str, amount: float, user_id: str = None):
        try:
            amount=float(amount); con=_conn()
            row=con.execute("SELECT * FROM debts WHERE id=?",(debt_id,)).fetchone()
            if not row: con.close(); return _err("سجل الدين غير موجود")
            remaining=float(row["amount"])-float(row["paid_amount"])
            if amount<=0 or amount>remaining: con.close(); return _err("قيمة الدفعة غير صحيحة")
            paid=float(row["paid_amount"])+amount; status="مسدد" if paid>=float(row["amount"]) else "مسدد جزئياً"
            con.execute("UPDATE debts SET paid_amount=?,status=?,updated_at=? WHERE id=?",(paid,status,datetime.now().isoformat(),debt_id))
            _audit(con,user_id,"PAY_DEBT","debt",debt_id,f"دفعة {amount} — {status}")
            con.commit(); con.close(); return _ok({"paid_amount":paid,"status":status})
        except Exception as e: return _err(str(e))

    def get_patient_debt(self, patient_id: str):
        con=_conn(); row=con.execute("SELECT COALESCE(SUM(amount-paid_amount),0) balance FROM debts WHERE patient_id=? AND status!='مسدد'",(patient_id,)).fetchone(); con.close()
        return _ok({"balance":float(row["balance"] or 0)})

    def import_medicines(self, csv_text: str, user_id: str = None):
        required={"name","scientific_name","category","barcode","price","cost","stock","unit","expiry","location","min_stock"}
        saved=[]; rejected=[]
        try:
            reader=csv.DictReader(io.StringIO(csv_text or ""))
            if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
                return _err("أعمدة CSV غير مطابقة للقالب المطلوب")
            con=_conn()
            for line,row in enumerate(reader,start=2):
                try:
                    missing=[k for k in required if not str(row.get(k,"")).strip()]
                    if missing: raise ValueError("بيانات ناقصة: "+"، ".join(missing))
                    if con.execute("SELECT 1 FROM medicines WHERE barcode=? AND is_active=1",(row["barcode"].strip(),)).fetchone(): raise ValueError("باركود مكرر")
                    mid=_new_id("M")
                    con.execute("INSERT INTO medicines(id,name,scientific_name,category,barcode,price,cost,stock,unit,sale_unit,purchase_unit,conversion_factor,expiry,location,min_stock,is_active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)",
                                (mid,row["name"].strip(),row["scientific_name"].strip(),row["category"].strip(),row["barcode"].strip(),float(row["price"]),float(row["cost"]),int(row["stock"]),row["unit"].strip(),row["unit"].strip(),row["unit"].strip(),1,row["expiry"].strip(),row["location"].strip(),int(row["min_stock"])))
                    saved.append({"line":line,"id":mid})
                except Exception as exc: rejected.append({"line":line,"reason":str(exc)})
            _audit(con,user_id,"IMPORT_CSV","medicine","bulk",f"محفوظ {len(saved)}، مرفوض {len(rejected)}")
            con.commit(); con.close(); return _ok({"saved":len(saved),"rejected":len(rejected),"errors":rejected})
        except Exception as e: return _err(str(e))

    def get_turnover_report(self, days: int = 30):
        days=max(1,min(int(days),365)); con=_conn()
        rows=_rows(con.execute(
            "SELECT m.id,m.name,m.stock,COALESCE(SUM(CASE WHEN s.sale_date>=date('now',?) AND s.status='مكتمل' THEN si.qty ELSE 0 END),0) sold "
            "FROM medicines m LEFT JOIN sale_items si ON si.med_id=m.id LEFT JOIN sales s ON s.id=si.sale_id "
            "WHERE m.is_active=1 GROUP BY m.id ORDER BY sold DESC",(f'-{days} days',)))
        for r in rows:
            avg=max(1,float(r["stock"])+float(r["sold"])/2); r["turnover_rate"]=round(float(r["sold"])/avg*30/days,3)
            r["classification"]="سريع" if r["turnover_rate"]>=1 else ("راكد" if r["turnover_rate"]<0.2 else "متوسط")
        con.close(); return _ok(rows)

    def get_loyalty(self, patient_id: str):
        con=_conn(); row=con.execute("SELECT points,last_updated FROM loyalty_points WHERE patient_id=?",(patient_id,)).fetchone(); con.close()
        return _ok(dict(row) if row else {"points":0,"last_updated":None})

    def get_insurance_report(self, month: str = ""):
        month=(month or date.today().strftime("%Y-%m"))[:7]; con=_conn()
        rows=_rows(con.execute("SELECT s.invoice_num,s.sale_date,s.patient_name,s.total,s.insurance_amount,s.patient_amount,p.insurance_company,p.policy_number FROM sales s LEFT JOIN patients p ON p.id=s.patient_id WHERE s.status='مكتمل' AND substr(s.sale_date,1,7)=? AND s.insurance_amount>0 ORDER BY s.sale_date DESC",(month,)))
        total=sum(float(r["insurance_amount"] or 0) for r in rows); con.close()
        return _ok({"month":month,"total":round(total,2),"items":rows})

    def void_sale(self, sale_id: str, user_id: str = None):
        # FIX [1.4]: void invoice and restore stock
        try:
            con = _conn()
            row = con.execute("SELECT * FROM sales WHERE id=?", (sale_id,)).fetchone()
            if not row:
                con.close(); return _err("الفاتورة غير موجودة")
            if row["status"] == "ملغاة":
                con.close(); return _err("هذه الفاتورة ملغاة بالفعل")
            # restore stock
            items = _rows(con.execute(
                "SELECT med_id, qty FROM sale_items WHERE sale_id=?", (sale_id,)))
            for item in items:
                con.execute(
                    "UPDATE medicines SET stock = stock + ? WHERE id=?",
                    (item["qty"], item["med_id"])
                )
            now = datetime.now().isoformat()
            con.execute(
                "UPDATE sales SET status='ملغاة', voided_by=?, voided_at=? WHERE id=?",
                (user_id or "system", now, sale_id)
            )
            _audit(con, user_id, "VOID_SALE", "sale", sale_id,
                   f"إلغاء {row['invoice_num']}")
            con.commit(); con.close()
            return _ok({"invoiceNum": row["invoice_num"]})
        except Exception as e: return _err(str(e))

    # ── STATS ─────────────────────────────────────────────────
    def get_stats(self):
        con   = _conn()
        today = date.today().isoformat()
        month = today[:7]

        total_meds      = con.execute("SELECT COUNT(*) FROM medicines WHERE is_active=1").fetchone()[0]
        low_stock       = con.execute(
            "SELECT COUNT(*) FROM medicines WHERE is_active=1 AND stock>0 AND stock<=min_stock").fetchone()[0]
        out_of_stock    = con.execute(
            "SELECT COUNT(*) FROM medicines WHERE is_active=1 AND stock=0").fetchone()[0]
        expiring        = con.execute(
            "SELECT COUNT(*) FROM medicines WHERE is_active=1 AND expiry<=date('now','+90 days') AND stock>0").fetchone()[0]
        total_patients  = con.execute("SELECT COUNT(*) FROM patients WHERE is_active=1").fetchone()[0]
        total_suppliers = con.execute("SELECT COUNT(*) FROM suppliers WHERE is_active=1").fetchone()[0]
        total_sales     = con.execute("SELECT COUNT(*) FROM sales").fetchone()[0]
        total_revenue   = con.execute("SELECT COALESCE(SUM(total),0) FROM sales WHERE status='مكتمل'").fetchone()[0]
        today_row = con.execute(
            "SELECT COUNT(*),COALESCE(SUM(total),0) FROM sales WHERE sale_date=? AND status='مكتمل'",
            (today,)).fetchone()
        month_row = con.execute(
            "SELECT COALESCE(SUM(total),0) FROM sales WHERE sale_date LIKE ? AND status='مكتمل'",
            (month+'%',)).fetchone()
        con.close()
        return _ok({
            "totalMeds": total_meds, "lowStock": low_stock,
            "outOfStock": out_of_stock, "expiring": expiring,
            "totalPatients": total_patients, "totalSuppliers": total_suppliers,
            "todayCount": today_row[0], "todayRevenue": today_row[1],
            "monthRevenue": month_row[0], "totalSales": total_sales,
            "totalRevenue": total_revenue,
        })

    def get_dashboard_report(self, from_date: str = None, to_date: str = None):
        """Operational sales summary for an explicit inclusive date range."""
        try:
            today = date.today()
            start = date.fromisoformat(from_date) if from_date else today.replace(day=1)
            end = date.fromisoformat(to_date) if to_date else today
        except (TypeError, ValueError):
            return _err("صيغة التاريخ غير صحيحة")

        if start > end:
            return _err("تاريخ البداية يجب أن يسبق تاريخ النهاية")
        if (end - start).days > 730:
            return _err("الحد الأقصى للفترة هو سنتان")

        start_s, end_s = start.isoformat(), end.isoformat()
        con = _conn()
        try:
            summary = con.execute(
                "SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS revenue, "
                "COALESCE(AVG(total),0) AS average, COALESCE(SUM(discount),0) AS discount, "
                "COALESCE(SUM(tax),0) AS tax "
                "FROM sales WHERE status='مكتمل' AND sale_date BETWEEN ? AND ?",
                (start_s, end_s),
            ).fetchone()

            cost = con.execute(
                "SELECT COALESCE(SUM(si.qty * COALESCE(m.cost,0)),0) "
                "FROM sale_items si JOIN sales s ON s.id=si.sale_id "
                "LEFT JOIN medicines m ON m.id=si.med_id "
                "WHERE s.status='مكتمل' AND s.sale_date BETWEEN ? AND ?",
                (start_s, end_s),
            ).fetchone()[0]

            span_days = (end - start).days + 1
            bucket_sql = "s.sale_date" if span_days <= 62 else "substr(s.sale_date,1,7)"
            series_rows = con.execute(
                f"SELECT {bucket_sql} AS bucket, COALESCE(SUM(s.total),0) AS revenue "
                "FROM sales s WHERE s.status='مكتمل' AND s.sale_date BETWEEN ? AND ? "
                "GROUP BY bucket ORDER BY bucket",
                (start_s, end_s),
            ).fetchall()

            top = _rows(con.execute(
                "SELECT si.name, SUM(si.qty) AS qty, SUM(si.total) AS revenue "
                "FROM sale_items si JOIN sales s ON s.id=si.sale_id "
                "WHERE s.status='مكتمل' AND s.sale_date BETWEEN ? AND ? "
                "GROUP BY si.name ORDER BY qty DESC, revenue DESC LIMIT 5",
                (start_s, end_s),
            ))

            recent = _rows(con.execute(
                "SELECT invoice_num, patient_name, total, sale_date, sale_time, payment_method "
                "FROM sales WHERE status='مكتمل' AND sale_date BETWEEN ? AND ? "
                "ORDER BY sale_date DESC, sale_time DESC LIMIT 6",
                (start_s, end_s),
            ))

            payments = _rows(con.execute(
                "SELECT payment_method AS method, COUNT(*) AS count, COALESCE(SUM(total),0) AS total "
                "FROM sales WHERE status='مكتمل' AND sale_date BETWEEN ? AND ? "
                "GROUP BY payment_method ORDER BY total DESC",
                (start_s, end_s),
            ))

            previous_end = start - timedelta(days=1)
            previous_start = previous_end - timedelta(days=span_days - 1)
            previous_revenue = con.execute(
                "SELECT COALESCE(SUM(total),0) FROM sales "
                "WHERE status='مكتمل' AND sale_date BETWEEN ? AND ?",
                (previous_start.isoformat(), previous_end.isoformat()),
            ).fetchone()[0]

            revenue = float(summary["revenue"] or 0)
            growth = None if not previous_revenue else round(
                ((revenue - previous_revenue) / previous_revenue) * 100, 1
            )
            return _ok({
                "from": start_s,
                "to": end_s,
                "summary": {
                    "count": int(summary["count"] or 0),
                    "revenue": round(revenue, 2),
                    "average": round(float(summary["average"] or 0), 2),
                    "discount": round(float(summary["discount"] or 0), 2),
                    "tax": round(float(summary["tax"] or 0), 2),
                    "estimatedCost": round(float(cost or 0), 2),
                    "estimatedProfit": round(revenue - float(cost or 0), 2),
                    "growthPct": growth,
                },
                "series": {
                    "labels": [r["bucket"] for r in series_rows],
                    "values": [round(float(r["revenue"] or 0), 2) for r in series_rows],
                    "granularity": "day" if span_days <= 62 else "month",
                },
                "topMedicines": top,
                "recentSales": recent,
                "payments": payments,
            })
        finally:
            con.close()

    def get_monthly_sales(self):
        con  = _conn()
        year = datetime.now().year
        rows = con.execute(
            "SELECT strftime('%m',sale_date) AS m, COALESCE(SUM(total),0) AS t "
            "FROM sales WHERE sale_date LIKE ? AND status='مكتمل' GROUP BY m ORDER BY m",
            (f"{year}%",)).fetchall()
        con.close()
        values = [0.0]*12
        for r in rows: values[int(r[0])-1] = round(r[1], 2)
        return _ok({"labels":["يناير","فبراير","مارس","إبريل","مايو","يونيو",
                               "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"],
                    "values": values})

    def get_top_medicines(self):
        con  = _conn()
        rows = _rows(con.execute(
            "SELECT si.name, SUM(si.qty) AS qty, SUM(si.total) AS revenue "
            "FROM sale_items si JOIN sales s ON s.id=si.sale_id "
            "WHERE s.status='مكتمل' GROUP BY si.name ORDER BY qty DESC LIMIT 5"))
        con.close(); return _ok(rows)

    def get_category_dist(self):
        con  = _conn()
        rows = _rows(con.execute(
            "SELECT category AS cat, COUNT(*) AS count "
            "FROM medicines WHERE is_active=1 GROUP BY category ORDER BY count DESC"))
        con.close(); return _ok(rows)

    def get_recent_activity(self):
        con  = _conn()
        rows = _rows(con.execute(
            "SELECT id,invoice_num,patient_name,total,sale_date,sale_time,status "
            "FROM sales ORDER BY sale_date DESC, sale_time DESC LIMIT 8"))
        con.close()
        return _ok([{
            "type":  "sale",
            "title": f"فاتورة {r['invoice_num']}",
            "desc":  f"{r['patient_name']} — {r['total']:.2f} ر.س",
            "time":  r["sale_time"], "date": r["sale_date"],
            "icon":  "fa-receipt",
            "color": "var(--err)" if r["status"]=="ملغاة" else "var(--teal-500)",
            "status": r["status"],
        } for r in rows])

    # ── PROFIT REPORT [3.15] ──────────────────────────────────
    def get_profit_report(self, period: str = "all"):
        """period: 'today' | 'month' | 'year' | 'all'"""
        con   = _conn()
        today = date.today().isoformat()
        month = today[:7]
        year  = today[:4]

        filter_sql = ""
        if period == "today": filter_sql = f" AND s.sale_date='{today}'"
        elif period == "month": filter_sql = f" AND s.sale_date LIKE '{month}%'"
        elif period == "year":  filter_sql = f" AND s.sale_date LIKE '{year}%'"

        # Per-medicine profit (using cost from medicines table)
        per_med = _rows(con.execute(f"""
            SELECT si.med_id, si.name,
                   SUM(si.qty) AS qty_sold,
                   SUM(si.total) AS revenue,
                   COALESCE(m.cost,0) AS unit_cost,
                   SUM(si.qty)*COALESCE(m.cost,0) AS total_cost,
                   SUM(si.total) - SUM(si.qty)*COALESCE(m.cost,0) AS profit,
                   ROUND(
                     CASE WHEN SUM(si.total)>0
                          THEN (SUM(si.total)-SUM(si.qty)*COALESCE(m.cost,0))/SUM(si.total)*100
                          ELSE 0 END, 1
                   ) AS margin_pct
            FROM sale_items si
            JOIN sales s ON s.id=si.sale_id AND s.status='مكتمل'
            LEFT JOIN medicines m ON m.id=si.med_id
            WHERE 1=1{filter_sql}
            GROUP BY si.med_id, si.name
            ORDER BY profit DESC
        """))

        totals = con.execute(f"""
            SELECT COALESCE(SUM(si.total),0)                               AS revenue,
                   COALESCE(SUM(si.qty*COALESCE(m.cost,0)),0)              AS cost,
                   COALESCE(SUM(si.total)-SUM(si.qty*COALESCE(m.cost,0)),0) AS profit
            FROM sale_items si
            JOIN sales s ON s.id=si.sale_id AND s.status='مكتمل'
            LEFT JOIN medicines m ON m.id=si.med_id
            WHERE 1=1{filter_sql}
        """).fetchone()

        con.close()
        return _ok({
            "period": period,
            "revenue": round(totals["revenue"], 2),
            "cost":    round(totals["cost"],    2),
            "profit":  round(totals["profit"],  2),
            "margin_pct": round(
                totals["profit"] / totals["revenue"] * 100 if totals["revenue"] else 0, 1),
            "by_medicine": per_med,
        })

    # ── AUDIT LOG [3.16] ──────────────────────────────────────
    def get_audit_log(self, limit: int = 100, offset: int = 0):
        con  = _conn()
        rows = _rows(con.execute(
            "SELECT al.*, u.full_name "
            "FROM audit_log al "
            "LEFT JOIN users u ON u.id=al.user_id "
            "ORDER BY al.timestamp DESC LIMIT ? OFFSET ?",
            (limit, offset)
        ))
        total = con.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0]
        con.close(); return _ok({"items": rows, "total": total})

    # ── SETTINGS ──────────────────────────────────────────────
    def get_setting(self, key: str):
        con = _conn()
        row = con.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        con.close(); return _ok(row[0] if row else None)

    def set_setting(self, key: str, value: str):
        con = _conn()
        con.execute("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)", (key, value))
        con.commit(); con.close(); return _ok()

    # ── BACKUP / RESTORE [3.14] ───────────────────────────────
    def backup_database(self):
        try:
            os.makedirs(BACKUP_DIR, exist_ok=True)
            ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
            dest = os.path.join(BACKUP_DIR, f"pharmacy_{ts}.db")
            # Use SQLite backup API for consistent snapshot
            src = sqlite3.connect(DB_PATH)
            dst = sqlite3.connect(dest)
            src.backup(dst)
            src.close(); dst.close()
            return _ok({"path": dest, "filename": os.path.basename(dest)})
        except Exception as e: return _err(str(e))

    def get_backup_status(self):
        try:
            os.makedirs(BACKUP_DIR, exist_ok=True)
            paths = [os.path.join(BACKUP_DIR, f) for f in os.listdir(BACKUP_DIR) if f.endswith(".db")]
            if not paths:
                return _ok({"last_backup": None, "age_days": None, "stale": True})
            latest = max(paths, key=os.path.getmtime)
            modified = datetime.fromtimestamp(os.path.getmtime(latest))
            age_days = (datetime.now() - modified).total_seconds() / 86400
            return _ok({"last_backup": modified.isoformat(), "age_days": round(age_days, 2),
                        "stale": age_days >= 3, "filename": os.path.basename(latest)})
        except Exception as e: return _err(str(e))

    def restore_database(self, backup_path: str):
        try:
            if not os.path.isfile(backup_path):
                return _err("ملف النسخة الاحتياطية غير موجود")
            # Verify it's a valid SQLite db
            test = sqlite3.connect(backup_path)
            test.execute("SELECT name FROM sqlite_master LIMIT 1").fetchone()
            test.close()
            # Backup current before restore
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            os.makedirs(BACKUP_DIR, exist_ok=True)
            pre = os.path.join(BACKUP_DIR, f"pre_restore_{ts}.db")
            shutil.copy2(DB_PATH, pre)
            # Restore
            shutil.copy2(backup_path, DB_PATH)
            return _ok({"message": "تمت الاستعادة بنجاح", "pre_backup": pre})
        except Exception as e: return _err(str(e))

    def list_backups(self):
        try:
            os.makedirs(BACKUP_DIR, exist_ok=True)
            files = sorted([
                f for f in os.listdir(BACKUP_DIR) if f.endswith(".db")
            ], reverse=True)
            result = []
            for f in files[:20]:
                fp = os.path.join(BACKUP_DIR, f)
                stat = os.stat(fp)
                result.append({
                    "filename": f,
                    "path":     fp,
                    "size_kb":  round(stat.st_size / 1024, 1),
                    "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                })
            return _ok(result)
        except Exception as e: return _err(str(e))

    # ── AUTH ──────────────────────────────────────────────────
    def login(self, username: str, password: str):
        # Normalize once so "Admin", " admin " and "admin" resolve to the
        # same account and share the same lockout counter.
        global _LOGIN_FAILURES
        username = (username or "").strip().casefold()
        password = password or ""
        if not username or not password:
            return _err("يرجى إدخال اسم المستخدم وكلمة المرور")

        now = datetime.now()
        count, lockout_until = _LOGIN_FAILURES.get(username, (0, None))
        if lockout_until:
            if now < lockout_until:
                remaining = max(1, int((lockout_until - now).total_seconds()))
                return _err(f"الحساب مقفل مؤقتاً. حاول مرة أخرى بعد {remaining} ثانية.")
            # Lock expired: start with a clean counter instead of immediately
            # locking the user again on the next typo.
            _LOGIN_FAILURES.pop(username, None)
            count = 0

        def failed_attempt():
            next_count = count + 1
            if next_count >= _MAX_ATTEMPTS:
                until = now + timedelta(seconds=_LOCKOUT_SECS)
                _LOGIN_FAILURES[username] = (next_count, until)
                return _err(f"تم قفل الحساب مؤقتاً لمدة {_LOCKOUT_SECS//60} دقيقة بسبب محاولات دخول متكررة.")
            _LOGIN_FAILURES[username] = (next_count, None)
            remaining = _MAX_ATTEMPTS - next_count
            return _err(f"اسم المستخدم أو كلمة المرور غير صحيحة. متبقي {remaining} محاولة قبل القفل المؤقت.")

        con = None
        try:
            con = _conn()
            row = con.execute(
                "SELECT * FROM users WHERE username=? COLLATE NOCASE", (username,)
            ).fetchone()
            if not row:
                return failed_attempt()
            user = dict(row)
            if not _verify_password(password, user["password"]):
                return failed_attempt()
            # Success — clear failures, upgrade hash if needed
            _LOGIN_FAILURES.pop(username, None)
            stored = user["password"]
            if not stored.startswith("pbkdf2:"):
                new_hash = _hash_password(password)
                con.execute("UPDATE users SET password=? WHERE id=?", (new_hash, user["id"]))
            now_iso = now.isoformat()
            con.execute("UPDATE users SET last_login=? WHERE id=?", (now_iso, user["id"]))
            con.commit()
            user.pop("password", None)
            # FIX [2.12]: flag default password
            user["is_default_password"] = password in ("admin123", "123456")
            return _ok(user)
        except Exception as e:
            return _err(str(e))
        finally:
            if con is not None:
                con.close()

    def get_users(self):
        con  = _conn()
        rows = _rows(con.execute(
            "SELECT id,username,full_name,role,phone,email,created_at,last_login FROM users ORDER BY full_name"))
        con.close(); return _ok(rows)

    def get_current_user(self, uid: str):
        con = _conn()
        row = con.execute(
            "SELECT id,username,full_name,role,phone,email,created_at,last_login FROM users WHERE id=?",
            (uid,)
        ).fetchone()
        con.close(); return _ok(dict(row) if row else None)

    def change_password(self, uid: str, old_pwd: str, new_pwd: str):
        try:
            con = _conn()
            row = con.execute("SELECT password FROM users WHERE id=?", (uid,)).fetchone()
            if not row:
                con.close(); return _err("المستخدم غير موجود")
            if not _verify_password(old_pwd, row["password"]):
                con.close(); return _err("كلمة المرور الحالية غير صحيحة")
            con.execute("UPDATE users SET password=? WHERE id=?",
                        (_hash_password(new_pwd), uid))
            _audit(con, uid, "CHANGE_PASSWORD", "user", uid, "")
            con.commit(); con.close(); return _ok()
        except Exception as e: return _err(str(e))

    # ── FIX [3.13]: RBAC permission check ─────────────────────
    def check_permission(self, user_id: str, perm: str):
        con = _conn()
        row = con.execute("SELECT role FROM users WHERE id=?", (user_id,)).fetchone()
        con.close()
        if not row: return _err("المستخدم غير موجود")
        return _ok(_has_perm(row["role"], perm))

    # ── USER MANAGEMENT (admin only) ──────────────────────────
    def add_user(self, data: str, caller_id: str = None):
        try:
            d   = json.loads(data)
            username = str(d.get("username", "")).strip().casefold()
            full_name = str(d.get("full_name", "")).strip()
            if not username or not full_name:
                return _err("اسم المستخدم والاسم الكامل مطلوبان")
            con = _conn()
            # only admin can add users
            if caller_id:
                caller = con.execute("SELECT role FROM users WHERE id=?", (caller_id,)).fetchone()
                if not caller or caller["role"] != "مدير النظام":
                    con.close(); return _err("غير مصرح — هذه العملية للمدير فقط")
            # check username uniqueness
            dup = con.execute("SELECT id FROM users WHERE username=? COLLATE NOCASE", (username,)).fetchone()
            if dup:
                con.close(); return _err("اسم المستخدم موجود بالفعل")
            nid = _new_id("U")
            pwd = d.get("password", "123456")
            con.execute(
                "INSERT INTO users(id,username,password,full_name,role,phone,email,created_at,last_login)"
                " VALUES(?,?,?,?,?,?,?,?,?)",
                (nid, username, _hash_password(pwd), full_name,
                 d.get("role","صيدلاني مسؤول"), d.get("phone",""), d.get("email",""),
                 date.today().isoformat(), None)
            )
            _audit(con, caller_id, "ADD_USER", "user", nid, username)
            con.commit(); con.close(); return _ok(nid)
        except Exception as e: return _err(str(e))

    def update_user(self, uid: str, data: str, caller_id: str = None):
        try:
            d   = json.loads(data)
            username = str(d.get("username", "")).strip().casefold() if d.get("username") is not None else ""
            con = _conn()
            if caller_id:
                caller = con.execute("SELECT role FROM users WHERE id=?", (caller_id,)).fetchone()
                if not caller or caller["role"] != "مدير النظام":
                    con.close(); return _err("غير مصرح — هذه العملية للمدير فقط")
            # check username uniqueness (excluding self)
            if username:
                dup = con.execute(
                    "SELECT id FROM users WHERE username=? COLLATE NOCASE AND id!=?",
                    (username, uid)
                ).fetchone()
                if dup:
                    con.close(); return _err("اسم المستخدم موجود بالفعل")
            con.execute(
                "UPDATE users SET full_name=?, role=?, phone=?, email=?"
                + (", username=?" if username else "")
                + " WHERE id=?",
                ([d.get("full_name"), d.get("role"), d.get("phone",""), d.get("email","")]
                 + ([username] if username else [])
                 + [uid])
            )
            _audit(con, caller_id, "UPDATE_USER", "user", uid, d.get("full_name",""))
            con.commit(); con.close(); return _ok()
        except Exception as e: return _err(str(e))

    def delete_user(self, uid: str, caller_id: str = None):
        try:
            con = _conn()
            if caller_id:
                caller = con.execute("SELECT role FROM users WHERE id=?", (caller_id,)).fetchone()
                if not caller or caller["role"] != "مدير النظام":
                    con.close(); return _err("غير مصرح — هذه العملية للمدير فقط")
            if caller_id == uid:
                con.close(); return _err("لا يمكن حذف حسابك الشخصي")
            total = con.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            if total <= 1:
                con.close(); return _err("لا يمكن حذف المستخدم الوحيد في النظام")
            row = con.execute("SELECT username FROM users WHERE id=?", (uid,)).fetchone()
            if not row:
                con.close(); return _err("المستخدم غير موجود")
            con.execute("DELETE FROM users WHERE id=?", (uid,))
            _audit(con, caller_id, "DELETE_USER", "user", uid, row["username"])
            con.commit(); con.close(); return _ok()
        except Exception as e: return _err(str(e))

    def reset_user_password(self, uid: str, data: str, caller_id: str = None):
        try:
            d   = json.loads(data)
            con = _conn()
            if caller_id:
                caller = con.execute("SELECT role FROM users WHERE id=?", (caller_id,)).fetchone()
                if not caller or caller["role"] != "مدير النظام":
                    con.close(); return _err("غير مصرح — هذه العملية للمدير فقط")
            new_pwd = d.get("new_pwd","123456")
            con.execute("UPDATE users SET password=? WHERE id=?", (_hash_password(new_pwd), uid))
            _audit(con, caller_id, "RESET_PASSWORD", "user", uid, "")
            con.commit(); con.close(); return _ok()
        except Exception as e: return _err(str(e))

    # ══════════════════════════════════════════════════════════════
    #  PURCHASES  — نظام المشتريات
    # ══════════════════════════════════════════════════════════════
    def get_purchases(self):
        con = _conn()
        rows = _rows(con.execute(
            "SELECT p.*, s.name AS supplier_name_ref "
            "FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id "
            "ORDER BY p.created_at DESC"))
        for r in rows:
            r["items"] = _rows(con.execute(
                "SELECT * FROM purchase_items WHERE purchase_id=?", (r["id"],)))
        con.close(); return _ok(rows)

    def get_purchase(self, pid: str):
        con = _conn()
        row = con.execute("SELECT * FROM purchases WHERE id=?", (pid,)).fetchone()
        if not row: con.close(); return _ok(None)
        p = dict(row)
        p["items"] = _rows(con.execute(
            "SELECT * FROM purchase_items WHERE purchase_id=?", (pid,)))
        con.close(); return _ok(p)

    def add_purchase(self, data: str, user_id: str = None):
        """إنشاء أمر شراء جديد (status=مفتوح)"""
        try:
            d = json.loads(data)
            con = _conn()
            nid = _new_id("PO")
            year = datetime.now().year
            seq = con.execute(
                "SELECT COALESCE(MAX(CAST(SUBSTR(po_num,8) AS INTEGER)),0) FROM purchases"
            ).fetchone()[0] + 1
            po_num = f"PO-{year}-{seq:03d}"
            now = datetime.now().isoformat()

            supplier = con.execute("SELECT name FROM suppliers WHERE id=?",
                                   (d.get("supplier_id"),)).fetchone()
            sup_name = supplier["name"] if supplier else d.get("supplier_name","")

            total_cost = sum(i.get("unit_cost",0)*i.get("qty_ordered",0) for i in d.get("items",[]))

            con.execute(
                "INSERT INTO purchases(id,po_num,supplier_id,supplier_name,status,total_cost,notes,created_by,created_at)"
                " VALUES(?,?,?,?,?,?,?,?,?)",
                (nid, po_num, d.get("supplier_id"), sup_name,
                 "مفتوح", total_cost, d.get("notes",""), user_id, now)
            )
            for item in d.get("items",[]):
                con.execute(
                    "INSERT INTO purchase_items(purchase_id,med_id,med_name,qty_ordered,qty_received,unit_cost,total_cost)"
                    " VALUES(?,?,?,?,?,?,?)",
                    (nid, item.get("med_id"), item.get("med_name"),
                     item.get("qty_ordered",0), 0,
                     item.get("unit_cost",0),
                     item.get("unit_cost",0)*item.get("qty_ordered",0))
                )
            # تحديث total_orders للمورد
            con.execute(
                "UPDATE suppliers SET total_orders=total_orders+1, last_order=? WHERE id=?",
                (now[:10], d.get("supplier_id"))
            )
            _audit(con, user_id, "ADD", "purchase", nid, po_num)
            con.commit(); con.close(); return _ok({"id": nid, "po_num": po_num})
        except Exception as e: return _err(str(e))

    def receive_purchase(self, pid: str, data: str, user_id: str = None):
        """استلام بضاعة — يُحدّث المخزون وحالة أمر الشراء"""
        try:
            d = json.loads(data)
            con = _conn()
            po = con.execute("SELECT * FROM purchases WHERE id=?", (pid,)).fetchone()
            if not po: con.close(); return _err("أمر الشراء غير موجود")
            if po["status"] == "مستلم": con.close(); return _err("تم استلام هذا الأمر بالكامل مسبقاً")

            items_received = d.get("items", [])
            now = datetime.now().isoformat()

            for item in items_received:
                item_row = con.execute(
                    "SELECT * FROM purchase_items WHERE id=?", (item["item_id"],)
                ).fetchone()
                if not item_row: continue
                qty = int(item.get("qty_received", 0))
                if qty <= 0: continue

                con.execute(
                    "UPDATE purchase_items SET qty_received=qty_received+? WHERE id=?",
                    (qty, item["item_id"])
                )
                # تحديث المخزون
                if item_row["med_id"]:
                    med_units = con.execute(
                        "SELECT conversion_factor,batch_number,expiry FROM medicines WHERE id=?", (item_row["med_id"],)
                    ).fetchone()
                    factor = max(1, int((med_units["conversion_factor"] if med_units else 1) or 1))
                    stock_qty = qty * factor
                    con.execute(
                        "UPDATE medicines SET stock=stock+? WHERE id=?",
                        (stock_qty, item_row["med_id"])
                    )
                    con.execute(
                        "INSERT INTO medicine_batches(id,medicine_id,batch_number,expiry,qty,cost,received_date) VALUES(?,?,?,?,?,?,?)",
                        (_new_id("BAT"),item_row["med_id"],item.get("batch_number") or med_units["batch_number"],
                         item.get("expiry") or med_units["expiry"],stock_qty,
                         float(item.get("unit_cost") or item_row["unit_cost"] or 0)/factor,date.today().isoformat())
                    )
                    # سعر أمر الشراء لوحدة الشراء؛ نخزن تكلفة وحدة البيع.
                    new_cost = item.get("unit_cost")
                    if new_cost:
                        con.execute(
                            "UPDATE medicines SET cost=? WHERE id=?",
                            (float(new_cost) / factor, item_row["med_id"])
                        )

            # تحقق إذا كل الأصناف استُلمت
            total_ordered  = con.execute(
                "SELECT COALESCE(SUM(qty_ordered),0) FROM purchase_items WHERE purchase_id=?", (pid,)
            ).fetchone()[0]
            total_received = con.execute(
                "SELECT COALESCE(SUM(qty_received),0) FROM purchase_items WHERE purchase_id=?", (pid,)
            ).fetchone()[0]
            new_status = "مستلم" if total_received >= total_ordered else "مستلم جزئياً"

            con.execute(
                "UPDATE purchases SET status=?, received_at=? WHERE id=?",
                (new_status, now, pid)
            )
            _audit(con, user_id, "RECEIVE", "purchase", pid,
                   f"{po['po_num']} — {new_status} — تم تحويل وحدات الشراء إلى وحدات البيع")
            con.commit(); con.close()
            return _ok({"status": new_status})
        except Exception as e: return _err(str(e))

    def cancel_purchase(self, pid: str, user_id: str = None):
        try:
            con = _conn()
            po = con.execute("SELECT po_num,status FROM purchases WHERE id=?", (pid,)).fetchone()
            if not po: con.close(); return _err("أمر الشراء غير موجود")
            if po["status"] in ("مستلم",):
                con.close(); return _err("لا يمكن إلغاء أمر مستلم بالكامل")
            con.execute("UPDATE purchases SET status='ملغي' WHERE id=?", (pid,))
            _audit(con, user_id, "CANCEL", "purchase", pid, po["po_num"])
            con.commit(); con.close(); return _ok()
        except Exception as e: return _err(str(e))

    # ══════════════════════════════════════════════════════════════
    #  ACCOUNTS  — نظام الحسابات
    # ══════════════════════════════════════════════════════════════
    def get_accounts(self):
        con = _conn()
        rows = _rows(con.execute(
            "SELECT * FROM accounts WHERE is_active=1 ORDER BY type, name"))
        con.close(); return _ok(rows)

    def add_account(self, data: str, user_id: str = None):
        try:
            d = json.loads(data)
            con = _conn()
            nid = _new_id("AC")
            con.execute(
                "INSERT INTO accounts(id,name,type,balance,notes,is_active,created_at)"
                " VALUES(?,?,?,?,?,1,?)",
                (nid, d.get("name"), d.get("type"), d.get("balance",0),
                 d.get("notes",""), date.today().isoformat())
            )
            _audit(con, user_id, "ADD", "account", nid, d.get("name",""))
            con.commit(); con.close(); return _ok(nid)
        except Exception as e: return _err(str(e))

    def update_account(self, aid: str, data: str, user_id: str = None):
        try:
            d = json.loads(data)
            con = _conn()
            con.execute(
                "UPDATE accounts SET name=?,type=?,notes=? WHERE id=?",
                (d.get("name"), d.get("type"), d.get("notes",""), aid)
            )
            _audit(con, user_id, "UPDATE", "account", aid, d.get("name",""))
            con.commit(); con.close(); return _ok()
        except Exception as e: return _err(str(e))

    def delete_account(self, aid: str, user_id: str = None):
        try:
            con = _conn()
            linked = con.execute(
                "SELECT COUNT(*) FROM transactions WHERE account_id=?", (aid,)
            ).fetchone()[0]
            if linked:
                con.execute("UPDATE accounts SET is_active=0 WHERE id=?", (aid,))
            else:
                con.execute("DELETE FROM accounts WHERE id=?", (aid,))
            _audit(con, user_id, "DELETE", "account", aid, "")
            con.commit(); con.close(); return _ok()
        except Exception as e: return _err(str(e))

    def get_transactions(self, account_id: str = None, limit: int = 100, offset: int = 0):
        con = _conn()
        if account_id:
            rows = _rows(con.execute(
                "SELECT t.*, a.name AS account_name FROM transactions t "
                "LEFT JOIN accounts a ON a.id=t.account_id "
                "WHERE t.account_id=? ORDER BY t.created_at DESC LIMIT ? OFFSET ?",
                (account_id, limit, offset)))
            total = con.execute(
                "SELECT COUNT(*) FROM transactions WHERE account_id=?", (account_id,)
            ).fetchone()[0]
        else:
            rows = _rows(con.execute(
                "SELECT t.*, a.name AS account_name FROM transactions t "
                "LEFT JOIN accounts a ON a.id=t.account_id "
                "ORDER BY t.created_at DESC LIMIT ? OFFSET ?",
                (limit, offset)))
            total = con.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
        con.close(); return _ok({"items": rows, "total": total})

    def add_transaction(self, data: str, user_id: str = None):
        try:
            d = json.loads(data)
            con = _conn()
            nid = _new_id("TR")
            amount = float(d.get("amount", 0))
            tx_type = d.get("type")  # دخل / مصروف / تحويل
            now = datetime.now().isoformat()

            con.execute(
                "INSERT INTO transactions(id,account_id,type,amount,description,ref_type,ref_id,created_by,created_at)"
                " VALUES(?,?,?,?,?,?,?,?,?)",
                (nid, d.get("account_id"), tx_type, amount,
                 d.get("description",""), d.get("ref_type"),
                 d.get("ref_id"), user_id, now)
            )
            # تحديث رصيد الحساب
            delta = amount if tx_type == "دخل" else -amount
            con.execute(
                "UPDATE accounts SET balance=balance+? WHERE id=?",
                (delta, d.get("account_id"))
            )
            _audit(con, user_id, "ADD", "transaction", nid, d.get("description",""))
            con.commit(); con.close(); return _ok(nid)
        except Exception as e: return _err(str(e))

    def get_financial_summary(self):
        con = _conn()
        today = date.today().isoformat()
        month = today[:7]

        accounts = _rows(con.execute("SELECT * FROM accounts WHERE is_active=1"))
        total_income = con.execute(
            "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='دخل'"
        ).fetchone()[0]
        total_expense = con.execute(
            "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='مصروف'"
        ).fetchone()[0]
        month_income = con.execute(
            "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='دخل' AND created_at LIKE ?",
            (month+'%',)
        ).fetchone()[0]
        month_expense = con.execute(
            "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='مصروف' AND created_at LIKE ?",
            (month+'%',)
        ).fetchone()[0]
        today_income = con.execute(
            "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='دخل' AND created_at LIKE ?",
            (today+'%',)
        ).fetchone()[0]
        today_expense = con.execute(
            "SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='مصروف' AND created_at LIKE ?",
            (today+'%',)
        ).fetchone()[0]
        con.close()
        return _ok({
            "accounts": accounts,
            "total_income": round(total_income, 2),
            "total_expense": round(total_expense, 2),
            "net": round(total_income - total_expense, 2),
            "month_income": round(month_income, 2),
            "month_expense": round(month_expense, 2),
            "month_net": round(month_income - month_expense, 2),
            "today_income": round(today_income, 2),
            "today_expense": round(today_expense, 2),
        })

    # ══════════════════════════════════════════════════════════════
    #  CASH SESSIONS  — تسوية نهاية اليوم
    # ══════════════════════════════════════════════════════════════
    def get_active_session(self):
        con = _conn()
        row = con.execute(
            "SELECT * FROM cash_sessions WHERE status='مفتوحة' ORDER BY opened_at DESC LIMIT 1"
        ).fetchone()
        con.close(); return _ok(dict(row) if row else None)

    def open_session(self, data: str, user_id: str = None):
        try:
            d = json.loads(data)
            con = _conn()
            # لا يُسمح بجلستين مفتوحتين
            existing = con.execute(
                "SELECT id FROM cash_sessions WHERE status='مفتوحة'"
            ).fetchone()
            if existing:
                con.close(); return _err("توجد جلسة مفتوحة بالفعل. أغلق الجلسة الحالية أولاً.")
            nid = _new_id("CS")
            now = datetime.now().isoformat()
            con.execute(
                "INSERT INTO cash_sessions(id,opened_by,opened_at,opening_cash,status)"
                " VALUES(?,?,?,?,?)",
                (nid, user_id, now, d.get("opening_cash",0), "مفتوحة")
            )
            _audit(con, user_id, "OPEN_SESSION", "cash_session", nid, "")
            con.commit(); con.close(); return _ok(nid)
        except Exception as e: return _err(str(e))

    def close_session(self, sid: str, data: str, user_id: str = None):
        try:
            d = json.loads(data)
            con = _conn()
            session = con.execute(
                "SELECT * FROM cash_sessions WHERE id=?", (sid,)
            ).fetchone()
            if not session: con.close(); return _err("الجلسة غير موجودة")
            if session["status"] != "مفتوحة":
                con.close(); return _err("الجلسة مغلقة بالفعل")

            # حساب مبيعات النقد خلال الجلسة
            payment_rows = con.execute(
                "SELECT payment_method,COALESCE(SUM(total),0) total FROM sales "
                "WHERE status='مكتمل' AND sale_date=? GROUP BY payment_method",
                (date.today().isoformat(),)
            ).fetchall()
            totals={r["payment_method"]:float(r["total"] or 0) for r in payment_rows}
            sales_total=totals.get("نقدي",0); card_total=totals.get("بطاقة",0)
            transfer_total=totals.get("تحويل",0); credit_total=totals.get("آجل",0)

            opening = session["opening_cash"] or 0
            closing = float(d.get("closing_cash", 0))
            actual_card=float(d.get("actual_card",card_total)); actual_transfer=float(d.get("actual_transfer",transfer_total)); actual_credit=float(d.get("actual_credit",credit_total))
            expected = opening + sales_total
            diff = closing - expected
            now = datetime.now().isoformat()

            con.execute(
                "UPDATE cash_sessions SET closed_by=?,closed_at=?,closing_cash=?,"
                "expected_cash=?,difference=?,sales_total=?,card_total=?,transfer_total=?,credit_total=?,actual_card=?,actual_transfer=?,actual_credit=?,status='مغلقة' WHERE id=?",
                (user_id, now, closing, expected, diff, sales_total,card_total,transfer_total,credit_total,actual_card,actual_transfer,actual_credit,sid)
            )
            _audit(con, user_id, "CLOSE_SESSION", "cash_session", sid,
                   f"فرق={diff:.2f}")
            con.commit(); con.close()
            return _ok({
                "sales_total": round(sales_total, 2),
                "expected": round(expected, 2),
                "closing": round(closing, 2),
                "difference": round(diff, 2),
                "channels":{"cash":{"expected":round(expected,2),"actual":round(closing,2),"difference":round(diff,2)},
                            "card":{"expected":round(card_total,2),"actual":round(actual_card,2),"difference":round(actual_card-card_total,2)},
                            "transfer":{"expected":round(transfer_total,2),"actual":round(actual_transfer,2),"difference":round(actual_transfer-transfer_total,2)},
                            "credit":{"expected":round(credit_total,2),"actual":round(actual_credit,2),"difference":round(actual_credit-credit_total,2)}},
            })
        except Exception as e: return _err(str(e))

    def get_sessions(self):
        con = _conn()
        rows = _rows(con.execute(
            "SELECT * FROM cash_sessions ORDER BY opened_at DESC LIMIT 30"))
        con.close(); return _ok(rows)

    # ══════════════════════════════════════════════════════════════
    #  HR & PAYROLL  — الموظفون والأجور
    # ══════════════════════════════════════════════════════════════
    def get_employees(self):
        con = _conn()
        rows = _rows(con.execute(
            "SELECT * FROM employees WHERE is_active=1 ORDER BY full_name"))
        con.close(); return _ok(rows)

    def add_employee(self, data: str, user_id: str = None):
        try:
            d = json.loads(data)
            con = _conn()
            nid = _new_id("EMP")
            con.execute(
                "INSERT INTO employees(id,full_name,role,phone,national_id,hire_date,salary,hourly_rate,is_active,notes)"
                " VALUES(?,?,?,?,?,?,?,?,1,?)",
                (nid, d.get("full_name"), d.get("role"), d.get("phone"),
                 d.get("national_id"), d.get("hire_date"),
                 d.get("salary",0), d.get("hourly_rate",0),
                 d.get("notes",""))
            )
            _audit(con, user_id, "ADD", "employee", nid, d.get("full_name",""))
            con.commit(); con.close(); return _ok(nid)
        except Exception as e: return _err(str(e))

    def update_employee(self, eid: str, data: str, user_id: str = None):
        try:
            d = json.loads(data)
            con = _conn()
            con.execute(
                "UPDATE employees SET full_name=?,role=?,phone=?,national_id=?,"
                "hire_date=?,salary=?,hourly_rate=?,notes=? WHERE id=?",
                (d.get("full_name"), d.get("role"), d.get("phone"),
                 d.get("national_id"), d.get("hire_date"),
                 d.get("salary",0), d.get("hourly_rate",0),
                 d.get("notes",""), eid)
            )
            _audit(con, user_id, "UPDATE", "employee", eid, d.get("full_name",""))
            con.commit(); con.close(); return _ok()
        except Exception as e: return _err(str(e))

    def delete_employee(self, eid: str, user_id: str = None):
        try:
            con = _conn()
            row = con.execute("SELECT full_name FROM employees WHERE id=?", (eid,)).fetchone()
            if not row: con.close(); return _err("الموظف غير موجود")
            con.execute("UPDATE employees SET is_active=0 WHERE id=?", (eid,))
            _audit(con, user_id, "DELETE", "employee", eid, row["full_name"])
            con.commit(); con.close(); return _ok()
        except Exception as e: return _err(str(e))

    def get_payroll(self, employee_id: str = None):
        con = _conn()
        if employee_id:
            rows = _rows(con.execute(
                "SELECT p.*, e.full_name FROM payroll p "
                "LEFT JOIN employees e ON e.id=p.employee_id "
                "WHERE p.employee_id=? ORDER BY p.period DESC", (employee_id,)))
        else:
            rows = _rows(con.execute(
                "SELECT p.*, e.full_name FROM payroll p "
                "LEFT JOIN employees e ON e.id=p.employee_id "
                "ORDER BY p.period DESC LIMIT 60"))
        con.close(); return _ok(rows)

    def add_payroll(self, data: str, user_id: str = None):
        try:
            d = json.loads(data)
            con = _conn()
            emp = con.execute(
                "SELECT * FROM employees WHERE id=?", (d.get("employee_id"),)
            ).fetchone()
            if not emp: con.close(); return _err("الموظف غير موجود")
            nid = _new_id("PR")
            base  = float(d.get("base_salary", emp["salary"] or 0))
            bonus = float(d.get("bonus", 0))
            deductions = float(d.get("deductions", 0))
            net = base + bonus - deductions
            now = datetime.now().isoformat()
            con.execute(
                "INSERT INTO payroll(id,employee_id,period,base_salary,bonus,deductions,net_pay,paid_at,paid_by,notes)"
                " VALUES(?,?,?,?,?,?,?,?,?,?)",
                (nid, d.get("employee_id"), d.get("period"),
                 base, bonus, deductions, net,
                 now, user_id, d.get("notes",""))
            )
            _audit(con, user_id, "ADD", "payroll", nid,
                   f"{emp['full_name']} — {d.get('period')} — {net:.2f}")
            con.commit(); con.close(); return _ok(nid)
        except Exception as e: return _err(str(e))

    def get_employee_performance(self, employee_id: str = None):
        """تقرير أداء الموظفين: مبيعات كل كاشير"""
        con = _conn()
        if employee_id:
            emp = con.execute(
                "SELECT full_name FROM employees WHERE id=?", (employee_id,)
            ).fetchone()
            cashier_name = emp["full_name"] if emp else None
            if cashier_name:
                rows = _rows(con.execute(
                    "SELECT sale_date, COUNT(*) AS count, SUM(total) AS revenue "
                    "FROM sales WHERE status='مكتمل' AND cashier=? "
                    "GROUP BY sale_date ORDER BY sale_date DESC LIMIT 30",
                    (cashier_name,)))
            else:
                rows = []
        else:
            rows = _rows(con.execute(
                "SELECT cashier, COUNT(*) AS count, SUM(total) AS revenue "
                "FROM sales WHERE status='مكتمل' AND cashier IS NOT NULL AND cashier != '' "
                "GROUP BY cashier ORDER BY revenue DESC"))
        con.close(); return _ok(rows)
