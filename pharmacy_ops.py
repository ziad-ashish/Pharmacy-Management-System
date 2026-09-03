"""Operational safeguards: explicit units, batch allocations and durable POS drafts."""
import base64
import json
import math
import uuid
from contextlib import closing
from datetime import date, datetime

from flask import g, jsonify, request, Response
import api


def init_schema(con):
    con.executescript("""
    CREATE TABLE IF NOT EXISTS pos_drafts (
        user_id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, version INTEGER NOT NULL,
        payload TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sale_requests (
        user_id TEXT NOT NULL, request_id TEXT NOT NULL, response TEXT NOT NULL,
        PRIMARY KEY(user_id,request_id)
    );
    CREATE TABLE IF NOT EXISTS sale_batch_allocations (
        sale_id TEXT NOT NULL REFERENCES sales(id), batch_id TEXT NOT NULL REFERENCES medicine_batches(id),
        quantity INTEGER NOT NULL, PRIMARY KEY(sale_id,batch_id)
    );
    CREATE TABLE IF NOT EXISTS backup_runs (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, local_path TEXT,
        secondary_path TEXT, secondary_error TEXT, user_id TEXT
    );
    CREATE TABLE IF NOT EXISTS backup_config (id INTEGER PRIMARY KEY CHECK(id=1), directory TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS barcode_unit_reviews (medicine_id TEXT PRIMARY KEY REFERENCES medicines(id));
    """)
    existing = {r[1] for r in con.execute('PRAGMA table_info(purchase_items)')}
    for column, definition in [('purchase_unit','TEXT'), ('sale_unit','TEXT'), ('conversion_factor','INTEGER')]:
        if column not in existing:
            con.execute(f'ALTER TABLE purchase_items ADD COLUMN {column} {definition}')
    # Old orders preserve their quantities/prices; snapshot current units only.
    con.execute("""UPDATE purchase_items SET
        purchase_unit=(SELECT purchase_unit FROM medicines WHERE id=med_id),
        sale_unit=(SELECT sale_unit FROM medicines WHERE id=med_id),
        conversion_factor=COALESCE((SELECT conversion_factor FROM medicines WHERE id=med_id),1)
        WHERE conversion_factor IS NULL""")


def light_columns(con, alias=''):
    prefix = alias + '.' if alias else ''
    names = [r[1] for r in con.execute('PRAGMA table_info(medicines)') if r[1] != 'image_data']
    outer = alias or 'medicines'
    today = date.today().isoformat()
    valid = f"(expiry IS NULL OR expiry='' OR expiry>='{today}')"
    valid_outer = f"({outer}.expiry IS NULL OR {outer}.expiry='' OR {outer}.expiry>='{today}')"
    sellable = f"""COALESCE((SELECT SUM(qty) FROM medicine_batches WHERE medicine_id={outer}.id AND qty>0 AND {valid}),0)
        + CASE WHEN {valid_outer} THEN MAX(0,{outer}.stock-COALESCE((SELECT SUM(qty) FROM medicine_batches WHERE medicine_id={outer}.id),0)) ELSE 0 END"""
    return (','.join(prefix + '"' + name + '"' for name in names)
            + f",({prefix}image_data IS NOT NULL AND {prefix}image_data!='') AS has_image"
            + f",({sellable}) AS sellable_stock")


def ensure_batches(con, mid):
    med = con.execute('SELECT * FROM medicines WHERE id=?', (mid,)).fetchone()
    total = con.execute('SELECT COALESCE(SUM(qty),0) FROM medicine_batches WHERE medicine_id=?', (mid,)).fetchone()[0]
    missing = med['stock'] - total
    if missing < 0:
        raise ValueError(f"{med['name']}: رصيد الدفعات لا يطابق المخزون؛ راجع التسوية قبل الصرف")
    if missing:
        con.execute('INSERT INTO medicine_batches VALUES(?,?,?,?,?,?,?)',
                    (api._new_id('BAT'), mid, med['batch_number'] or 'رصيد سابق', med['expiry'], missing, med['cost'], date.today().isoformat()))


def sync_expiry(con, mid):
    con.execute("""UPDATE medicines SET expiry=(SELECT MIN(NULLIF(expiry,'')) FROM medicine_batches
        WHERE medicine_id=? AND qty>0) WHERE id=?""", (mid, mid))


