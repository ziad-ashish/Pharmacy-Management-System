# ══════════════════════════════════════════════════════════════
#  MAIN.PY  —  Pharmacy Management System  |  Desktop App
#  Engine  : PyWebView 6.x
#  Backend : api.py  (SQLite)
# ══════════════════════════════════════════════════════════════

import os
import webview
from flask import Flask
from api import init_db, seed_if_empty
from routes import register_routes

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


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

    webview.start(debug=False)


if __name__ == "__main__":
    main()
