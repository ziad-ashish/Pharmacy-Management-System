import base64
import json
import unittest
from contextlib import closing
import api
from camera_api import validate_image
import test_web_auth as web_auth

PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOYQAAAAASUVORK5CYII='


class CameraWorkflowTests(unittest.TestCase):
    setUp = web_auth.WebAuthenticationTests.setUp
    tearDown = web_auth.WebAuthenticationTests.tearDown
    login = web_auth.WebAuthenticationTests.login

    def med(self, **extra):
        data={"name":"Camera test medicine","category":"test","stock":40,"price":10,"cost":4,"unit":"قرص","sale_unit":"قرص","purchase_unit":"علبة","conversion_factor":20,**extra}
        result=json.loads(api.PharmacyAPI().add_medicine(json.dumps(data)))
        self.assertTrue(result['ok'],result)
        return result['data']

    def test_migration_is_repeatable(self):
        api.init_db();api.init_db()
        with closing(api._conn()) as con:
            for table in ('medicine_barcodes','prescription_pages','scan_drafts'):
                self.assertIsNotNone(con.execute("SELECT name FROM sqlite_master WHERE name=?",(table,)).fetchone())

    def test_alias_units_are_explicit_and_unique(self):
        self.login();mid=self.med(pharmacy_barcode='PH-UNIT-TEST')
        response=self.client.post('/api/link_barcode',json={"barcode":"BOX-TEST","medicine_id":mid,"unit":"علبة","quantity":20})
        self.assertTrue(response.json['ok'],response.json)
        match=self.client.get('/api/scan_resolve?code=BOX-TEST').json['data']
        self.assertEqual((match['id'],match['scan_quantity']),(mid,20))
        self.assertEqual(self.client.get('/api/scan_resolve?code=PH-UNIT-TEST').json['data']['scan_quantity'],1)
        self.assertFalse(self.client.post('/api/link_barcode',json={"barcode":"PH-UNIT-TEST","medicine_id":mid,"unit":"قرص","quantity":1}).json['ok'])
        self.assertFalse(json.loads(api.PharmacyAPI().add_medicine(json.dumps({"name":"duplicate","barcode":"BOX-TEST"})))['ok'])

    def test_assistant_cannot_link_or_view_prescription_images(self):
        self.login(username='assistant',password='123456')
        self.assertEqual(self.client.post('/api/link_barcode',json={}).status_code,403)
        self.assertEqual(self.client.get('/api/prescription_images/anything').status_code,403)
        self.assertEqual(self.client.get('/api/scan_draft/inventory').status_code,403)

    def test_draft_versions_isolate_users_and_do_not_mutate_stock(self):
        self.login();mid=self.med()
        saved=self.client.post('/api/scan_draft/inventory',json={"version":0,"items":[{"id":mid,"quantity":7}]}).json
        self.assertTrue(saved['ok'],saved)
        self.assertEqual(saved['data']['version'],1)
        self.assertEqual(self.client.post('/api/scan_draft/inventory',json={"version":0,"items":[]}).status_code,409)
        self.assertEqual(json.loads(api.PharmacyAPI().get_medicine(mid))['data']['stock'],40)
        self.login(username='pharmacist',password='123456')
        self.assertEqual(self.client.get('/api/scan_draft/inventory').json['data']['items'],[])
        self.assertFalse(self.client.post('/api/scan_draft/inventory',json={"version":0,"items":[{"id":mid,"quantity":1.5}]}).json['ok'])

    def test_prescription_pages_saved_atomically_and_read_is_audited(self):
        self.login();mid=self.med(controlled=1)
        sale={"items":[{"medId":mid,"name":"test","qty":1,"price":10,"total":10}],"prescription":{"doctor_name":"Test","doctor_license":"TEST","prescription_type":"جدول","images":[PNG,PNG]}}
        result=self.client.post('/api/add_sale',json=sale).json
        self.assertTrue(result['ok'],result)
        with closing(api._conn()) as con:
            rx=con.execute('SELECT * FROM prescriptions ORDER BY created_at DESC LIMIT 1').fetchone()
            self.assertEqual(con.execute('SELECT COUNT(*) FROM prescription_pages WHERE prescription_id=?',(rx['id'],)).fetchone()[0],2)
            sid=rx['sale_id']
        images=self.client.get('/api/prescription_images/'+sid).json['data']['images']
        self.assertEqual(images,[PNG,PNG])
        with closing(api._conn()) as con:
            self.assertEqual(con.execute("SELECT COUNT(*) FROM audit_log WHERE action='VIEW_PRESCRIPTION_IMAGES'").fetchone()[0],1)
        sale['prescription']['images']=['data:image/svg+xml;base64,'+base64.b64encode(b'<svg/>').decode()]
        self.assertFalse(self.client.post('/api/add_sale',json=sale).json['ok'])
        self.assertEqual(json.loads(api.PharmacyAPI().get_medicine(mid))['data']['stock'],39)

    def test_images_reject_oversize_or_mismatched_content(self):
        self.assertEqual(validate_image(PNG),PNG)
        for bad in ('https://external/image.jpg','data:image/jpeg;base64,aGVsbG8=','x'*1400001):
            with self.assertRaises(ValueError):validate_image(bad)

    def test_receiving_uses_purchase_units_and_rejects_foreign_or_excess_items(self):
        mid=self.med();service=api.PharmacyAPI()
        with closing(api._conn()) as con:
            supplier=con.execute('SELECT id FROM suppliers LIMIT 1').fetchone()[0]
        created=json.loads(service.add_purchase(json.dumps({"supplier_id":supplier,"items":[{"med_id":mid,"med_name":"test","qty_ordered":2,"unit_cost":80}]})))
        self.assertTrue(created['ok'],created);pid=created['data']['id']
        with closing(api._conn()) as con:line=con.execute('SELECT id FROM purchase_items WHERE purchase_id=?',(pid,)).fetchone()[0]
        self.assertFalse(json.loads(service.receive_purchase(pid,json.dumps({"items":[{"item_id":line,"qty_received":3}]})))['ok'])
        for cost in (-1, float('nan'), float('inf')):
            self.assertFalse(json.loads(service.receive_purchase(pid,json.dumps({"items":[{"item_id":line,"qty_received":1,"unit_cost":cost,"batch_number":"TEST","expiry":"2099-01-01"}]})))['ok'])
        self.assertEqual(json.loads(service.get_medicine(mid))['data']['stock'],40)
        good=json.loads(service.receive_purchase(pid,json.dumps({"items":[{"item_id":line,"qty_received":1,"unit_cost":80,"batch_number":"TEST","expiry":"2099-01-01"}]})))
        self.assertTrue(good['ok'],good)
        self.assertEqual(json.loads(service.get_medicine(mid))['data']['stock'],60)
        free=json.loads(service.receive_purchase(pid,json.dumps({"items":[{"item_id":line,"qty_received":1,"unit_cost":0,"batch_number":"TEST-FREE","expiry":"2099-01-01"}]})))
        self.assertTrue(free['ok'],free)
        self.assertEqual(json.loads(service.get_medicine(mid))['data']['cost'],0)


if __name__=='__main__':unittest.main()
