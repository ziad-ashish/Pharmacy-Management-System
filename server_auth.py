"""جلسات محلية مؤقتة؛ تُلغى عند الخروج أو إعادة تشغيل الخادم."""
import hashlib
import secrets
import time
from contextlib import closing
from threading import RLock
from urllib.parse import urlsplit

from flask import abort, g, jsonify, request
import api

COOKIE = "pharmacy_session"
SESSION_SECONDS = 12 * 60 * 60

# Server-side authorization policy.  The UI hides unavailable pages, but that
# is never a security boundary: every sensitive API is checked again here.
# A tuple means that having any one of the listed permissions is sufficient.
ENDPOINT_PERMISSIONS = {
    # Medicines and barcode lookup used by the point of sale.
    "get_medicines": ("medicines", "medicines_view", "sales"),
    "get_medicine": ("medicines", "medicines_view", "sales"),
    "get_medicine_by_barcode": ("medicines", "medicines_view", "sales"),
    "get_categories": ("medicines", "medicines_view", "sales"),
    "get_low_stock": ("medicines", "medicines_view", "reports"),
    "get_expiring": ("medicines", "medicines_view", "reports"),
    "search_medicines": ("medicines", "medicines_view", "sales"),
    "get_top_selling_meds": ("medicines", "medicines_view", "sales"),
    "scan_resolve": ("medicines", "medicines_view", "sales"),
    "medicine_image": ("medicines", "medicines_view", "sales"),
    "add_medicine": ("medicines",),
    "update_medicine": ("medicines",),
    "delete_medicine": ("medicines",),
    "import_medicines": ("medicines",),
    "link_barcode": ("medicines",),
    "barcode_units": ("medicines",),
    "scan_draft": ("medicines",),

    # Patients, sales, invoices and cash sessions.
    "get_patients": ("patients", "sales"),
    "get_patient": ("patients", "sales"),
    "get_patient_debt": ("patients", "sales"),
    "get_loyalty": ("patients", "sales"),
    "add_patient": ("patients",),
    "update_patient": ("patients",),
    "delete_patient": ("patients",),
    "add_sale": ("sales",),
    "pos_draft": ("sales",),
    "get_sales": ("invoices", "invoices_view", "sales"),
    "get_sale": ("invoices", "invoices_view", "sales"),
    "void_sale": ("invoices",),
    "get_debts": ("patients", "sales"),
    "pay_debt": ("patients", "sales"),
    "get_active_session": ("sales",),
    "open_session": ("sales",),
    "close_session": ("sales",),
    "get_sessions": ("sales", "reports"),

    # Suppliers and purchasing.
    "get_suppliers": ("suppliers",),
    "get_supplier": ("suppliers",),
    "add_supplier": ("suppliers",),
    "update_supplier": ("suppliers",),
    "delete_supplier": ("suppliers",),
    "get_purchases": ("suppliers",),
    "get_purchase": ("suppliers",),
    "add_purchase": ("suppliers",),
    "receive_purchase": ("suppliers",),
    "cancel_purchase": ("suppliers",),

    # Reports and prescription records.
    "get_prescriptions_report": ("reports",),
    "get_turnover_report": ("reports",),
    "get_insurance_report": ("reports",),
    "get_dashboard_report": ("reports", "sales"),
    "get_monthly_sales": ("reports",),
    "get_top_medicines": ("reports",),
    "get_category_dist": ("reports",),
    "get_recent_activity": ("reports",),
    "get_profit_report": ("reports",),
    "get_prescription_images": ("patients",),

    # Administration-only data and mutations.
    "set_setting": ("all",),
    "backup_database": ("all",),
    "restore_database": ("all",),
    "list_backups": ("all",),
    "get_audit_log": ("all",),
    "get_users": ("all",),
    "add_user": ("all",),
    "update_user": ("all",),
    "delete_user": ("all",),
    "reset_user_password": ("all",),
    "secondary_backup": ("all",),
    "get_accounts": ("all",),
    "add_account": ("all",),
    "update_account": ("all",),
    "delete_account": ("all",),
    "get_transactions": ("all",),
    "add_transaction": ("all",),
    "get_financial_summary": ("all",),
    "get_employees": ("all",),
    "add_employee": ("all",),
    "update_employee": ("all",),
    "delete_employee": ("all",),
    "get_payroll": ("all",),
    "add_payroll": ("all",),
    "get_employee_performance": ("all",),
}


