from datetime import timedelta
import os,pathlib
from dotenv import load_dotenv

load_dotenv()

class Config:
    # ── DB / JWT (keep your existing ones) ─────────────────────────────────────
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URI", "postgresql+psycopg://postgres:password@localhost:5432/financial_db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    pathlib.Path("/home/site/data").mkdir(parents=True, exist_ok=True)
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "super-secret-key")
    JWT_TOKEN_LOCATION = ["headers"]
    JWT_HEADER_TYPE = "Bearer"
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=4)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=7)

    # ── Core app settings ──────────────────────────────────────────────────────
    APP_ENV = os.getenv("APP_ENV", "development")
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret")

    # ── Microsoft Entra / Graph (multi-tenant delegated) ──────────────────────
    AZURE_TENANT_ID     = os.getenv("AZURE_TENANT_ID", "common")
    AZURE_CLIENT_ID     = os.getenv("AZURE_CLIENT_ID", "")
    AZURE_CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET", "")

    # 🔑 Authorization Code redirect (must match App Registration)
    AZURE_REDIRECT_URI  = os.getenv("AZURE_REDIRECT_URI", "http://localhost:5001/auth/ms/callback")

    # Delegated scopes (explicit for user consent)
    GRAPH_SCOPES        = os.getenv(
        "GRAPH_SCOPES",
        "openid profile offline_access Files.Read.All Sites.Read.All"
    )
    GRAPH_BASE          = "https://graph.microsoft.com/v1.0"
    GRAPH_AUTH_MODE     = os.getenv("GRAPH_AUTH_MODE", "delegated")  # 'delegated' | 'app'

    # ── Optional defaults (classic mode) ───────────────────────────────────────
    SHAREPOINT_HOSTNAME  = os.getenv("SHAREPOINT_HOSTNAME", "")
    SHAREPOINT_SITE_PATH = os.getenv("SHAREPOINT_SITE_PATH", "")

    EXCEL_PREVIEW_ROW_LIMIT = int(os.getenv("EXCEL_PREVIEW_ROW_LIMIT", "500"))

    # ── Server-side sessions (tokens live on server, not in cookies) ──────────
    SESSION_TYPE = os.getenv("SESSION_TYPE", "filesystem")
    SESSION_PERMANENT = False
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)
    SESSION_COOKIE_SAMESITE = os.getenv("SESSION_COOKIE_SAMESITE", "Lax")  # use "None" for true cross-site
    SESSION_COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", "False").lower() == "true"

    # ── CORS (set your frontend origins here) ──────────────────────────────────
    CORS_ALLOWED_ORIGINS = [
        o.strip() for o in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")
        if o.strip()
    ]
    CORS_SUPPORTS_CREDENTIALS = True
    
    #file upload
    UPLOAD_ROOT = os.environ.get("UPLOAD_ROOT") or os.path.join(os.path.dirname(__file__), "uploads")