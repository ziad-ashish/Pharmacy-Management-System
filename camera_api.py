"""Camera workflow data: barcode units, private scan drafts and prescription pages."""
import base64
import json
import math
from contextlib import closing
from datetime import datetime
from flask import g, jsonify, request
import api


def init_schema(con):
    con.executescript("""
    CREATE TABLE IF NOT EXISTS medicine_barcodes (
        barcode TEXT PRIMARY KEY, medicine_id TEXT NOT NULL REFERENCES medicines(id),
        unit_name TEXT NOT NULL, sale_quantity INTEGER NOT NULL CHECK(sale_quantity>0), created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scan_drafts (
        user_id TEXT NOT NULL, scope TEXT NOT NULL, data TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL,
        PRIMARY KEY(user_id,scope)
    );
    CREATE TABLE IF NOT EXISTS prescription_pages (
        id TEXT PRIMARY KEY, prescription_id TEXT NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
        position INTEGER NOT NULL, image_data TEXT NOT NULL,
        UNIQUE(prescription_id,position)
    );
    """)


def validate_image(value):
    if value in (None, ""):
        return None
    if not isinstance(value, str) or len(value) > 1400000:
        raise ValueError("الصورة أكبر من الحد المسموح (حوالي 1 ميجابايت)")
    for mime, signature in (("jpeg", b"\xff\xd8\xff"), ("png", b"\x89PNG\r\n\x1a\n"), ("webp", b"RIFF")):
        prefix = f"data:image/{mime};base64,"
        if value.startswith(prefix):
            try:
                data = base64.b64decode(value[len(prefix):], validate=True)
            except Exception:
                raise ValueError("بيانات الصورة غير صالحة")
            if not data.startswith(signature) or (mime == "webp" and data[8:12] != b"WEBP"):
                raise ValueError("نوع الصورة لا يطابق محتواها")
            return value
    raise ValueError("الصور المسموحة: JPG وPNG وWebP فقط")


def prescription_images(prescription):
    pages = prescription.get("images")
    if pages is None:
        pages = [prescription["image_data"]] if prescription.get("image_data") else []
    if not isinstance(pages, list) or len(pages) > 5:
        raise ValueError("يمكن إرفاق خمس صور للروشتة بحد أقصى")
    if any(not page for page in pages):
        raise ValueError("صورة الروشتة فارغة")
    return [validate_image(page) for page in pages]


def resolve(con, code):
    row = con.execute(f"""SELECT {api.light_columns(con)} FROM medicines WHERE is_active=1 AND
        (pharmacy_barcode=? OR company_barcode=? OR barcode=?)
        ORDER BY CASE WHEN pharmacy_barcode=? THEN 1 WHEN company_barcode=? THEN 2 ELSE 3 END LIMIT 1""",
        (code, code, code, code, code)).fetchone()
    if row:
        result = dict(row)
        configured = con.execute('SELECT unit_name,sale_quantity FROM medicine_barcodes WHERE barcode=? AND medicine_id=?',(code,row['id'])).fetchone()
        needs_setup = bool(con.execute('SELECT 1 FROM barcode_unit_reviews WHERE medicine_id=?',(row['id'],)).fetchone()) or (not configured and int(row['conversion_factor'] or 1)>1)
        result.update(scan_quantity=configured['sale_quantity'] if configured else 1,
                      scan_unit=configured['unit_name'] if configured else row['sale_unit'] or row['unit'],
                      scan_requires_configuration=needs_setup, matched_barcode=code)
        return result
    row = con.execute(f"""SELECT {api.light_columns(con,'m')}, b.sale_quantity AS scan_quantity, b.unit_name AS scan_unit
        FROM medicine_barcodes b JOIN medicines m ON m.id=b.medicine_id
        WHERE b.barcode=? AND m.is_active=1""", (code,)).fetchone()
    if not row: return None
    needs_setup=bool(con.execute('SELECT 1 FROM barcode_unit_reviews WHERE medicine_id=?',(row['id'],)).fetchone())
    return dict(row, matched_barcode=code, scan_requires_configuration=needs_setup)


