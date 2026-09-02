import json
import os
import tempfile
import unittest

import api


class NewPharmacyFeaturesTests(unittest.TestCase):
    def setUp(self):
        fd, self.path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        self.old_path = api.DB_PATH
        api.DB_PATH = self.path
        api.init_db()
        self.api = api.PharmacyAPI()

    def tearDown(self):
        api.DB_PATH = self.old_path
        if os.path.exists(self.path):
            os.unlink(self.path)

    def _medicine(self, controlled=0):
        result = json.loads(self.api.add_medicine(json.dumps({
            "name": "دواء اختبار", "category": "اختبار", "price": 10,
            "cost": 5, "stock": 40, "unit": "قرص", "sale_unit": "قرص",
            "purchase_unit": "علبة", "conversion_factor": 20,
            "controlled": controlled,
        })))
        self.assertTrue(result["ok"], result)
        return result["data"]

    def test_controlled_sale_requires_and_stores_prescription(self):
        mid = self._medicine(controlled=1)
        sale = {"items": [{"medId": mid, "name": "دواء اختبار", "qty": 1, "price": 10, "total": 10}], "subtotal": 10, "total": 10}
        self.assertFalse(json.loads(self.api.add_sale(json.dumps(sale)))["ok"])
        sale["prescription"] = {"doctor_name": "طبيب", "doctor_license": "LIC-1", "prescription_type": "جدول"}
        self.assertTrue(json.loads(self.api.add_sale(json.dumps(sale)))["ok"])
        self.assertEqual(json.loads(self.api.get_prescriptions_report())["data"]["count"], 1)

    def test_credit_sale_creates_debt_and_splits_insurance(self):
        mid = self._medicine()
        con = api._conn()
        con.execute("INSERT INTO patients(id,name,phone,coverage_pct) VALUES(?,?,?,?)", ("P1", "مريض", "1", 50))
        con.commit(); con.close()
        sale = {"patient_id": "P1", "patient_name": "مريض", "payment_method": "آجل",
                "items": [{"medId": mid, "name": "دواء اختبار", "qty": 1, "price": 10, "total": 10}],
                "subtotal": 10, "total": 10}
        result = json.loads(self.api.add_sale(json.dumps(sale)))
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["data"]["insuranceAmount"], 5)
        self.assertEqual(len(json.loads(self.api.get_debts())["data"]), 1)
        self.assertEqual(json.loads(self.api.get_insurance_report())["data"]["total"], 5)

    def test_csv_import_reports_rejected_rows(self):
        csv_text = "name,scientific_name,category,barcode,price,cost,stock,unit,expiry,location,min_stock\nA,S,C,123,10,5,2,قرص,2028-01-01,A1,1\nB,S,C,123,10,5,2,قرص,2028-01-01,A1,1\n"
        result = json.loads(self.api.import_medicines(csv_text))
        self.assertTrue(result["ok"])
        self.assertEqual(result["data"]["saved"], 1)
        self.assertEqual(result["data"]["rejected"], 1)

    def test_partial_medicine_update_preserves_safety_and_barcode_fields(self):
        mid = self._medicine(controlled=1)
        con = api._conn()
        con.execute("UPDATE medicines SET company_barcode='COMP',pharmacy_barcode='PHARM' WHERE id=?", (mid,))
        con.commit(); con.close()
        result = json.loads(self.api.update_medicine(mid, json.dumps({"name": "اسم معدل", "price": 12})))
        self.assertTrue(result["ok"], result)
        med = json.loads(self.api.get_medicine(mid))["data"]
        self.assertEqual(med["controlled"], 1)
        self.assertEqual(med["company_barcode"], "COMP")
        self.assertEqual(med["pharmacy_barcode"], "PHARM")
        self.assertEqual(med["conversion_factor"], 20)


if __name__ == "__main__":
    unittest.main()