def install_auth(app):
    sessions = {}
    lock = RLock()
    app.extensions["pharmacy_sessions"] = sessions

    def fingerprint(password):
        return hashlib.sha256(password.encode()).hexdigest()

    def account(uid):
        with closing(api._conn()) as con:
            row = con.execute("SELECT password FROM users WHERE id=?", (uid,)).fetchone()
        return fingerprint(row["password"]) if row else None

    def revoke(audit=False):
        with lock:
            entry = sessions.pop(request.cookies.get(COOKIE), None)
        if audit and entry:
            with closing(api._conn()) as con:
                api._audit(con, entry["uid"], "LOGOUT", "user", entry["uid"], "تسجيل خروج")
                con.commit()
        return entry

    def issue(response, uid):
        token = secrets.token_urlsafe(32)
        with lock:
            revoke()
            now = time.time()
            for key, value in list(sessions.items()):
                if value["expires"] <= now:
                    sessions.pop(key, None)
            sessions[token] = {"uid": uid, "expires": now + SESSION_SECONDS,
                               "fingerprint": account(uid)}
        response.set_cookie(COOKIE, token, httponly=True, samesite="Strict",
                            secure=request.is_secure, path="/")
        return response

    app.extensions["pharmacy_issue_session"] = issue
    app.extensions["pharmacy_revoke_session"] = revoke

    @app.before_request
    def authenticate():
        # Flask's static root is the project: never serve databases/backups/source.
        if request.endpoint == "static":
            path = (request.view_args or {}).get("filename", "")
            allowed = path == "index.html" or (
                path.startswith(("src/css/", "src/js/", "assets/"))
                and path.rsplit(".", 1)[-1].lower() in
                {"css", "js", "svg", "png", "jpg", "jpeg", "webp", "ico", "woff", "woff2", "ttf"}
                and ".." not in path.replace("\\", "/").split("/"))
            if not allowed:
                abort(404)
        if not request.path.startswith("/api/"):
            return
        if request.method == "POST":
            origin = request.headers.get("Origin")
            if origin and urlsplit(origin).netloc != request.host:
                return jsonify(ok=False, error="مصدر الطلب غير مسموح"), 403
            if not request.is_json and request.mimetype != "multipart/form-data":
                return jsonify(ok=False, error="صيغة الطلب غير صالحة"), 415
        public = request.endpoint in {"login", "logout"} or (
            request.endpoint == "get_setting" and (request.view_args or {}).get("key")
            in {"pharmacy_name", "pharmacy_logo", "ui_theme_mode", "ui_theme_accent"})
        if public:
            return
        with lock:
            token = request.cookies.get(COOKIE)
            entry = sessions.get(token)
            valid = entry and entry["expires"] > time.time() and account(entry["uid"]) == entry["fingerprint"]
            if not valid:
                sessions.pop(token, None)
                if request.endpoint == "current_session":
                    return jsonify(ok=True, data=None)
                return jsonify(ok=False, error="انتهت جلسة الدخول. سجّل الدخول مرة أخرى."), 401
            g.user_id = entry["uid"]
        required = ENDPOINT_PERMISSIONS.get(request.endpoint)
        if required:
            with closing(api._conn()) as con:
                row = con.execute("SELECT role FROM users WHERE id=?", (g.user_id,)).fetchone()
            if not row or not any(api._has_perm(row["role"], permission) for permission in required):
                return jsonify(ok=False, error="لا تملك الصلاحية اللازمة لتنفيذ هذه العملية"), 403
        # Existing routes share the cached JSON dictionary; audit identity is
        # always supplied by the server, never by localStorage or a request ID.
        if request.method == "POST" and request.is_json:
            body = request.get_json(silent=True)
            if not isinstance(body, dict):
                return jsonify(ok=False, error="بيانات الطلب غير صالحة"), 400
            body["__user_id"] = g.user_id

    @app.after_request
    def no_auth_cache(response):
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(self), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; "
            "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com; "
            "img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'"
        )
        return response