def allocate_batches(con, mid, qty, sale_id):
    ensure_batches(con, mid)
    batches = con.execute("""SELECT id,qty FROM medicine_batches WHERE medicine_id=? AND qty>0
        AND (expiry IS NULL OR expiry='' OR expiry>=?)
        ORDER BY CASE WHEN expiry IS NULL OR expiry='' THEN 1 ELSE 0 END,expiry,received_date,id""",
        (mid, date.today().isoformat())).fetchall()
    if sum(b['qty'] for b in batches) < qty:
        raise ValueError('الكمية المطلوبة غير متاحة في الدفعات غير المنتهية؛ لا يمكن صرف المخزون المنتهي')
    remaining = qty
    for batch in batches:
        take = min(remaining, batch['qty'])
        if not take:
            break
        con.execute('UPDATE medicine_batches SET qty=qty-? WHERE id=?', (take, batch['id']))
        con.execute('INSERT INTO sale_batch_allocations VALUES(?,?,?)', (sale_id, batch['id'], take))
        remaining -= take
    sync_expiry(con, mid)


def permission(con, key):
    row = con.execute('SELECT role FROM users WHERE id=?', (g.user_id,)).fetchone()
    return row and api._has_perm(row['role'], key)


def register_routes(app):
    @app.get('/api/medicine_image/<mid>')
    def medicine_image(mid):
        with closing(api._conn()) as con:
            row = con.execute('SELECT image_data FROM medicines WHERE id=? AND is_active=1', (mid,)).fetchone()
        if not row or not row[0]:
            return '', 404
        from camera_api import validate_image
        try:
            value = validate_image(row[0])
            header, data = value.split(',', 1)
            return Response(base64.b64decode(data), mimetype=header[5:].split(';')[0], headers={'X-Content-Type-Options':'nosniff'})
        except ValueError:
            return '', 404

    @app.route('/api/barcode_units/<mid>', methods=['GET','POST'])
    def barcode_units(mid):
        with closing(api._conn()) as con:
            if not permission(con, 'medicines'):
                return jsonify(ok=False, error='تعديل وحدات الباركود يحتاج صلاحية إدارة الأدوية'), 403
            con.execute('BEGIN IMMEDIATE')
            med = con.execute('SELECT * FROM medicines WHERE id=? AND is_active=1', (mid,)).fetchone()
            if not med:
                return jsonify(ok=False, error='الصنف غير موجود'), 404
            codes = list(dict.fromkeys(c for c in (med['pharmacy_barcode'], med['company_barcode'], med['barcode']) if c))
            codes = list(dict.fromkeys(codes + [r[0] for r in con.execute('SELECT barcode FROM medicine_barcodes WHERE medicine_id=?',(mid,))]))
            if request.method == 'POST':
                try:
                    entries = request.get_json().get('entries')
                    if not isinstance(entries, list) or len(entries) != len(codes):
                        raise ValueError('حدد وحدة كل باركود أساسي')
                    seen = set()
                    for entry in entries:
                        code, unit = entry.get('barcode'), str(entry.get('unit','')).strip()
                        quantity = float(entry.get('quantity',0))
                        if code not in codes or code in seen or not unit or len(unit)>40 or not math.isfinite(quantity) or not quantity.is_integer() or not 1<=quantity<=10000:
                            raise ValueError('وحدة الباركود أو عدد وحدات البيع غير صحيح')
                        seen.add(code)
                        duplicate = con.execute('SELECT medicine_id FROM medicine_barcodes WHERE barcode=?', (code,)).fetchone()
                        other = con.execute('SELECT id FROM medicines WHERE id!=? AND is_active=1 AND (barcode=? OR company_barcode=? OR pharmacy_barcode=?)', (mid,code,code,code)).fetchone()
                        if other or (duplicate and duplicate[0]!=mid):
                            raise ValueError('الباركود مستخدم لصنف آخر؛ يجب حل التعارض أولًا')
                        con.execute('INSERT INTO medicine_barcodes VALUES(?,?,?,?,?) ON CONFLICT(barcode) DO UPDATE SET unit_name=excluded.unit_name,sale_quantity=excluded.sale_quantity',
                                    (code,mid,unit,int(quantity),datetime.now().isoformat()))
                    api._audit(con,g.user_id,'CONFIGURE_BARCODE_UNITS','medicine',mid,'تم تحديد وحدات الباركود؛ بدون تعديل المخزون')
                    con.execute('DELETE FROM barcode_unit_reviews WHERE medicine_id=?',(mid,))
                    con.commit()
                except (ValueError,TypeError,AttributeError) as exc:
                    con.rollback()
                    return jsonify(ok=False,error=str(exc)),400
            entries=[]
            for code in codes:
                saved=con.execute('SELECT unit_name,sale_quantity FROM medicine_barcodes WHERE barcode=? AND medicine_id=?',(code,mid)).fetchone()
                entries.append({'barcode':code,'unit':saved[0] if saved else med['sale_unit'], 'quantity':saved[1] if saved else None})
            return jsonify(ok=True,data={'entries':entries,'name':med['name'],'saleUnit':med['sale_unit'],'purchaseUnit':med['purchase_unit'],'factor':med['conversion_factor']})

    @app.route('/api/pos_draft', methods=['GET','POST'])
    def pos_draft():
        with closing(api._conn()) as con:
            if not permission(con,'sales'):
                return jsonify(ok=False,error='لا توجد صلاحية البيع'),403
            if request.method=='GET':
                row=con.execute('SELECT * FROM pos_drafts WHERE user_id=?',(g.user_id,)).fetchone()
                return jsonify(ok=True,data={'id':row['draft_id'],'version':row['version'],'payload':json.loads(row['payload']),'updatedAt':row['updated_at']} if row else None)
            try:
                d=request.get_json();payload=d.get('payload');draft_id=str(d.get('id',''))
                if d.get('owner',g.user_id)!=g.user_id:
                    raise ValueError('تغير الحساب؛ لم يتم حفظ مسودة مستخدم آخر')
                if not draft_id or len(draft_id)>80 or not isinstance(payload,dict):
                    raise ValueError('بيانات المسودة غير صحيحة')
                items=payload.get('cart',[])
                if not isinstance(items,list) or len(items)>500:
                    raise ValueError('عدد أصناف المسودة غير صحيح')
                seen=set()
                for item in items:
                    qty=float(item.get('qty',0));mid=item.get('medId')
                    if mid in seen or not qty.is_integer() or not 1<=qty<=1000000:
                        raise ValueError('كميات المسودة غير صحيحة')
                    seen.add(mid)
                from camera_api import prescription_images
                if payload.get('prescription'):
                    prescription_images(payload['prescription'])
                if payload.get('prescriptionDraft'):
                    prescription_images(payload['prescriptionDraft'])
                raw=json.dumps(payload,ensure_ascii=False)
                if len(raw.encode('utf8'))>7500000:
                    raise ValueError('المسودة أكبر من الحد المسموح')
                con.execute('BEGIN IMMEDIATE')
                if con.execute('SELECT 1 FROM sale_requests WHERE user_id=? AND request_id=?',(g.user_id,draft_id)).fetchone():
                    raise ValueError('هذه المسودة صدرت لها فاتورة بالفعل. أعد تحميل نقطة البيع')
                old=con.execute('SELECT * FROM pos_drafts WHERE user_id=?',(g.user_id,)).fetchone()
                version=old['version'] if old else 0
                if d.get('version')!=version or (old and old['draft_id']!=draft_id):
                    return jsonify(ok=False,error='المسودة تغيرت في نافذة أخرى. أعد فتح نقطة البيع قبل المتابعة'),409
                con.execute('INSERT INTO pos_drafts VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,version=excluded.version,updated_at=excluded.updated_at',
                            (g.user_id,draft_id,version+1,raw,datetime.now().isoformat()))
                api._audit(con,g.user_id,'SAVE_POS_DRAFT','pos_draft',draft_id,f'{len(items)} أصناف؛ بدون خصم مخزون')
                con.commit()
                return jsonify(ok=True,data={'id':draft_id,'version':version+1})
            except (ValueError,TypeError,AttributeError) as exc:
                con.rollback();return jsonify(ok=False,error=str(exc)),400
