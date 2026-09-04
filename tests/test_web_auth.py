"""Authentication regression checks against an isolated SQLite database."""
import json
import os
import tempfile
import unittest
from flask import Flask

import api
from routes import register_routes
from server_auth import COOKIE


class WebAuthenticationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.original_db = api.DB_PATH
        self.original_backup_dir = api.BACKUP_DIR
        api.DB_PATH = os.path.join(self.tmp.name, "web-auth.db")
        api.BACKUP_DIR = os.path.join(self.tmp.name, "backups")
        api._LOGIN_FAILURES.clear()
        api.init_db()
        api.seed_if_empty()
        self.app = Flask(__name__, static_folder=os.path.dirname(os.path.dirname(__file__)), static_url_path="")
        self.app.testing = True
        register_routes(self.app)
        self.client = self.app.test_client()

    def tearDown(self):
        api.DB_PATH = self.original_db
        api.BACKUP_DIR = self.original_backup_dir
        api._LOGIN_FAILURES.clear()
        self.tmp.cleanup()

    def login(self, client=None, username="admin", password="admin123"):
        response = (client or self.client).post("/api/login", json={"username": username, "password": password})
        self.assertTrue(response.json["ok"], response.json)
        return response

    def test_no_cookie_or_forged_identity_cannot_access_data(self):
        self.assertIsNone(self.client.get("/api/current_session").json["data"])
        self.assertEqual(self.client.get("/api/get_current_user/U001").status_code, 401)
        self.assertEqual(self.client.post("/api/add_user", json={"__user_id": "U001"}).status_code, 401)
        self.client.set_cookie(COOKIE, "forged-token")
        self.assertEqual(self.client.get("/api/get_medicines").status_code, 401)

    def test_login_restore_and_logout_revoke_cookie(self):
        response = self.login()
        cookie = response.headers["Set-Cookie"]
        self.assertIn("HttpOnly", cookie)
        self.assertIn("SameSite=Strict", cookie)
        self.assertNotIn("Max-Age", cookie)
        token = self.client.get_cookie(COOKIE).value
        current = self.client.get("/api/current_session").json["data"]
        self.assertEqual(current["username"], "admin")
        self.assertNotIn("password", current)
        self.assertEqual(self.client.get("/api/get_medicines", headers={"Content-Type": "application/json"}).status_code, 200)
        self.assertTrue(self.client.post("/api/logout", json={}).json["ok"])
        backups = [name for name in os.listdir(api.BACKUP_DIR) if name.endswith('.db')]
        self.assertEqual(len(backups), 1)
        self.assertRegex(backups[0], r'^pharmacy_backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_')
        self.client.set_cookie(COOKIE, token)
        self.assertEqual(self.client.get("/api/get_medicines").status_code, 401)
        self.assertTrue(self.client.post("/api/logout", json={}).json["ok"])

    def test_expiry_and_server_restart_require_login(self):
        self.login()
        token = self.client.get_cookie(COOKIE).value
        self.app.extensions["pharmacy_sessions"][token]["expires"] = 0
        self.assertIsNone(self.client.get("/api/current_session").json["data"])
        self.assertEqual(self.client.get("/api/get_users").status_code, 401)
        self.login()
        self.app.extensions["pharmacy_sessions"].clear()
        self.assertEqual(self.client.get("/api/get_users").status_code, 401)

    def test_request_cannot_impersonate_admin(self):
        self.login(username="pharmacist", password="123456")
        result = self.client.post("/api/add_user", json={"__user_id": "U001", "username": "intruder", "full_name": "اختبار"})
        self.assertEqual(result.status_code, 403)
        self.assertFalse(result.json["ok"])
        self.assertEqual(self.client.get("/api/get_current_user/U001").status_code, 403)

    def test_permissions_are_enforced_by_server_not_only_ui(self):
        self.login(username="assistant", password="123456")
        # Daily POS reads remain available to the assistant.
        self.assertEqual(self.client.get("/api/get_medicines").status_code, 200)
        self.assertEqual(self.client.get("/api/get_dashboard_report").status_code, 200)
        # Direct API calls cannot bypass hidden navigation/actions.
        blocked = [
            ("/api/add_medicine", {"name": "غير مصرح"}),
            ("/api/add_supplier", {"name": "غير مصرح"}),
            ("/api/set_setting", {"key": "tax_rate", "value": "99"}),
            ("/api/add_account", {"name": "غير مصرح"}),
            ("/api/add_employee", {"full_name": "غير مصرح"}),
            ("/api/backup_database", {}),
        ]
        for path, body in blocked:
            response = self.client.post(path, json=body)
            self.assertEqual(response.status_code, 403, path)
        self.assertEqual(self.client.get("/api/get_audit_log").status_code, 403)

    def test_admin_setting_change_is_validated_and_audited(self):
        self.login()
        self.assertFalse(self.client.post("/api/set_setting", json={"key": "../bad", "value": "x"}).json["ok"])
        changed = self.client.post("/api/set_setting", json={"key": "tax_rate", "value": "0"})
        self.assertTrue(changed.json["ok"], changed.json)
        from contextlib import closing
        with closing(api._conn()) as con:
            row = con.execute("SELECT action,entity_id,user_id FROM audit_log WHERE action='UPDATE_SETTING' ORDER BY timestamp DESC LIMIT 1").fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row["entity_id"], "tax_rate")
            self.assertTrue(row["user_id"])

    def test_security_headers_are_sent(self):
        response = self.client.get("/")
        self.assertEqual(response.headers.get("X-Frame-Options"), "DENY")
        self.assertEqual(response.headers.get("X-Content-Type-Options"), "nosniff")
        self.assertIn("frame-ancestors 'none'", response.headers.get("Content-Security-Policy", ""))

    def test_user_password_and_role_validation(self):
        self.login()
        weak = self.client.post("/api/add_user", json={
            "username": "weak-user", "full_name": "مستخدم ضعيف",
            "password": "123", "role": "صيدلاني مسؤول",
        })
        self.assertFalse(weak.json["ok"], weak.json)
        bad_role = self.client.post("/api/add_user", json={
            "username": "bad-role", "full_name": "مستخدم دور",
            "password": "StrongPassword1", "role": "مدير مزيف",
        })
        self.assertFalse(bad_role.json["ok"], bad_role.json)

    def test_change_password_rotates_session_and_revokes_other_sessions(self):
        self.login()
        other = self.app.test_client()
        self.login(other)
        old_token = self.client.get_cookie(COOKIE).value
        bad = self.client.post("/api/change_password", json={"old_pwd": "admin123", "new_pwd": "x"})
        self.assertFalse(bad.json["ok"])
        good = self.client.post("/api/change_password", json={"uid": "U002", "old_pwd": "admin123", "new_pwd": "changed-test-password"})
        self.assertTrue(good.json["ok"], good.json)
        self.assertNotEqual(old_token, self.client.get_cookie(COOKIE).value)
        self.assertEqual(self.client.get("/api/get_medicines").status_code, 200)
        self.assertEqual(other.get("/api/get_medicines").status_code, 401)

    def test_public_branding_and_assets_but_not_project_secrets(self):
        self.assertEqual(self.client.get("/api/get_setting/pharmacy_name").status_code, 200)
        self.assertEqual(self.client.get("/api/get_setting/tax_rate").status_code, 401)
        with self.client.get("/src/css/login.css") as asset:
            self.assertEqual(asset.status_code, 200)
        for path in ("/api.py", "/pharmacy.db", "/backups/test.db", "/.git/config"):
            self.assertEqual(self.client.get(path).status_code, 404, path)

    def test_bad_credentials_and_cross_origin_requests(self):
        bad = self.client.post("/api/login", json={"username": "admin", "password": "wrong"})
        self.assertFalse(bad.json["ok"])
        self.assertIsNone(self.client.get_cookie(COOKIE))
        cross = self.client.post("/api/login", json={}, headers={"Origin": "https://example.com"})
        self.assertEqual(cross.status_code, 403)
        self.assertEqual(self.client.post("/api/login", json=["bad"]).status_code, 400)


if __name__ == "__main__":
    unittest.main()
