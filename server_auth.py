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
        return response
