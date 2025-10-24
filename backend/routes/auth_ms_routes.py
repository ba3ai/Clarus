# backend/routes/auth_ms_routes.py
from __future__ import annotations

import base64
import hashlib
import os
import time
import secrets
from typing import Optional, Dict, Any
from urllib.parse import urlparse, parse_qs

import requests
from flask import Blueprint, current_app, jsonify, redirect, request, session

from backend.config import Config
from backend.extensions import db
from backend.models import SharePointConnection
from backend.graph_sharepoint import open_excel_by_share_url, list_worksheets

auth_ms_bp = Blueprint("auth_ms", __name__)


def _cfg(key: str, default=None):
    if current_app and getattr(current_app, "config", None):
        if key in current_app.config and current_app.config[key] is not None:
            return current_app.config[key]
    return getattr(Config, key, default)


def _oidc_base() -> str:
    tenant = _cfg("AZURE_TENANT_ID", "common")
    return f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0"


def _now() -> int:
    return int(time.time())


def _mk_pkce() -> dict:
    ver = base64.urlsafe_b64encode(os.urandom(40)).decode("utf-8").rstrip("=")
    sha = hashlib.sha256(ver.encode("utf-8")).digest()
    chal = base64.urlsafe_b64encode(sha).decode("utf-8").rstrip("=")
    return {"verifier": ver, "challenge": chal, "method": "S256"}


def _save_tokens(payload: Dict[str, Any]):
    expires_in = int(payload.get("expires_in", 3599))
    session["ms_tokens"] = {
        "access_token": payload.get("access_token"),
        "refresh_token": payload.get("refresh_token"),
        "expires_at": _now() + max(60, expires_in - 30),
        "id_token": payload.get("id_token"),
        "scope": payload.get("scope"),
        "token_type": payload.get("token_type", "Bearer"),
    }


def _exchange_code_for_tokens(code: str, code_verifier: Optional[str]):
    token_url = f"{_oidc_base()}/token"
    data = {
        "client_id": _cfg("AZURE_CLIENT_ID", ""),
        "client_secret": _cfg("AZURE_CLIENT_SECRET", ""),
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": _cfg("AZURE_REDIRECT_URI", ""),
        "scope": _cfg("GRAPH_SCOPES", ""),
    }
    if code_verifier:
        data["code_verifier"] = code_verifier
    r = requests.post(token_url, data=data, timeout=30)
    r.raise_for_status()
    _save_tokens(r.json())


def _refresh_tokens() -> bool:
    tok = session.get("ms_tokens") or {}
    refresh = tok.get("refresh_token")
    if not refresh:
        return False
    token_url = f"{_oidc_base()}/token"
    data = {
        "client_id": _cfg("AZURE_CLIENT_ID", ""),
        "client_secret": _cfg("AZURE_CLIENT_SECRET", ""),
        "grant_type": "refresh_token",
        "refresh_token": refresh,
        "redirect_uri": _cfg("AZURE_REDIRECT_URI", ""),
        "scope": _cfg("GRAPH_SCOPES", ""),
    }
    r = requests.post(token_url, data=data, timeout=30)
    if r.status_code != 200:
        return False
    _save_tokens(r.json())
    return True


def get_session_bearer(refresh_if_needed: bool = True) -> Optional[str]:
    tok = session.get("ms_tokens")
    if not tok:
        return None
    if refresh_if_needed and _now() >= int(tok.get("expires_at", 0)) - 10:
        if not _refresh_tokens():
            return None
        tok = session.get("ms_tokens")
    return tok.get("access_token")


def _extract_sp_url_from_redirect(redirect_url: str) -> Optional[str]:
    try:
        parsed = urlparse(redirect_url)
        q = parse_qs(parsed.query or "")
        return (q.get("sp_connect_url") or [None])[0]
    except Exception:
        return None


def _current_user_id() -> Optional[int]:
    uid = session.get("user_id")
    return int(uid) if uid else None


