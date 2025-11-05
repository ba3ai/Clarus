# backend/app.py
import os
import secrets
from pathlib import Path
from typing import Optional, Iterable

from flask import Flask, jsonify, send_from_directory, abort, Response, session
from flask_cors import CORS
from flask_session import Session
from flask_mail import Mail
from dotenv import load_dotenv

from backend.config import Config
from backend.extensions import init_extensions, db, login_manager  # single shared SQLAlchemy/Migrate/JWT instances

# ===== Blueprints =====
from backend.routes.auth_routes import auth_bp
from backend.routes.admin_routes import admin_bp
from backend.routes.investor_routes import investor_bp
from backend.routes.metrics_routes import metrics_bp
from backend.routes.excel_routes import excel_bp
from backend.routes.admin_quickbooks import admin_qb_bp
from backend.routes.manual_entry_routes import manual_entry_bp
from backend.routes.invitations_routes import invitations_bp
from backend.routes.invite_accept_routes import invite_accept_bp
from backend.routes.sharepoint_excel_routes import bp as sharepoint_excel_bp
from backend.routes.auth_ms_routes import auth_ms_bp
from backend.routes.chat_routes import chat_bp
from backend.routes.profile_routes import profile_bp
from backend.routes.files_routes import files_bp
from backend.routes.contacts_routes import contacts_bp
from backend.routes.market import market_bp
from backend.routes.documents_routes import documents_bp
from backend.routes.qbo_routes import qbo_bp
from backend.routes.metrics_sync import metrics_sync_bp, init_autosync
from backend.routes.users_routes import users_bp
from backend.routes.portfolio_routes import portfolio_bp
from backend.auto_migrations import run_auto_migrations
from backend.routes.investor_sync_routes import investor_sync_bp
from backend.routes.statements_routes import statements_bp
from backend.routes.settings_routes import settings_bp
from backend.routes.kb_routes import kb_bp
from backend.scheduler import start_scheduler
from datetime import timedelta
from backend.models import User

mail = Mail()


# ---------- helpers ----------
def _to_bool(env_name: str, default: str = "true") -> bool:
    return (os.getenv(env_name, default) or "").strip().lower() in ("1", "true", "yes", "y")


def _apply_mail_config(app: Flask) -> None:
    """Configure Flask-Mail from env; supports Ethereal test mode."""
    load_dotenv()
    use_ethereal = _to_bool("USE_ETHEREAL", "false")

    if use_ethereal:
        app.config["MAIL_SERVER"] = os.getenv("MAIL_SERVER", "smtp.ethereal.email")
        app.config["MAIL_PORT"] = int(os.getenv("MAIL_PORT", "587"))
        app.config["MAIL_USE_TLS"] = _to_bool("MAIL_USE_TLS", "true")
        app.config["MAIL_USE_SSL"] = _to_bool("MAIL_USE_SSL", "false")
        app.config["MAIL_USERNAME"] = os.getenv("ETHEREAL_USER") or os.getenv("MAIL_USERNAME")
        app.config["MAIL_PASSWORD"] = os.getenv("ETHEREAL_PASS") or os.getenv("MAIL_PASSWORD")
        app.config["MAIL_DEFAULT_SENDER"] = (
            os.getenv("MAIL_DEFAULT_SENDER") or os.getenv("SMTP_FROM") or app.config.get("MAIL_USERNAME")
        )
    else:
        app.config.setdefault("MAIL_SERVER", os.getenv("MAIL_SERVER", "smtp.office365.com"))
        app.config.setdefault("MAIL_PORT", int(os.getenv("MAIL_PORT", "587")))
        app.config.setdefault("MAIL_USE_TLS", _to_bool("MAIL_USE_TLS", "true"))
        app.config.setdefault("MAIL_USE_SSL", _to_bool("MAIL_USE_SSL", "false"))
        username = os.getenv("SMTP_USER", os.getenv("MAIL_USERNAME"))
        password = os.getenv("SMTP_PASS", os.getenv("MAIL_PASSWORD"))
        default_sender = os.getenv("MAIL_DEFAULT_SENDER") or os.getenv("SMTP_FROM") or username
        if username:
            app.config.setdefault("MAIL_USERNAME", username)
        if password:
            app.config.setdefault("MAIL_PASSWORD", password)
        app.config.setdefault("MAIL_DEFAULT_SENDER", default_sender)

    app.config.setdefault("MAIL_SUPPRESS_SEND", False)


