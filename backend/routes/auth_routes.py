# backend/routes/auth_routes.py
from __future__ import annotations

import secrets
from datetime import timedelta
from typing import Optional, Dict, Any

from flask import (
    Blueprint, jsonify, request, session, current_app, make_response
)
from werkzeug.security import check_password_hash
from flask_login import login_user, logout_user, current_user  # <-- Flask-Login

from backend.models import User, Investor
from backend.extensions import db  # noqa: F401

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")

# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def _find_user_by_identifier(identifier: str) -> Optional[User]:
    """Try email first, then username."""
    ident = (identifier or "").strip().lower()
    if not ident:
        return None

    user = User.query.filter(User.email.ilike(ident)).first()
    if user:
        return user

    if "@" not in ident and hasattr(User, "username"):
        return User.query.filter(User.username.ilike(ident)).first()

    return None


def _issue_csrf_cookie(resp):
    """
    Double-submit CSRF cookie:
    - Server stores token in session["csrf_token"]
    - Client echoes cookie value in 'X-XSRF-TOKEN' on mutating requests
    """
    import secrets
    token = session.get("csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["csrf_token"] = token

    samesite = current_app.config.get("SESSION_COOKIE_SAMESITE", "Lax")
    secure = current_app.config.get("SESSION_COOKIE_SECURE", True)

    resp.set_cookie(
        "XSRF-TOKEN",
        token,
        max_age=int(timedelta(hours=12).total_seconds()),
        httponly=False,
        secure=secure,
        samesite=samesite,
        path="/",
    )



def _clear_csrf_cookie(resp):
    resp.set_cookie("XSRF-TOKEN", "", max_age=0, expires=0, path="/")


def _session_user_dict() -> Dict[str, Any]:
    """Return normalized user dict from current_user/session."""
    # Prefer Flask-Login
    if getattr(current_user, "is_authenticated", False):
        u = current_user
    else:
        uid = session.get("user_id")
        if not uid:
            return {}
        u = User.query.get(int(uid))
        if not u:
            session.clear()
            return {}

    def _n(s): return (s or "").strip()

    return {
        "id": int(u.id),
        "email": (u.email or "").lower(),
        "name": f"{_n(getattr(u, 'first_name', ''))} {_n(getattr(u, 'last_name', ''))}".strip() or None,
        "first_name": getattr(u, "first_name", None),
        "last_name": getattr(u, "last_name", None),
        "user_type": (getattr(u, "user_type", "") or "Investor"),
        "permission": getattr(u, "permission", "Viewer"),
    }


def _map_user_to_investor(user_dict: Dict[str, Any]) -> Optional[Investor]:
    """Map the logged-in user → Investor by account_user_id → email → full name."""
    if not user_dict:
        return None

    inv = Investor.query.filter_by(account_user_id=user_dict.get("id")).first()
    if inv:
        return inv

    email = user_dict.get("email")
    if email:
        inv = Investor.query.filter(Investor.email.ilike(email)).first()
        if inv:
            return inv

    full = " ".join(filter(None, [
        (user_dict.get("first_name") or "").strip(),
        (user_dict.get("last_name") or "").strip()
    ])).strip() or (user_dict.get("name") or "")
    if full:
        inv = Investor.query.filter(Investor.name.ilike(full)).first()
        if inv:
            return inv

    return None


def _require_csrf():
    """Validate CSRF header for mutating calls when session exists."""
    if request.method in ("GET", "HEAD", "OPTIONS", "TRACE"):
        return
    if not (session.get("user_id") or getattr(current_user, "is_authenticated", False)):
        return
    sent = request.headers.get("X-XSRF-TOKEN", "")
    if not sent or sent != session.get("csrf_token"):
        return jsonify({"ok": False, "error": "CSRF validation failed"}), 403


# ─────────────────────────────────────────────────────────────
# Global CSRF guard for /api and /auth
# ─────────────────────────────────────────────────────────────
@auth_bp.before_app_request
def _csrf_guard():
    if request.path.startswith(("/api", "/auth")):
        err = _require_csrf()
        if err:
            return err
    return None


# ─────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────

@auth_bp.post("/login")
def login():
    """
    Accepts JSON: { email|username, password }
    Authenticates with Flask-Login + server-side cookie session
    and issues CSRF double-submit cookie.
    """
    data = request.get_json(silent=True) or {}
    identifier = (data.get("email") or data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if not identifier or not password:
        return jsonify({"ok": False, "error": "Missing credentials"}), 400

    user = _find_user_by_identifier(identifier)
    if not user:
        return jsonify({"ok": False, "error": "Invalid email/username or password"}), 401

    hashed = getattr(user, "password_hash", None) or getattr(user, "password", None)
    if not hashed or not check_password_hash(hashed, password):
        return jsonify({"ok": False, "error": "Invalid email/username or password"}), 401

    login_user(user, remember=False)

    # DO NOT clear the session now—Flask-Login stored _user_id there.
    # Just add your convenience keys.
    session["user_id"]    = int(user.id)
    session["email"]      = (user.email or "").lower()
    session["user_type"]  = (getattr(user, "user_type", "") or "Investor").lower()
    session["permission"] = getattr(user, "permission", "Viewer")
    session.permanent = True
    current_app.permanent_session_lifetime = timedelta(hours=12)

    resp = make_response(jsonify({"ok": True}))
    _issue_csrf_cookie(resp)
    return resp, 200


@auth_bp.post("/logout")
def logout():
    """Log out Flask-Login and clear the session + CSRF cookie."""
    try:
        logout_user()
    except Exception:
        pass
    session.clear()
    resp = make_response(jsonify({"ok": True}))
    _clear_csrf_cookie(resp)
    return resp, 200


@auth_bp.get("/me")
def me():
    """
    Return the logged-in user + mapped investor for the dashboard.
    Shape: { ok, user: {...}, investor: {id, name} | null }
    """
    user_dict = _session_user_dict()
    if not user_dict:
        return jsonify({"ok": False, "error": "Unauthorized"}), 401

    inv = _map_user_to_investor(user_dict)
    return jsonify({
        "ok": True,
        "user": user_dict,
        "investor": {"id": getattr(inv, "id", None), "name": getattr(inv, "name", None)} if inv else None
    }), 200


# Optional debugging helper
@auth_bp.get("/whoami")
def whoami():
    return me()
