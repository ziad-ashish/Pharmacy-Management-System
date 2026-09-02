# ══════════════════════════════════════════════════════════════
#  MAIN.PY  —  Pharmacy Management System  |  Desktop App
#  Engine  : PyWebView 6.x
#  Backend : api.py  (SQLite)
# ══════════════════════════════════════════════════════════════

import os
import threading
import time
import webview
from flask import Flask
from api import init_db, seed_if_empty, auto_backup
from routes import register_routes

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def _backup_worker():
    """نسخة عند بدء التشغيل ثم كل 24 ساعة، بدون تعطيل واجهة الصيدلي."""
    while True:
        try:
            auto_backup()
        except Exception as exc:
            print(f"[backup] تعذر إنشاء النسخة الاحتياطية: {exc}")
        time.sleep(24 * 60 * 60)


def create_app():
    """Create the local web application used by the desktop window."""
    app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")
    register_routes(app)

    @app.get("/")
    def index():
        return app.send_static_file("index.html")

    return app


def main():
    init_db()
    seed_if_empty()
    threading.Thread(target=_backup_worker, name="pharmacy-auto-backup", daemon=True).start()

    app = create_app()

    webview.create_window(
        title            = "Pharmacy Management System",
        # Passing the Flask app makes PyWebView host it on a local HTTP server.
        # This keeps the UI, REST API and SQLite database on the same backend.
        url              = app,
        width            = 1380,
        height           = 820,
        min_size         = (1024, 680),
        resizable        = True,
        text_select      = False,
        background_color = "#0d2b2e",
    )

    # أدوات المطور تجعل WebView يفتح نافذة Edge DevTools وتشوّش تشغيل الصيدلية.
    # تبقى مغلقة في نسخة الاستخدام اليومي، ويمكن تفعيلها مؤقتاً أثناء التطوير فقط.
    webview.start(debug=False)


if __name__ == "__main__":
    main()