def _resolve_frontend_dist() -> Optional[Path]:
    """Locate the built SPA (Vite dist) in several common locations."""
    here = Path(__file__).resolve().parent

    # 1) explicit env
    env_dir = os.getenv("FRONTEND_DIST", "").strip()
    if env_dir:
        p = Path(env_dir).resolve()
        if p.is_dir():
            return p

    # 2) repo-root/frontend/dist
    p_root_frontend = (here / "frontend" / "dist").resolve()
    if p_root_frontend.is_dir():
        return p_root_frontend

    # 3) backend/frontend/dist
    p_backend_frontend = (here.parent / "frontend" / "dist").resolve()
    if p_backend_frontend.is_dir():
        return p_backend_frontend

    # 4) repo-root/dist
    p_root_dist = (here / "dist").resolve()
    if p_root_dist.is_dir():
        return p_root_dist

    return None


# =========================
#   Database bootstrap
# =========================
def _auto_db_bootstrap(app: Flask) -> None:
    """Run Alembic upgrade if migrations exist; otherwise create tables."""
    try:
        from flask_migrate import upgrade
        migrations_dir = (Path(__file__).resolve().parent.parent / "migrations")
        with app.app_context():
            if migrations_dir.is_dir():
                upgrade(directory=str(migrations_dir))  # apply migrations
            else:
                db.create_all()                          # first-time dev
    except Exception as e:
        print(f"⚠️ DB bootstrap warning: {e}")
        try:
            with app.app_context():
                db.create_all()
        except Exception as e2:
            print(f"⚠️ DB create_all() failed: {e2}")


def _create_missing_tables(app: Flask) -> None:
    """After Alembic upgrade, create any model tables not covered by migrations."""
    with app.app_context():
        db.create_all()


def _ensure_user_columns(app: Flask) -> None:
    """Bring SQLite 'user' table up-to-date with new columns if they don't exist."""
    from sqlalchemy import text
    required_cols = {
        "first_name": ("VARCHAR(100)", "''", True),
        "last_name": ("VARCHAR(100)", "''", True),
        "username": ("VARCHAR(120)", "NULL", False),
        "organization_name": ("VARCHAR(150)", "NULL", False),
        "address": ("VARCHAR(255)", "NULL", False),
        "phone": ("VARCHAR(50)", "NULL", False),
        "bank": ("VARCHAR(100)", "NULL", False),
        "status": ("VARCHAR(20)", "'Active'", True),
        "permission": ("VARCHAR(50)", "'Viewer'", True),
        "user_type": ("VARCHAR(50)", "'admin'", True),
    }
    with app.app_context():
        engine = db.engine
        with engine.connect() as conn:
            try:
                cols = {row[1] for row in conn.execute(text("PRAGMA table_info('user')")).fetchall()}
                for name, (ctype, default_sql, not_null) in required_cols.items():
                    if name not in cols:
                        nn = " NOT NULL" if not_null else ""
                        default_clause = f" DEFAULT {default_sql}" if default_sql is not None else ""
                        sql = f"ALTER TABLE user ADD COLUMN {name} {ctype}{nn}{default_clause};"
                        conn.execute(text(sql))
                conn.commit()
            except Exception as e:
                print(f"⚠️ ensure_user_columns skipped: {e}")


