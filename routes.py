# ══════════════════════════════════════════════════════════════
#  ROUTES.PY  —  Flask REST API endpoints
#  كل method في PharmacyAPI بتبقى endpoint على /api/<method>
#  الـ JS بينادي fetch('/api/method', {method:'POST', body:...})
# ══════════════════════════════════════════════════════════════

import json
from flask import request, jsonify, g
from api import PharmacyAPI
from server_auth import install_auth, COOKIE

_api = PharmacyAPI()


def _resp(raw: str):
    """تحوّل الـ JSON string اللي بترجعه api.py لـ Flask Response."""
    data = json.loads(raw)
    return jsonify(data)


def register_routes(app):
    """بتسجل كل الـ routes على الـ Flask app."""
    install_auth(app)

    # ── MEDICINES ─────────────────────────────────────────────
    @app.route("/api/get_medicines")
    def get_medicines():
        return _resp(_api.get_medicines())

    @app.route("/api/get_medicine/<mid>")
    def get_medicine(mid):
        return _resp(_api.get_medicine(mid))

    @app.route("/api/get_medicine_by_barcode/<path:barcode>")
    def get_medicine_by_barcode(barcode):
        return _resp(_api.get_medicine_by_barcode(barcode))

    @app.route("/api/add_medicine", methods=["POST"])
    def add_medicine():
        body    = request.get_json(force=True) or {}
        user_id = body.pop("__user_id", None)
        return _resp(_api.add_medicine(json.dumps(body), user_id))

    @app.route("/api/update_medicine/<mid>", methods=["POST"])
    def update_medicine(mid):
        body    = request.get_json(force=True) or {}
        user_id = body.pop("__user_id", None)
        return _resp(_api.update_medicine(mid, json.dumps(body), user_id))

    @app.route("/api/delete_medicine/<mid>", methods=["POST"])
    def delete_medicine(mid):
        body    = request.get_json(force=True) or {}
        user_id = body.get("__user_id")
        return _resp(_api.delete_medicine(mid, user_id))

    @app.route("/api/get_low_stock")
    def get_low_stock():
        return _resp(_api.get_low_stock())

    @app.route("/api/get_expiring")
    def get_expiring():
        return _resp(_api.get_expiring())

    @app.route("/api/get_categories")
    def get_categories():
        return _resp(_api.get_categories())

    # ── PATIENTS ──────────────────────────────────────────────
    @app.route("/api/get_patients")
    def get_patients():
        return _resp(_api.get_patients())

    @app.route("/api/get_patient/<pid>")
    def get_patient(pid):
        return _resp(_api.get_patient(pid))

    @app.route("/api/add_patient", methods=["POST"])
    def add_patient():
        body    = request.get_json(force=True) or {}
        user_id = body.pop("__user_id", None)
        return _resp(_api.add_patient(json.dumps(body), user_id))

    @app.route("/api/update_patient/<pid>", methods=["POST"])
    def update_patient(pid):
        body    = request.get_json(force=True) or {}
        user_id = body.pop("__user_id", None)
        return _resp(_api.update_patient(pid, json.dumps(body), user_id))

    @app.route("/api/delete_patient/<pid>", methods=["POST"])
    def delete_patient(pid):
        body    = request.get_json(force=True) or {}
        user_id = body.get("__user_id")
        return _resp(_api.delete_patient(pid, user_id))

    # ── SUPPLIERS ─────────────────────────────────────────────
    @app.route("/api/get_suppliers")
    def get_suppliers():
        return _resp(_api.get_suppliers())

    @app.route("/api/get_supplier/<sid>")
    def get_supplier(sid):
        return _resp(_api.get_supplier(sid))

    @app.route("/api/add_supplier", methods=["POST"])
    def add_supplier():
        body    = request.get_json(force=True) or {}
        user_id = body.pop("__user_id", None)
        return _resp(_api.add_supplier(json.dumps(body), user_id))

    @app.route("/api/update_supplier/<sid>", methods=["POST"])
    def update_supplier(sid):
        body    = request.get_json(force=True) or {}
        user_id = body.pop("__user_id", None)
        return _resp(_api.update_supplier(sid, json.dumps(body), user_id))

    @app.route("/api/delete_supplier/<sid>", methods=["POST"])
    def delete_supplier(sid):
        body    = request.get_json(force=True) or {}
        user_id = body.get("__user_id")
        return _resp(_api.delete_supplier(sid, user_id))

    # ── SALES ─────────────────────────────────────────────────
    @app.route("/api/get_sales")
    def get_sales():
        return _resp(_api.get_sales())

    @app.route("/api/get_sale/<sale_id>")
    def get_sale(sale_id):
        return _resp(_api.get_sale(sale_id))

    @app.route("/api/add_sale", methods=["POST"])
    def add_sale():
        body    = request.get_json(force=True) or {}
        user_id = body.pop("__user_id", None)
        return _resp(_api.add_sale(json.dumps(body), user_id))

    @app.route("/api/get_prescriptions_report")
    def get_prescriptions_report():
        return _resp(_api.get_prescriptions_report(request.args.get("month", "")))

    @app.route("/api/get_top_selling_meds/<int:limit>")
    def get_top_selling_meds(limit): return _resp(_api.get_top_selling_meds(limit))

    @app.route("/api/search_medicines")
    def search_medicines(): return _resp(_api.search_medicines(request.args.get("q", "")))

    @app.route("/api/get_debts")
    def get_debts(): return _resp(_api.get_debts(request.args.get("overdue") == "1"))

    @app.route("/api/get_patient_debt/<patient_id>")
    def get_patient_debt(patient_id): return _resp(_api.get_patient_debt(patient_id))

    @app.route("/api/pay_debt/<debt_id>", methods=["POST"])
    def pay_debt(debt_id):
        body=request.get_json(force=True) or {}; uid=body.pop("__user_id",None)
        return _resp(_api.pay_debt(debt_id,body.get("amount",0),uid))

    @app.route("/api/import_medicines", methods=["POST"])
    def import_medicines():
        uid=g.user_id
        uploaded=request.files.get("file")
        if uploaded: text=uploaded.read().decode("utf-8-sig")
        else: text=(request.get_json(silent=True) or {}).get("csv","")
        return _resp(_api.import_medicines(text,uid))

    @app.route("/api/get_turnover_report")
    def get_turnover_report(): return _resp(_api.get_turnover_report(request.args.get("days",30)))

    @app.route("/api/get_loyalty/<patient_id>")
    def get_loyalty(patient_id): return _resp(_api.get_loyalty(patient_id))

    @app.route("/api/get_insurance_report")
    def get_insurance_report(): return _resp(_api.get_insurance_report(request.args.get("month","")))

    @app.route("/api/void_sale/<sale_id>", methods=["POST"])
    def void_sale(sale_id):
        body    = request.get_json(force=True) or {}
        user_id = body.get("__user_id")
        return _resp(_api.void_sale(sale_id, user_id))

    # ── STATS / REPORTS ───────────────────────────────────────
    @app.route("/api/get_stats")
    def get_stats():
        return _resp(_api.get_stats())

    @app.route("/api/get_dashboard_report")
    def get_dashboard_report():
        return _resp(_api.get_dashboard_report(
            request.args.get("from_date"),
            request.args.get("to_date"),
        ))

    @app.route("/api/get_monthly_sales")
    def get_monthly_sales():
        return _resp(_api.get_monthly_sales())

    @app.route("/api/get_top_medicines")
    def get_top_medicines():
        return _resp(_api.get_top_medicines())

    @app.route("/api/get_category_dist")
    def get_category_dist():
        return _resp(_api.get_category_dist())

    @app.route("/api/get_recent_activity")
    def get_recent_activity():
        return _resp(_api.get_recent_activity())

    @app.route("/api/get_profit_report")
    @app.route("/api/get_profit_report/<period>")
    def get_profit_report(period="all"):
        return _resp(_api.get_profit_report(period))

    # ── SETTINGS ──────────────────────────────────────────────
    @app.route("/api/get_setting/<key>")
    def get_setting(key):
        return _resp(_api.get_setting(key))

    @app.route("/api/set_setting", methods=["POST"])
    def set_setting():
        body = request.get_json(force=True) or {}
        return _resp(_api.set_setting(body.get("key",""), body.get("value","")))

    # ── BACKUP ────────────────────────────────────────────────
    @app.route("/api/backup_database", methods=["POST"])
    def backup_database():
        return _resp(_api.backup_database())

    @app.route("/api/get_backup_status")
    def get_backup_status():
        return _resp(_api.get_backup_status())

    @app.route("/api/list_backups")
    def list_backups():
        return _resp(_api.list_backups())

    @app.route("/api/restore_database", methods=["POST"])
    def restore_database():
        body = request.get_json(force=True) or {}
        return _resp(_api.restore_database(body.get("backup_path","")))

    # ── AUDIT LOG ─────────────────────────────────────────────
    @app.route("/api/get_audit_log")
    def get_audit_log():
        limit  = int(request.args.get("limit",  100))
        offset = int(request.args.get("offset", 0))
        return _resp(_api.get_audit_log(limit, offset))

    # ── AUTH ──────────────────────────────────────────────────
    @app.route("/api/login", methods=["POST"])
    def login():
        body = request.get_json(force=True) or {}
        if not isinstance(body, dict) or not all(isinstance(body.get(k, ""), str) for k in ("username", "password")):
            return jsonify(ok=False, error="بيانات الدخول غير صالحة"), 400
        result = json.loads(_api.login(body.get("username",""), body.get("password","")))
        response = jsonify(result)
        if result.get("ok"):
            app.extensions["pharmacy_issue_session"](response, result["data"]["id"])
        return response

    @app.get("/api/current_session")
    def current_session():
        return _resp(_api.get_current_user(g.user_id))

    @app.post("/api/logout")
    def logout():
        app.extensions["pharmacy_revoke_session"](audit=True)
        response = jsonify(ok=True, data=None)
        response.delete_cookie(COOKIE, path="/")
        return response

    @app.route("/api/get_users")
    def get_users():
        return _resp(_api.get_users())

    @app.route("/api/get_current_user/<uid>")
    def get_current_user(uid):
        if uid != g.user_id:
            return jsonify(ok=False, error="غير مصرح"), 403
        return _resp(_api.get_current_user(g.user_id))

    @app.route("/api/change_password", methods=["POST"])
    def change_password():
        body = request.get_json(force=True) or {}
        result = json.loads(_api.change_password(
            g.user_id,
            body.get("old_pwd",""),
            body.get("new_pwd","")
        ))
        response = jsonify(result)
        if result.get("ok"):
            app.extensions["pharmacy_issue_session"](response, g.user_id)
        return response

    @app.route("/api/check_permission", methods=["POST"])
    def check_permission():
        body = request.get_json(force=True) or {}
        return _resp(_api.check_permission(
            g.user_id,
            body.get("perm","")
        ))

    # ── USER MANAGEMENT ───────────────────────────────────────
    @app.route("/api/add_user", methods=["POST"])
    def add_user():
        body      = request.get_json(force=True) or {}
        caller_id = body.pop("__user_id", None)
        return _resp(_api.add_user(json.dumps(body), caller_id))

    @app.route("/api/update_user/<uid>", methods=["POST"])
    def update_user(uid):
        body      = request.get_json(force=True) or {}
        caller_id = body.pop("__user_id", None)
        return _resp(_api.update_user(uid, json.dumps(body), caller_id))

    @app.route("/api/delete_user/<uid>", methods=["POST"])
    def delete_user(uid):
        body      = request.get_json(force=True) or {}
        caller_id = body.get("__user_id")
        return _resp(_api.delete_user(uid, caller_id))

    @app.route("/api/reset_user_password/<uid>", methods=["POST"])
    def reset_user_password(uid):
        body      = request.get_json(force=True) or {}
        caller_id = body.pop("__user_id", None)
        return _resp(_api.reset_user_password(uid, json.dumps(body), caller_id))

    # ── PURCHASES ─────────────────────────────────────────────
    @app.route("/api/get_purchases")
    def get_purchases():
        return _resp(_api.get_purchases())

    @app.route("/api/get_purchase/<pid>")
    def get_purchase(pid):
        return _resp(_api.get_purchase(pid))

    @app.route("/api/add_purchase", methods=["POST"])
    def add_purchase():
        body    = request.get_json(force=True) or {}
        user_id = body.pop("__user_id", None)
        return _resp(_api.add_purchase(json.dumps(body), user_id))

    @app.route("/api/receive_purchase/<pid>", methods=["POST"])
    def receive_purchase(pid):
        body    = request.get_json(force=True) or {}
        user_id = body.pop("__user_id", None)
        return _resp(_api.receive_purchase(pid, json.dumps(body), user_id))

    @app.route("/api/cancel_purchase/<pid>", methods=["POST"])
    def cancel_purchase(pid):
        body    = request.get_json(force=True) or {}
        user_id = body.get("__user_id")
        return _resp(_api.cancel_purchase(pid, user_id))

    # ── ACCOUNTS ──────────────────────────────────────────────
    @app.route("/api/get_accounts")
    def get_accounts():
        return _resp(_api.get_accounts())

    @app.route("/api/add_account", methods=["POST"])
    def add_account():
        body    = request.get_json(force=True) or {}
        user_id = body.pop("__user_id", None)
        return _resp(_api.add_account(json.dumps(body), user_id))

    @app.route("/api/update_account/<aid>", methods=["POST"])
    def update_account(aid):
        body    = request.get_json(force=True) or {}
        user_id = body.pop("__user_id", None)
        return _resp(_api.update_account(aid, json.dumps(body), user_id))

    @app.route("/api/delete_account/<aid>", methods=["POST"])
    def delete_account(aid):
        body    = request.get_json(force=True) or {}
        user_id = body.get("__user_id")
        return _resp(_api.delete_account(aid, user_id))

    @app.route("/api/get_transactions")
    def get_transactions():
        account_id = request.args.get("account_id")
        limit  = int(request.args.get("limit",  100))
        offset = int(request.args.get("offset", 0))
        return _resp(_api.get_transactions(account_id, limit, offset))

    @app.route("/api/add_transaction", methods=["POST"])
    def add_transaction():
        body    = request.get_json(force=True) or {}
        user_id = body.pop("__user_id", None)
        return _resp(_api.add_transaction(json.dumps(body), user_id))

    @app.route("/api/get_financial_summary")
    def get_financial_summary():
        return _resp(_api.get_financial_summary())

    # ── CASH SESSIONS ─────────────────────────────────────────
    @app.route("/api/get_active_session")
    def get_active_session():
        return _resp(_api.get_active_session())

    @app.route("/api/open_session", methods=["POST"])
    def open_session():
        body    = request.get_json(force=True) or {}
        user_id = body.pop("__user_id", None)
        return _resp(_api.open_session(json.dumps(body), user_id))

    @app.route("/api/close_session/<sid>", methods=["POST"])
    def close_session(sid):
        body    = request.get_json(force=True) or {}
        user_id = body.pop("__user_id", None)
        return _resp(_api.close_session(sid, json.dumps(body), user_id))

    @app.route("/api/get_sessions")
    def get_sessions():
        return _resp(_api.get_sessions())

    # ── HR & PAYROLL ───────────────────────────────────────────
    @app.route("/api/get_employees")
    def get_employees():
        return _resp(_api.get_employees())

    @app.route("/api/add_employee", methods=["POST"])
    def add_employee():
        body    = request.get_json(force=True) or {}
        user_id = body.pop("__user_id", None)
        return _resp(_api.add_employee(json.dumps(body), user_id))

    @app.route("/api/update_employee/<eid>", methods=["POST"])
    def update_employee(eid):
        body    = request.get_json(force=True) or {}
        user_id = body.pop("__user_id", None)
        return _resp(_api.update_employee(eid, json.dumps(body), user_id))

    @app.route("/api/delete_employee/<eid>", methods=["POST"])
    def delete_employee(eid):
        body    = request.get_json(force=True) or {}
        user_id = body.get("__user_id")
        return _resp(_api.delete_employee(eid, user_id))

    @app.route("/api/get_payroll")
    def get_payroll():
        employee_id = request.args.get("employee_id")
        return _resp(_api.get_payroll(employee_id))

    @app.route("/api/add_payroll", methods=["POST"])
    def add_payroll():
        body    = request.get_json(force=True) or {}
        user_id = body.pop("__user_id", None)
        return _resp(_api.add_payroll(json.dumps(body), user_id))

    @app.route("/api/get_employee_performance")
    def get_employee_performance():
        employee_id = request.args.get("employee_id")
        return _resp(_api.get_employee_performance(employee_id))