def _save_connection_to_db(share_url: str, bearer: str) -> None:
    """Resolve and persist a connection for the current user."""
    user_id = _current_user_id()
    if not user_id:
        return  # user not logged into your app; skip DB save

    drive_id, item_id = open_excel_by_share_url(share_url, bearer)
    _ = list_worksheets(drive_id, item_id, bearer, None)

    acct = session.get("ms_account") or {}
    display = acct.get("userPrincipalName") or acct.get("mail") or acct.get("displayName") or ""

    existing = SharePointConnection.query.filter_by(user_id=user_id, item_id=item_id).first()
    if not existing:
        conn = SharePointConnection(
            user_id=user_id,
            url=share_url,
            drive_id=drive_id,
            item_id=item_id,
            added_by=display,
        )
        db.session.add(conn)
        db.session.commit()


@auth_ms_bp.get("/login")
def login():
    state = secrets.token_urlsafe(24)
    session["oauth_state"] = state

    post_login_redirect = request.args.get("redirect") or "/"
    session["post_login_redirect"] = post_login_redirect

    # capture a pending SharePoint connect URL either directly or embedded in the redirect
    pending_sp = request.args.get("sp_connect_url") or _extract_sp_url_from_redirect(post_login_redirect)
    if pending_sp:
        session["pending_sp_connect_url"] = pending_sp

    pkce = _mk_pkce()
    session["pkce_verifier"] = pkce["verifier"]

    params = {
        "client_id": _cfg("AZURE_CLIENT_ID", ""),
        "response_type": "code",
        "redirect_uri": _cfg("AZURE_REDIRECT_URI", ""),
        "response_mode": "query",
        "scope": _cfg("GRAPH_SCOPES", ""),
        "state": state,
        "code_challenge": pkce["challenge"],
        "code_challenge_method": pkce["method"],
    }
    auth_url = f"{_oidc_base()}/authorize?" + "&".join(
        f"{k}={requests.utils.quote(v)}" for k, v in params.items()
    )
    return redirect(auth_url, code=302)


@auth_ms_bp.get("/callback")
def callback():
    if request.args.get("error"):
        return redirect(session.get("post_login_redirect", "/"))

    if request.args.get("state") != session.get("oauth_state"):
        return redirect(session.get("post_login_redirect", "/"))

    code = request.args.get("code", "")
    verifier = session.get("pkce_verifier")
    try:
        _exchange_code_for_tokens(code, verifier)
    except Exception:
        return redirect(session.get("post_login_redirect", "/"))

    # fetch minimal profile
    try:
        me = requests.get(
            f"{_cfg('GRAPH_BASE', 'https://graph.microsoft.com/v1.0')}/me",
            headers={"Authorization": f"Bearer {get_session_bearer()}"},
            timeout=15,
        )
        if me.status_code == 200:
            session["ms_account"] = me.json()
    except Exception:
        pass

    # finalize pending SharePoint connection server-side
    pending_sp = session.pop("pending_sp_connect_url", None)
    if pending_sp:
        try:
            bearer = get_session_bearer()
            if bearer:
                _save_connection_to_db(pending_sp, bearer)
        except Exception:
            pass

    return redirect(session.get("post_login_redirect", "/"))


@auth_ms_bp.get("/status")
def status():
    tok = session.get("ms_tokens")
    if not tok:
        return jsonify(connected=False)
    exp = int(tok.get("expires_at", 0))
    acct = session.get("ms_account") or {}
    return jsonify(
        connected=True,
        account=acct.get("userPrincipalName") or acct.get("mail") or acct.get("displayName"),
        expires_in=max(0, exp - _now()),
    )


@auth_ms_bp.post("/logout")
def logout():
    session.pop("ms_tokens", None)
    session.pop("ms_account", None)
    session.pop("oauth_state", None)
    session.pop("pkce_verifier", None)
    session.pop("pending_sp_connect_url", None)
    return jsonify(ok=True)
