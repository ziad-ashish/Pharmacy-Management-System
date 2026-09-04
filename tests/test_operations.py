"""Daily pharmacy regressions. Never uses the pharmacy's real database or backups."""
import json
import os
import sqlite3
import tempfile
import unittest
from contextlib import closing
from datetime import date, timedelta
import api
import backup_store
import test_web_auth as web_auth
from test_camera_api import PNG


class OperationsTests(unittest.TestCase):
    setUp = web_auth.WebAuthenticationTests.setUp
    tearDown = web_auth.WebAuthenticationTests.tearDown
    login = web_auth.WebAuthenticationTests.login

    def medicine(self, **extra):
        payload=dict(
            name='صنف اختبار',category='اختبار',price=10,cost=4,stock=40,unit='قرص',
            purchase_unit='علبة',sale_unit='قرص',conversion_factor=20,expiry='2099-01-01')
        payload.update(extra)
        result=json.loads(api.PharmacyAPI().add_medicine(json.dumps(payload)))
        self.assertTrue(result['ok'],result)
        return result['data']

    def test_changed_units_require_review_without_deleting_barcode_mappings(self):
        self.login();mid=self.medicine(company_barcode='ORIGINAL')
        self.client.post('/api/barcode_units/'+mid,json={'entries':[{'barcode':'ORIGINAL','unit':'علبة','quantity':20}]})
        self.assertTrue(json.loads(api.PharmacyAPI().update_medicine(mid,json.dumps({'conversion_factor':10})))['ok'])
        self.assertTrue(self.client.get('/api/scan_resolve?code=ORIGINAL').json['data']['scan_requires_configuration'])
        with closing(api._conn()) as con:
            self.assertEqual(con.execute('SELECT sale_quantity FROM medicine_barcodes WHERE barcode=?',('ORIGINAL',)).fetchone()[0],20)

    def sale(self,mid,qty=1,**extra):
        return {'items':[{'medId':mid,'name':'صنف اختبار','qty':qty,'price':10,'total':10*qty}],**extra}

    def test_primary_barcode_requires_explicit_pack_size(self):
        self.login();mid=self.medicine(company_barcode='PACK20',pharmacy_barcode='ONE')
        self.assertTrue(self.client.get('/api/scan_resolve?code=PACK20').json['data']['scan_requires_configuration'])
        result=self.client.post('/api/barcode_units/'+mid,json={'entries':[
            {'barcode':'PACK20','unit':'علبة','quantity':20},{'barcode':'ONE','unit':'قرص','quantity':1}]}).json
        self.assertTrue(result['ok'],result)
        for code,quantity in [('PACK20',20),('ONE',1)]:
            result=self.client.get('/api/scan_resolve?code='+code).json['data']
            self.assertEqual(result['scan_quantity'],quantity)
            self.assertFalse(result['scan_requires_configuration'])
        result=json.loads(api.PharmacyAPI().update_medicine(mid,json.dumps({'name':'اسم معدل','company_barcode':'PACK20','pharmacy_barcode':'ONE'})))
        self.assertTrue(result['ok'],result)

    def test_purchase_cost_and_conversion_are_snapshotted(self):
        mid=self.medicine();service=api.PharmacyAPI()
        result=json.loads(service.add_purchase(json.dumps({'supplier_id':'S001','items':[{'med_id':mid,'qty_ordered':2}]})))
        self.assertTrue(result['ok'],result);pid=result['data']['id']
        po=json.loads(service.get_purchase(pid))['data'];line=po['items'][0]
        self.assertEqual(line['unit_cost'],80);self.assertEqual(po['total_cost'],160)
        self.assertEqual(line['conversion_factor'],20)
        self.assertTrue(json.loads(service.update_medicine(mid,json.dumps({'conversion_factor':10})))['ok'])
        api.init_db()  # migrations must not rewrite the snapshot of an existing order
        received={'items':[{'item_id':line['id'],'qty_received':1,'unit_cost':80,'batch_number':'B2026','expiry':'2098-12-31'}]}
        self.assertTrue(json.loads(service.receive_purchase(pid,json.dumps(received)))['ok'])
        med=json.loads(service.get_medicine(mid))['data'];self.assertEqual(med['stock'],60);self.assertEqual(med['cost'],4)
        with closing(api._conn()) as con:
            batch=con.execute("SELECT * FROM medicine_batches WHERE medicine_id=? AND batch_number='B2026'",(mid,)).fetchone()
            self.assertEqual(batch['expiry'],'2098-12-31');self.assertEqual(batch['qty'],20)

    def test_receiving_requires_actual_batch_and_nonexpired_date(self):
        mid=self.medicine();service=api.PharmacyAPI()
        po=json.loads(service.add_purchase(json.dumps({'items':[{'med_id':mid,'qty_ordered':1}]})))['data']
        line=json.loads(service.get_purchase(po['id']))['data']['items'][0]['id']
        for extra in ({},{'batch_number':'B','expiry':'2000-01-01'},{'batch_number':'B','expiry':'bad'}):
            result=json.loads(service.receive_purchase(po['id'],json.dumps({'items':[{'item_id':line,'qty_received':1,**extra}]})))
            self.assertFalse(result['ok'],result)
        self.assertEqual(json.loads(service.get_medicine(mid))['data']['stock'],40)

    def test_credit_sale_requires_name_and_records_first_payment(self):
        mid=self.medicine();service=api.PharmacyAPI()
        missing=json.loads(service.add_sale(json.dumps(self.sale(mid,payment_method='آجل',credit_paid_amount=2))))
        self.assertFalse(missing['ok'],missing)
        result=json.loads(service.add_sale(json.dumps(self.sale(
            mid,payment_method='آجل',credit_customer_name='عميل آجل',
            credit_phone='01012345678',credit_paid_amount=4))))
        self.assertTrue(result['ok'],result)
        self.assertEqual(result['data']['creditPaid'],4)
        self.assertEqual(result['data']['creditRemaining'],6)
        with closing(api._conn()) as con:
            patient=con.execute('SELECT name,phone FROM patients WHERE id=?',(result['data']['patientId'],)).fetchone()
            debt=con.execute('SELECT amount,paid_amount,status FROM debts WHERE sale_id=?',(result['data']['id'],)).fetchone()
            self.assertEqual((patient['name'],patient['phone']),('عميل آجل','01012345678'))
            self.assertEqual((debt['amount'],debt['paid_amount'],debt['status']),(10,4,'مسدد جزئياً'))
        rejected=json.loads(service.add_sale(json.dumps(self.sale(
            mid,payment_method='آجل',credit_customer_name='عميل آخر',credit_paid_amount=11))))
        self.assertFalse(rejected['ok'],rejected)
        self.assertEqual(json.loads(service.get_medicine(mid))['data']['stock'],39)

    def test_fefo_never_consumes_expired_and_void_restores_exact_batches(self):
        mid=self.medicine();service=api.PharmacyAPI()
        with closing(api._conn()) as con:
            con.execute('UPDATE medicines SET stock=60 WHERE id=?',(mid,))
            for bid,expiry in [('expired','2000-01-01'),('near','2098-01-01'),('far','2099-01-01')]:
                con.execute('INSERT INTO medicine_batches VALUES(?,?,?,?,?,?,?)',(bid,mid,bid,expiry,20,4,'2026-01-01'))
            con.commit()
        rejected=json.loads(service.add_sale(json.dumps(self.sale(mid,50))))
        self.assertFalse(rejected['ok'],rejected)
        result=json.loads(service.add_sale(json.dumps(self.sale(mid,25))))
        self.assertTrue(result['ok'],result)
        with closing(api._conn()) as con:
            quantities={r['id']:r['qty'] for r in con.execute('SELECT * FROM medicine_batches WHERE medicine_id=?',(mid,))}
        self.assertEqual(quantities,{'expired':20,'near':0,'far':15})
        med=json.loads(service.get_medicine(mid))['data']
        self.assertEqual(med['stock'],35);self.assertEqual(med['sellable_stock'],15)
        self.assertTrue(json.loads(service.void_sale(result['data']['id']))['ok'])
        with closing(api._conn()) as con:
            self.assertEqual([r[0] for r in con.execute('SELECT qty FROM medicine_batches WHERE medicine_id=?',(mid,))],[20,20,20])
        self.assertFalse(json.loads(service.void_sale(result['data']['id']))['ok'])

    def test_draft_restores_account_data_and_checkout_is_idempotent(self):
        self.login();mid=self.medicine()
        payload={'cart':[{'medId':mid,'qty':1,'price':10,'total':10}], 'prescriptionDraft':{'doctor_name':'غير مكتمل','images':[PNG]}}
        saved=self.client.post('/api/pos_draft',json={'id':'draft-test','version':0,'payload':payload}).json
        self.assertTrue(saved['ok'],saved)
        self.client.post('/api/logout',json={});self.login()
        restored=self.client.get('/api/pos_draft').json['data']
        self.assertEqual(restored['payload'],payload)
        self.assertEqual(self.client.post('/api/pos_draft',json={'id':'draft-test','version':0,'payload':payload}).status_code,409)
        sale=self.sale(mid,draft_id=restored['id'],draft_version=restored['version'])
        first=self.client.post('/api/add_sale',json=sale).json
        second=self.client.post('/api/add_sale',json=sale).json
        self.assertTrue(first['ok'],first);self.assertEqual(first,second)
        self.assertIsNone(self.client.get('/api/pos_draft').json['data'])
        self.assertEqual(json.loads(api.PharmacyAPI().get_medicine(mid))['data']['stock'],39)
        self.assertFalse(self.client.post('/api/pos_draft',json={'id':'draft-test','version':0,'payload':payload}).json['ok'])

    def test_drafts_and_unit_permissions_are_isolated(self):
        self.login();mid=self.medicine()
        self.client.post('/api/pos_draft',json={'id':'admin-draft','version':0,'payload':{'cart':[]}})
        self.login(username='assistant',password='123456')
        self.assertIsNone(self.client.get('/api/pos_draft').json['data'])
        self.assertEqual(self.client.get('/api/barcode_units/'+mid).status_code,403)
        self.assertFalse(self.client.post('/api/pos_draft',json={'owner':'another-user','id':'wrong','version':0,'payload':{'cart':[]}}).json['ok'])
        self.assertEqual(self.client.get('/api/secondary_backup').status_code,403)

    def test_lists_omit_image_data_and_edits_preserve_photo(self):
        self.login();mid=self.medicine(image_data=PNG)
        for endpoint in ('get_medicines','get_top_selling_meds/50','search_medicines?q=اختبار'):
            meds=self.client.get('/api/'+endpoint).json['data']
            row=next(m for m in meds if m['id']==mid)
            self.assertNotIn('image_data',row);self.assertTrue(row['has_image'])
        self.assertTrue(json.loads(api.PharmacyAPI().update_medicine(mid,json.dumps({'name':'تعديل بلا صورة'})))['ok'])
        self.assertEqual(self.client.get('/api/medicine_image/'+mid).status_code,200)
        self.client.post('/api/logout',json={})
        self.assertEqual(self.client.get('/api/medicine_image/'+mid).status_code,401)

    def test_secondary_backup_is_verified_and_failure_keeps_local_copy(self):
        self.login();self.medicine()
        previous=api.BACKUP_DIR
        with tempfile.TemporaryDirectory() as extra:
            try:
                api.BACKUP_DIR=os.path.join(self.tmp.name,'backups')
                response=self.client.post('/api/secondary_backup',json={'directory':extra})
                self.assertTrue(response.json['ok'],response.json)
                result=backup_store.run_backup()
                self.assertTrue(os.path.isfile(result['secondary_path']))
                self.assertEqual(backup_store.status()['state'],'ok')
                with closing(sqlite3.connect(result['secondary_path'])) as con:
                    self.assertEqual(con.execute('PRAGMA quick_check').fetchone()[0],'ok')
                with closing(api._conn()) as con:
                    con.execute('UPDATE backup_config SET directory=?',(os.path.join(extra,'disconnected'),));con.commit()
                failed=backup_store.run_backup()
                self.assertTrue(failed['secondary_error']);self.assertTrue(os.path.isfile(failed['path']))
                self.assertEqual(backup_store.status()['state'],'failed')
            finally: api.BACKUP_DIR=previous

    def test_backup_retention_keeps_five_managed_files_only(self):
        self.login();self.medicine()
        previous=api.BACKUP_DIR
        with tempfile.TemporaryDirectory() as extra:
            try:
                api.BACKUP_DIR=os.path.join(self.tmp.name,'backups')
                self.assertTrue(self.client.post('/api/secondary_backup',json={'directory':extra}).json['ok'])
                unrelated=os.path.join(extra,'my_database.db')
                with open(unrelated,'wb') as handle: handle.write(b'keep me')
                with open(os.path.join(extra,'auto_pharmacy_old.db'),'wb') as handle: handle.write(b'old managed backup')
                for _ in range(7): backup_store.run_backup()
                local=[name for name in os.listdir(api.BACKUP_DIR) if name.startswith('pharmacy_')]
                secondary=[name for name in os.listdir(extra) if name.startswith(('pharmacy_','auto_pharmacy_'))]
                self.assertEqual(len(local),5)
                self.assertEqual(len(secondary),5)
                self.assertTrue(os.path.isfile(unrelated))
            finally: api.BACKUP_DIR=previous

    def test_restore_rejects_outside_or_invalid_files_and_restores_verified_snapshot(self):
        self.login()
        snapshot = backup_store.run_backup('system-test')
        outside = os.path.join(self.tmp.name, 'outside.db')
        with closing(sqlite3.connect(outside)) as con:
            con.execute('CREATE TABLE fake(value TEXT)')
        denied = self.client.post('/api/restore_database', json={'backup_path': outside}).json
        self.assertFalse(denied['ok'], denied)

        invalid = os.path.join(api.BACKUP_DIR, 'pharmacy_backup_invalid.db')
        with closing(sqlite3.connect(invalid)) as con:
            con.execute('CREATE TABLE fake(value TEXT)')
        rejected = self.client.post('/api/restore_database', json={'backup_path': invalid}).json
        self.assertFalse(rejected['ok'], rejected)

        created = self.medicine(name='صنف بعد النسخة')
        restored = self.client.post('/api/restore_database', json={'backup_path': snapshot['path']}).json
        self.assertTrue(restored['ok'], restored)
        self.assertIsNone(json.loads(api.PharmacyAPI().get_medicine(created))['data'])
        self.assertTrue(os.path.isfile(restored['data']['pre_backup']))
        with closing(sqlite3.connect(restored['data']['pre_backup'])) as con:
            self.assertEqual(con.execute('PRAGMA quick_check').fetchone()[0], 'ok')


if __name__=='__main__':unittest.main()