def register_camera_routes(app):
    def permission(con, key):
        row = con.execute("SELECT role FROM users WHERE id=?", (g.user_id,)).fetchone()
        return row and api._has_perm(row["role"], key)

    @app.get("/api/scan_resolve")
    def scan_resolve():
        code = request.args.get("code", "").strip()
        if not code or len(code) > 120:
            return jsonify(ok=False, error="الباركود غير صالح"), 400
        with closing(api._conn()) as con:
            result = resolve(con, code)
            if result:
                result.pop("image_data", None)
            return jsonify(ok=True, data=result)

    @app.post("/api/link_barcode")
    def link_barcode():
        d = request.get_json()
        with closing(api._conn()) as con:
            if not permission(con, "medicines"):
                return jsonify(ok=False, error="ربط الباركود يحتاج صلاحية إدارة الأدوية"), 403
            try:
                if not isinstance(d, dict) or not isinstance(d.get("barcode"), str) or not isinstance(d.get("unit"), str):
                    raise ValueError("أرسل بيانات الباركود والوحدة بشكل صحيح")
                code, unit = str(d.get("barcode", "")).strip(), str(d.get("unit", "")).strip()
                quantity = float(d.get("quantity", 0))
                if not code or len(code)>120 or not unit or len(unit)>40 or not math.isfinite(quantity) or not quantity.is_integer() or not 1<=quantity<=10000:
                    raise ValueError("حدد باركودًا ووحدة وعددًا صحيحًا من وحدات البيع")
                con.execute("BEGIN IMMEDIATE")
                med=con.execute("SELECT * FROM medicines WHERE id=? AND is_active=1",(d.get("medicine_id"),)).fetchone()
                if not med:
                    raise ValueError("الصنف غير موجود")
                if resolve(con, code) or con.execute("SELECT 1 FROM medicine_barcodes WHERE barcode=?",(code,)).fetchone():
                    raise ValueError("هذا الباركود مرتبط بالفعل. لا يمكن استبدال ارتباطه تلقائيًا")
                con.execute("INSERT INTO medicine_barcodes VALUES(?,?,?,?,?)",(code,med["id"],unit,int(quantity),datetime.now().isoformat()))
                api._audit(con,g.user_id,"LINK_BARCODE","medicine",med["id"],f"{code}: {unit} = {int(quantity)} وحدة بيع")
                con.commit()
                return jsonify(ok=True,data=None)
            except (ValueError, TypeError) as e:
                con.rollback(); return jsonify(ok=False,error=str(e)),400

    @app.route("/api/scan_draft/<path:scope>", methods=["GET","POST"])
    def scan_draft(scope):
        if scope != "inventory" and not scope.startswith("receive-"):
            return jsonify(ok=False,error="نوع المسودة غير صالح"),400
        if len(scope)>100:
            return jsonify(ok=False,error="معرف المسودة غير صالح"),400
        with closing(api._conn()) as con:
            if not permission(con,"medicines"):
                return jsonify(ok=False,error="المسودات تحتاج صلاحية إدارة الأدوية"),403
            if request.method=="GET":
                row=con.execute("SELECT * FROM scan_drafts WHERE user_id=? AND scope=?",(g.user_id,scope)).fetchone()
                return jsonify(ok=True,data={"items":json.loads(row["data"]),"version":row["version"],"updatedAt":row["updated_at"]} if row else {"items":[],"version":0})
            try:
                d=request.get_json();items=d.get("items",[])
                if not isinstance(items,list) or len(items)>500:raise ValueError("المسودة لا تتجاوز 500 صنف")
                clean=[];seen=set()
                for item in items:
                    mid=item.get("id");qty=float(item.get("quantity",0))
                    if mid in seen or not math.isfinite(qty) or not qty.is_integer() or not 0<=qty<=1000000:raise ValueError("كميات المسودة غير صالحة")
                    med=con.execute("SELECT name,stock FROM medicines WHERE id=? AND is_active=1",(mid,)).fetchone()
                    if not med:raise ValueError("يوجد صنف غير موجود في المسودة")
                    seen.add(mid);clean.append({"id":mid,"name":med["name"],"quantity":int(qty),"expected":med["stock"]})
                con.execute("BEGIN IMMEDIATE")
                row=con.execute("SELECT version FROM scan_drafts WHERE user_id=? AND scope=?",(g.user_id,scope)).fetchone()
                version=row[0] if row else 0
                if d.get("version")!=version:
                    con.rollback();return jsonify(ok=False,error="المسودة تغيرت في نافذة أخرى. أغلقها وافتحها من جديد قبل المتابعة"),409
                con.execute("INSERT INTO scan_drafts VALUES(?,?,?,?,?) ON CONFLICT(user_id,scope) DO UPDATE SET data=excluded.data,version=excluded.version,updated_at=excluded.updated_at",(g.user_id,scope,json.dumps(clean,ensure_ascii=False),version+1,datetime.now().isoformat()))
                api._audit(con,g.user_id,"SAVE_SCAN_DRAFT","scan_draft",scope,f"{len(clean)} أصناف — بدون تعديل المخزون")
                con.commit();return jsonify(ok=True,data={"items":clean,"version":version+1})
            except (ValueError,TypeError,AttributeError) as e:
                con.rollback();return jsonify(ok=False,error=str(e)),400

    @app.get("/api/prescription_images/<sale_id>")
    def get_prescription_images(sale_id):
        with closing(api._conn()) as con:
            if not permission(con,"patients"):
                return jsonify(ok=False,error="صور الروشتات متاحة للصيدلي المسؤول ومدير النظام فقط"),403
            rx=con.execute("SELECT id,doctor_name,image_data FROM prescriptions WHERE sale_id=?",(sale_id,)).fetchone()
            if not rx:return jsonify(ok=True,data=None)
            pages=[row[0] for row in con.execute("SELECT image_data FROM prescription_pages WHERE prescription_id=? ORDER BY position",(rx["id"],))]
            if not pages and rx["image_data"]:pages=[rx["image_data"]]
            api._audit(con,g.user_id,"VIEW_PRESCRIPTION_IMAGES","prescription",rx["id"],"عرض الصور من الفاتورة")
            con.commit();return jsonify(ok=True,data={"doctor":rx["doctor_name"],"images":pages})
