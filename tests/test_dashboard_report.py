import json
import os
import tempfile
import unittest

import api


class DashboardReportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.original_db = api.DB_PATH
        api.DB_PATH = os.path.join(self.tmp.name, "dashboard-test.db")
        api.init_db()
        api.seed_if_empty()
        self.service = api.PharmacyAPI()

        con = api._conn()
        con.execute("DELETE FROM sale_items")
        con.execute("DELETE FROM sales")
        med = con.execute("SELECT id FROM medicines ORDER BY id LIMIT 1").fetchone()[0]
        sales = [
            ("T-S1", "TEST-001", 1, 2026, 100.0, 5.0, 10.0, "نقدي", "2026-08-01", "10:00", "مكتمل"),
            ("T-S2", "TEST-002", 2, 2026, 200.0, 0.0, 20.0, "بطاقة", "2026-08-15", "11:00", "مكتمل"),
            ("T-S3", "TEST-003", 3, 2026, 300.0, 0.0, 30.0, "نقدي", "2026-09-01", "12:00", "مكتمل"),
            ("T-S4", "TEST-004", 4, 2026, 900.0, 0.0, 90.0, "نقدي", "2026-08-20", "13:00", "ملغاة"),
        ]
        for sid, invoice, seq, year, total, discount, tax, payment, sale_date, sale_time, status in sales:
            con.execute(
                "INSERT INTO sales(id,invoice_num,invoice_seq,invoice_year,subtotal,discount,tax,total,payment_method,sale_date,sale_time,status) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                (sid, invoice, seq, year, total - tax + discount, discount, tax, total, payment, sale_date, sale_time, status),
            )
            con.execute(
                "INSERT INTO sale_items(sale_id,med_id,name,qty,price,total) VALUES(?,?,?,?,?,?)",
                (sid, med, "دواء اختباري", 2, total / 2, total),
            )
        con.commit()
        con.close()

    def tearDown(self):
        api.DB_PATH = self.original_db
        self.tmp.cleanup()

    def test_report_uses_inclusive_range_and_excludes_voided_sales(self):
        result = json.loads(self.service.get_dashboard_report("2026-08-01", "2026-08-31"))
        self.assertTrue(result["ok"], result.get("error"))
        data = result["data"]
        self.assertEqual(data["summary"]["count"], 2)
        self.assertEqual(data["summary"]["revenue"], 300.0)
        self.assertEqual(data["summary"]["discount"], 5.0)
        self.assertEqual(data["summary"]["tax"], 30.0)
        self.assertEqual(data["topMedicines"][0]["qty"], 4)
        self.assertEqual(len(data["recentSales"]), 2)

    def test_rejects_reversed_or_invalid_dates(self):
        reversed_result = json.loads(self.service.get_dashboard_report("2026-09-01", "2026-08-01"))
        invalid_result = json.loads(self.service.get_dashboard_report("not-a-date", "2026-08-01"))
        self.assertFalse(reversed_result["ok"])
        self.assertFalse(invalid_result["ok"])


if __name__ == "__main__":
    unittest.main()