def _ensure_investor_columns(app: Flask) -> None:
    """Ensure the SQLite 'investor' table has all columns defined in the Investor model."""
    from sqlalchemy import text
    required_cols = {
        "company_name":    ("VARCHAR(150)",    None,            False),
        "address":         ("VARCHAR(255)",    None,            False),
        "contact_phone":   ("VARCHAR(50)",     None,            False),
        "email":           ("VARCHAR(120)",    None,            False),
        "account_user_id": ("INTEGER",         None,            False),
        "invitation_id":   ("INTEGER",         None,            False),
        "birthdate":       ("VARCHAR(20)",     None,            False),
        "citizenship":     ("VARCHAR(100)",    None,            False),
        "ssn_tax_id":      ("VARCHAR(64)",     None,            False),
        "address1":        ("VARCHAR(200)",    None,            False),
        "address2":        ("VARCHAR(200)",    None,            False),
        "country":         ("VARCHAR(100)",    None,            False),
        "city":            ("VARCHAR(100)",    None,            False),
        "state":           ("VARCHAR(100)",    None,            False),
        "zip":             ("VARCHAR(20)",     None,            False),
        "avatar_url":      ("VARCHAR(300)",    None,            False),
        # ✅ fixed types and sensible defaults
        "created_at":      ("DATETIME",        "(CURRENT_TIMESTAMP)", True),
        "updated_at":      ("DATETIME",        "(CURRENT_TIMESTAMP)", True),
    }
    with app.app_context():
        engine = db.engine
        with engine.connect() as conn:
            try:
                cols = {row[1] for row in conn.execute(text("PRAGMA table_info('investor')")).fetchall()}
                for name, (ctype, default_sql, not_null) in required_cols.items():
                    if name not in cols:
                        nn = " NOT NULL" if not_null else ""
                        default_clause = f" DEFAULT {default_sql}" if default_sql else ""
                        sql = f"ALTER TABLE investor ADD COLUMN {name} {ctype}{nn}{default_clause};"
                        conn.execute(text(sql))
                conn.commit()
            except Exception as e:
                print(f"⚠️ ensure_investor_columns skipped: {e}")


def _ensure_sp_connection_columns(app: Flask) -> None:
    """Ensure 'sp_connections' includes the new 'is_shared' flag, etc."""
    from sqlalchemy import text
    required_cols = {
        "url":        ("TEXT",           "''",   True),
        "drive_id":   ("VARCHAR(200)",   "''",   True),
        "item_id":    ("VARCHAR(200)",   "''",   True),
        "added_at":   ("DATETIME",       "NULL", False),
        "added_by":   ("VARCHAR(200)",   "NULL", False),
        "is_shared":  ("BOOLEAN",        "0",    True),
        "created_at": ("DATETIME",       "NULL", False),
        "updated_at": ("DATETIME",       "NULL", False),
    }
    with app.app_context():
        engine = db.engine
        with engine.connect() as conn:
            try:
                cols = {row[1] for row in conn.execute(text("PRAGMA table_info('sp_connections')")).fetchall()}
                for name, (ctype, default_sql, not_null) in required_cols.items():
                    if name not in cols:
                        nn = " NOT NULL" if not_null else ""
                        default_clause = f" DEFAULT {default_sql}" if default_sql is not None else ""
                        sql = f"ALTER TABLE sp_connections ADD COLUMN {name} {ctype}{nn}{default_clause};"
                        conn.execute(text(sql))
                conn.commit()
            except Exception as e:
                print(f"⚠️ ensure_sp_connection_columns skipped: {e}")


