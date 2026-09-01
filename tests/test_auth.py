import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta

import api


class AuthenticationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.original_db = api.DB_PATH
        api.DB_PATH = os.path.join(self.tmp.name, "auth-test.db")
        api._LOGIN_FAILURES.clear()
        api.init_db()
        api.seed_if_empty()
        self.service = api.PharmacyAPI()

    def tearDown(self):
        api._LOGIN_FAILURES.clear()
        api.DB_PATH = self.original_db
        self.tmp.cleanup()

    def login(self, username, password):
        return json.loads(self.service.login(username, password))

    def test_default_accounts_can_login(self):
        for username, password in (
            ("admin", "admin123"),
            ("pharmacist", "123456"),
            ("assistant", "123456"),
        ):
            result = self.login(username, password)
            self.assertTrue(result["ok"], result.get("error"))
            self.assertNotIn("password", result["data"])

    def test_username_is_trimmed_and_case_insensitive(self):
        result = self.login("  AdMiN  ", "admin123")
        self.assertTrue(result["ok"], result.get("error"))
        self.assertEqual(result["data"]["username"], "admin")

    def test_failed_attempts_lock_then_reset_after_expiry(self):
        for _ in range(api._MAX_ATTEMPTS - 1):
            result = self.login("admin", "wrong")
            self.assertFalse(result["ok"])
        locked = self.login("admin", "wrong")
        self.assertIn("قفل الحساب", locked["error"])
        correct_while_locked = self.login("admin", "admin123")
        self.assertFalse(correct_while_locked["ok"])

        api._LOGIN_FAILURES["admin"] = (
            api._MAX_ATTEMPTS,
            datetime.now() - timedelta(seconds=1),
        )
        after_expiry = self.login("admin", "admin123")
        self.assertTrue(after_expiry["ok"], after_expiry.get("error"))

    def test_unknown_user_uses_same_safe_error(self):
        result = self.login("not-a-user", "wrong")
        self.assertFalse(result["ok"])
        self.assertIn("اسم المستخدم أو كلمة المرور", result["error"])


if __name__ == "__main__":
    unittest.main()