def _seed_default_admin(app: Flask) -> None:
    """Create a default admin user exactly once (no-op if present)."""
    admin_email = os.getenv("DEFAULT_ADMIN_EMAIL", "ba3ai@elpiscapital.com")
    admin_password = os.getenv("DEFAULT_ADMIN_PASSWORD", "Ba3aiAdmin123!")

    with app.app_context():
        try:
            from backend.models import User
        except Exception as e:
            print(f"⚠️ Seed skipped: cannot import User model: {e}")
            return

        try:
            exists = User.query.filter_by(email=admin_email).first()
        except Exception as e:
            print(f"⚠️ Seed query failed (likely schema mismatch): {e}")
            return

        if exists:
            return

        try:
            admin = User(
                first_name="BA3",
                last_name="AI",
                email=admin_email,
                user_type="admin",
                status="Active",
                permission="Viewer",
            )
            if hasattr(admin, "set_password"):
                admin.set_password(admin_password)
            else:
                try:
                    from werkzeug.security import generate_password_hash
                    if hasattr(admin, "password"):
                        admin.password = generate_password_hash(admin_password)
                except Exception:
                    pass

            db.session.add(admin)
            db.session.commit()

            try:
                from backend.models import AdminSettings
                db.session.add(AdminSettings(admin_id=admin.id))
                db.session.commit()
            except Exception:
                pass

            print(f"✅ Default admin created: {admin_email} / {admin_password}")
        except Exception as e:
            print(f"⚠️ Failed to seed default admin: {e}")


def _normalize_sqlite_uri(app: Flask) -> None:
    """
    If SQLALCHEMY_DATABASE_URI points at a *relative* SQLite file, rewrite it to an
    absolute path under app.instance_path and log the final location.
    """
    uri = app.config.get("SQLALCHEMY_DATABASE_URI", "")
    if uri.startswith("sqlite:///"):
        rel = uri[len("sqlite:///"):]
        if not os.path.isabs(rel):
            os.makedirs(app.instance_path, exist_ok=True)
            abs_path = os.path.join(app.instance_path, rel)
            app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{abs_path}"
            print(f"ℹ️  Normalized SQLite path -> {app.config['SQLALCHEMY_DATABASE_URI']}")
        else:
            print(f"ℹ️  SQLite path -> {rel}")


# ---------- NEW: pick a default workbook automatically ----------
def _pick_latest_workbook(root: Path, patterns: Iterable[str] = (r"*.xlsx", r"*.xls", r"*.xlsm")) -> Optional[Path]:
    """
    Find the most recently modified workbook under root matching supported patterns.
    Returns a Path or None if nothing is found.
    """
    candidates = []
    for pat in patterns:
        candidates += list(root.glob(pat))
    if not candidates:
        return None
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


# Optional: metrics one-shot on boot (env-gated, requires MS_GRAPH_BEARER)
try:
    from routes.metrics_sync import _resolve_workbook_for_user, _sync_one_month  # type: ignore
except Exception:  # pragma: no cover
    _resolve_workbook_for_user = None  # type: ignore
    _sync_one_month = None  # type: ignore


def _startup_sync(app: Flask) -> None:
    if not _to_bool("STARTUP_SYNC", "true"):
        return
    if _resolve_workbook_for_user is None or _sync_one_month is None:
        app.logger.warning("Startup sync skipped: metrics_sync helpers unavailable.")
        return
    bearer = os.getenv("MS_GRAPH_BEARER")
    if not bearer:
        app.logger.warning("Startup sync skipped: MS_GRAPH_BEARER not set.")
        return

    from datetime import datetime as _dt
    owner_id = int(os.getenv("OWNER_USER_ID", "1"))
    try:
        with app.app_context():
            wb = _resolve_workbook_for_user(owner_id, sheet=None)
            today = _dt.utcnow().date()
            res = _sync_one_month(wb, bearer, today.year, today.month)
            app.logger.info("Startup sync stored metrics for %s (as_of %s)", wb.sheet, res.get("as_of"))
    except Exception as e:
        app.logger.exception("Startup sync failed: %s", e)


# ---------- app factory ----------
def create_app() -> Flask:
    dist_dir = _resolve_frontend_dist()

    app = Flask(
        __name__,
        static_folder=str(dist_dir) if dist_dir else None,
        static_url_path="/_static",
    )
    app.config.from_object(Config)

    # Normalize SQLite path BEFORE init db
    _normalize_sqlite_uri(app)

    # Paths for uploads & default workbook
    backend_dir = Path(__file__).resolve().parent
    uploads_dir = backend_dir / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    app.config["UPLOAD_ROOT"] = str(uploads_dir)

    # 1) Honor explicit env DEFAULT_WORKBOOK_FILE if it exists
    env_workbook = os.getenv("DEFAULT_WORKBOOK_FILE", "").strip()
    if env_workbook and Path(env_workbook).expanduser().is_file():
        app.config["DEFAULT_WORKBOOK_FILE"] = str(Path(env_workbook).expanduser().resolve())
        print(f"📒 Using workbook from env DEFAULT_WORKBOOK_FILE -> {app.config['DEFAULT_WORKBOOK_FILE']}")
    else:
        # 2) Otherwise try to select the latest uploaded workbook automatically
        latest = _pick_latest_workbook(uploads_dir)
        if latest and latest.is_file():
            app.config["DEFAULT_WORKBOOK_FILE"] = str(latest.resolve())
            print(f"📒 Using latest uploaded workbook -> {app.config['DEFAULT_WORKBOOK_FILE']}")
        else:
            # 3) Final fallback to your original default
            fallback = uploads_dir / "ElpisWorkbook.xlsm"
            app.config["DEFAULT_WORKBOOK_FILE"] = str(fallback)
            print(f"📒 No uploaded workbook found; falling back to -> {fallback}")

    # Default sheet (unchanged)
    app.config.setdefault("DEFAULT_WORKBOOK_SHEET", "Q4 Report")

    # Mail & other extensions
    _apply_mail_config(app)
    mail.init_app(app)

    # Initialize db/migrate/jwt once
    init_extensions(app)

    try:
        run_auto_migrations(app)
    except Exception:
        pass

    # Optional: trigger market sync shortly after boot (env-gated)
    try:
        from backend.services.market_sync_runner import trigger_sync_async
        if os.getenv("RUN_STARTUP_MARKET_SYNC", "1") == "1":
            trigger_sync_async(delay_seconds=2, app=app)
    except Exception:
        pass

    # ✅ Import models BEFORE DB bootstrap so metadata is loaded
    try:
        import backend.models  # noqa: F401
    except Exception as e:
        print(f"⚠️ Could not import models before bootstrap: {e}")

    # ---- Schema bootstrap sequence ----
    _auto_db_bootstrap(app)
    _create_missing_tables(app)
    _ensure_user_columns(app)
    _ensure_investor_columns(app)
    _ensure_sp_connection_columns(app)
    _seed_default_admin(app)

    login_manager.init_app(app)

    @login_manager.user_loader
    def load_user(user_id: str):
        try:
            return User.query.get(int(user_id))
        except Exception:
            return None

    app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-me")

    # Cookies tuned for SPA + API on different origins (adjust to your setup)
    # --- Cookie/session/CORS for local dev (HTTP) ---
    app.config.update(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-secret"),           # required for sessions
        SESSION_COOKIE_NAME="session",
        SESSION_COOKIE_SAMESITE="Lax",        # Lax is perfect for same-origin dev
        SESSION_COOKIE_SECURE=False,          # True only behind https
    )

    try:
        Session(app)
    except Exception:
        pass

    # ---- CSRF TOKEN EMISSION (no flask_wtf import) -------------------------
    def _ensure_csrf_token() -> str:
        """Create/return a per-session CSRF token and store it in the *same* key the guard uses."""
        token = session.get("csrf_token")
        if not token:
            import secrets
            token = secrets.token_urlsafe(32)
            session["csrf_token"] = token
        return token

    @app.after_request
    def _set_csrf_cookie(resp: Response):
        """
        Always expose the CSRF token as a readable cookie so the SPA can mirror it
        into 'X-XSRF-TOKEN'. IMPORTANT: do not rotate it per-response.
        """
        try:
            token = _ensure_csrf_token()
            resp.set_cookie(
                "XSRF-TOKEN",
                token,
                samesite=app.config.get("SESSION_COOKIE_SAMESITE", "Lax"),
                secure=app.config.get("SESSION_COOKIE_SECURE", False),
                httponly=False,  # must be readable by JS
                path="/",
            )
        except Exception:
            pass
        return resp
    # -----------------------------------------------------------------------

    # -----------------------------------------------------------------------

    # CORS
    CORS(app, supports_credentials=True)


    # Health check
    @app.get("/health")
    def health():
        return jsonify(
            status="ok",
            db_uri=app.config.get("SQLALCHEMY_DATABASE_URI"),
            workbook=app.config.get("DEFAULT_WORKBOOK_FILE"),
            sheet=app.config.get("DEFAULT_WORKBOOK_SHEET"),
        )

    # Register API blueprints (stable prefixes)
    app.register_blueprint(metrics_bp)  # defines its own prefix
    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(admin_bp, url_prefix="/admin")
    app.register_blueprint(investor_bp, url_prefix="/investor")
    app.register_blueprint(excel_bp, url_prefix="/excel")
    app.register_blueprint(admin_qb_bp, url_prefix="/api/admin")
    app.register_blueprint(manual_entry_bp, url_prefix="/manual")
    app.register_blueprint(invitations_bp, url_prefix="/api")
    app.register_blueprint(invite_accept_bp)
    app.register_blueprint(sharepoint_excel_bp)
    app.register_blueprint(auth_ms_bp, url_prefix="/auth/ms")
    app.register_blueprint(chat_bp, url_prefix="/api")
    app.register_blueprint(profile_bp)
    app.register_blueprint(files_bp, url_prefix="/api/files")
    app.register_blueprint(contacts_bp)
    app.register_blueprint(market_bp)
    app.register_blueprint(documents_bp)
    app.register_blueprint(qbo_bp)
    app.register_blueprint(metrics_sync_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(portfolio_bp)
    app.register_blueprint(investor_sync_bp)
    app.register_blueprint(statements_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(kb_bp)  # exposes /api/kb/upload

    try:
        with app.app_context():
            init_autosync(app)  # uses AUTOSYNC_SECONDS or defaults to 120
    except Exception as e:
        app.logger.warning("init_autosync failed: %s", e)

    # Optional: immediately store latest month on boot (env-gated)
    _startup_sync(app)

    # Background jobs (statements, etc.)
    start_scheduler(app, dev_mode=False)

    # Static assets for SPA
    if dist_dir:
        @app.route("/assets/<path:fname>")
        def assets(fname):
            return send_from_directory(dist_dir / "assets", fname)

        @app.route("/favicon.ico")
        def favicon():
            path = dist_dir / "favicon.ico"
            if path.is_file():
                return send_from_directory(dist_dir, "favicon.ico")
            abort(404)

    # SPA fallback
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def spa(path: str):
        if not dist_dir:
            msg = (
                "Frontend build not found.\n"
                "Run `npm run build` in the frontend, or set FRONTEND_DIST=/abs/path/to/dist\n"
            )
            return Response(msg, status=404, mimetype="text/plain")

        candidate = dist_dir / path
        if path and candidate.is_file():
            return send_from_directory(dist_dir, path)

        index_file = dist_dir / "index.html"
        if index_file.is_file():
            return send_from_directory(dist_dir, "index.html")
        return abort(404)

    # Startup info
    print("\n=== Startup ===")
    print(f"Serving frontend from: {dist_dir if dist_dir else '(none — API only)'}")
    print(f"SQLALCHEMY_DATABASE_URI: {app.config.get('SQLALCHEMY_DATABASE_URI')}")
    print(f"Workbook: {app.config.get('DEFAULT_WORKBOOK_FILE')}")
    print(f"Sheet   : {app.config.get('DEFAULT_WORKBOOK_SHEET')}")
    for rule in app.url_map.iter_rules():
        print(f"{sorted(rule.methods)} -> {rule.rule}")
    print("===============\n")

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="localhost", port=5001, debug=True)
