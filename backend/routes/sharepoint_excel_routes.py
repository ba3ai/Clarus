# backend/routes/sharepoint_excel_routes.py
from __future__ import annotations

import re
import time
import secrets
from typing import Optional

import pandas as pd
from flask import Blueprint, current_app, jsonify, request, session
from werkzeug.security import generate_password_hash

from backend.config import Config
from backend.routes.auth_ms_routes import get_session_bearer
from backend.graph_sharepoint import (
    open_excel_by_components,
    list_worksheets,
    list_tables,
    read_range,
    read_table_rows,
    pandas_from_range_payload,
    open_excel_by_share_url,
)

from backend.extensions import db
from backend.models import SharePointConnection, User

# MSAL for app-only (client credentials) tokens
try:
    from msal import ConfidentialClientApplication  # type: ignore
except Exception:  # pragma: no cover
    ConfidentialClientApplication = None  # helpful error later

bp = Blueprint("sharepoint_excel", __name__, url_prefix="/api/sharepoint/excel")

_HOST_RE = re.compile(r"^[a-zA-Z0-9.-]+\.sharepoint\.com$", re.IGNORECASE)

# ---------------------------------------------------------
# Config helpers
# ---------------------------------------------------------
def _cfg(key: str, default=None):
    if current_app and getattr(current_app, "config", None):
        if key in current_app.config and current_app.config[key] is not None:
            return current_app.config[key]
    return getattr(Config, key, default)

# ---------------------------------------------------------
# APP-ONLY TOKEN CACHE (client credentials)
# ---------------------------------------------------------
_app_token_cache = {
    # cache per authority so we can support multiple tenants
    "authority": None,           # str
    "access_token": None,        # str
    "exp": 0.0,                  # epoch seconds
}
_msal_app: Optional["ConfidentialClientApplication"] = None

def _resolve_app_authority() -> str:
    """
    Resolve the authority for app-only:
    - Prefer per-request tenant override via X-Tenant-Id
    - Else AZURE_TENANT_ID from config
    - For client-credentials: replace invalid 'common/consumers' with 'organizations'
    """
    req_tenant = (request.headers.get("X-Tenant-Id") or "").strip()
    env_tenant = str(_cfg("AZURE_TENANT_ID") or "").strip()
    tenant = (req_tenant or env_tenant or "").strip()

    if tenant.lower() in ("", "common", "consumers"):
        # client-credentials does not support 'common'/'consumers'
        tenant = "organizations"
    return f"https://login.microsoftonline.com/{tenant}"

def _get_app_bearer() -> str:
    """
    Acquire (and cache) an application token for Microsoft Graph.
    Automatically refreshes when near expiry. Supports multi-tenant via
    X-Tenant-Id header (GUID or verified domain) or AZURE_TENANT_ID.
    """
    global _msal_app, _app_token_cache

    if ConfidentialClientApplication is None:
        raise RuntimeError("msal is not installed. `pip install msal` to use application auth.")

    client_id = str(_cfg("AZURE_CLIENT_ID") or "").strip()
    client_secret = str(_cfg("AZURE_CLIENT_SECRET") or "").strip()
    if not (client_id and client_secret):
        raise RuntimeError("Missing AZURE_CLIENT_ID / AZURE_CLIENT_SECRET for application auth.")

    authority = _resolve_app_authority()

    # Re-init MSAL app if authority changed
    if _msal_app is None or _app_token_cache["authority"] != authority:
        _msal_app = ConfidentialClientApplication(
            client_id=client_id,
            authority=authority,
            client_credential=client_secret,
        )
        _app_token_cache.update({"authority": authority, "access_token": None, "exp": 0.0})

    # Reuse until ~2 minutes before expiry
    now = time.time()
    if _app_token_cache["access_token"] and now < (_app_token_cache["exp"] - 120):
        return _app_token_cache["access_token"]  # type: ignore

    result = _msal_app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
    if "access_token" not in result:
        # Surface the server-side reason (e.g., Conditional Access block)
        raise PermissionError(f"Failed to get Graph app token: {result.get('error_description') or result}")

    _app_token_cache["access_token"] = result["access_token"]
    _app_token_cache["exp"] = now + int(result.get("expires_in", 3600))
    return result["access_token"]

# ---------------------------------------------------------
# Request helpers
# ---------------------------------------------------------
def _bearer_from_request() -> Optional[str]:
    """
    Returns a valid bearer token. Priority:
      1) Authorization: Bearer <token> header
      2) If GRAPH_AUTH_MODE=delegated -> use user session token
      3) Else -> use app-only token (client credentials)
    """
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth.split(" ", 1)[1]

    mode = str(_cfg("GRAPH_AUTH_MODE", "delegated")).lower()
    if mode == "delegated":
        return get_session_bearer()  # existing delegated path (refresh there)
    else:
        # Service path: from client perspective this never "expires"
        # (we auto-refresh on the server)
        return _get_app_bearer()

def _tenant_from_request() -> Optional[str]:
    return request.headers.get("X-Tenant-Id")

def _validate_host(hostname: str) -> bool:
    return bool(_HOST_RE.match(hostname))

def _current_user_id() -> Optional[int]:
    """
    Return the app user id. If the user isn't logged into the app but *is*
    connected to Microsoft, automatically create/link a local user from their
    Microsoft profile and set session['user_id'].
    """
    uid = session.get("user_id")
    if uid:
        try:
            return int(uid)
        except Exception:
            return None

    # Fallback: derive from Microsoft account (delegated only)
    acct = session.get("ms_account") or {}
    email = acct.get("userPrincipalName") or acct.get("mail")
    if not email:
        return None

    user = User.query.filter_by(email=email).first()
    if not user:
        user = User(
            email=email,
            password=generate_password_hash(secrets.token_urlsafe(16)),  # random hash
            user_type="viewer",
            permission="Viewer",
            status="active",
            first_name=acct.get("givenName"),
            last_name=acct.get("surname"),
        )
        db.session.add(user)
        db.session.commit()

    session["user_id"] = user.id
    return user.id

# ---------------------------------------------------------
# URL-based metadata / preview
# ---------------------------------------------------------
@bp.route("/metadata_by_url", methods=["POST"])
def metadata_by_url():
    data = request.get_json(silent=True) or {}
    share_url = (data.get("url") or "").strip()
    if not share_url:
        return jsonify(error="Missing 'url'."), 400

    bearer = _bearer_from_request()
    if str(_cfg("GRAPH_AUTH_MODE", "delegated")).lower() == "delegated" and not bearer:
        return jsonify(error="Unauthorized: Please sign in with Microsoft."), 401

    try:
        drive_id, item_id = open_excel_by_share_url(share_url, bearer)
        sheets = list_worksheets(drive_id, item_id, bearer, _tenant_from_request())
        tables = list_tables(drive_id, item_id, bearer, _tenant_from_request())
        return jsonify(ok=True, drive_id=drive_id, item_id=item_id, worksheets=sheets, tables=tables)
    except PermissionError as e:
        return jsonify(error=str(e)), 401
    except Exception as e:
        current_app.logger.exception("metadata_by_url failed")
        return jsonify(error=str(e)), 500

@bp.route("/preview_by_url", methods=["POST"])
def preview_by_url():
    data = request.get_json(silent=True) or {}
    share_url = (data.get("url") or "").strip()
    if not share_url:
        return jsonify(error="Missing 'url'."), 400

    mode = (data.get("mode") or "range").strip().lower()
    worksheet = (data.get("worksheet") or "").strip()
    address = (data.get("address") or "").strip()
    table = (data.get("table") or "").strip()
    first_row_headers = bool(data.get("first_row_headers", True))

    bearer = _bearer_from_request()
    if str(_cfg("GRAPH_AUTH_MODE", "delegated")).lower() == "delegated" and not bearer:
        return jsonify(error="Unauthorized: Please sign in with Microsoft."), 401

    try:
        drive_id, item_id = open_excel_by_share_url(share_url, bearer)
        if mode == "table":
            rows_payload = read_table_rows(drive_id, item_id, table, bearer)
            # payload: { value: [ {index:.., values:[[]]} ] }
            values = []
            for r in rows_payload.get("value", []):
                values.extend(r.get("values", []))
            df = pd.DataFrame(values)
            if first_row_headers and not df.empty:
                cols = [str(c) for c in list(df.iloc[0])]
                df = df.iloc[1:].reset_index(drop=True)
                df.columns = cols
        else:
            rng_payload = read_range(drive_id, item_id, worksheet, address, bearer)
            df = pandas_from_range_payload(rng_payload, first_row_headers=first_row_headers)

        max_rows = int(_cfg("EXCEL_PREVIEW_ROW_LIMIT", 500))
        truncated = False
        if len(df) > max_rows:
            df = df.head(max_rows)
            truncated = True

        columns = [str(c) for c in df.columns]
        rows = [dict(zip(columns, map(lambda x: x if x is not None else "", row))) for row in df.fillna("").to_numpy()]
        return jsonify(ok=True, columns=columns, rows=rows, truncated=truncated)
    except PermissionError as e:
        return jsonify(error=str(e)), 401
    except Exception as e:
        current_app.logger.exception("preview_by_url failed")
        return jsonify(error=str(e)), 500

# ---------------------------------------------------------
# Component-based metadata / preview
# ---------------------------------------------------------
@bp.route("/metadata", methods=["POST"])
def metadata():
    data = request.get_json(silent=True) or {}

    hostname = (data.get("hostname") or "").strip()
    site_path = (data.get("site_path") or "").strip("/")
    drive_name = (data.get("drive_name") or "Documents").strip()
    file_path = (data.get("file_path") or "").strip("/")

    if not hostname or not drive_name or not file_path:
        return jsonify(error="Missing hostname, drive_name, or file_path"), 400
    if not _validate_host(hostname):
        return jsonify(error="Invalid SharePoint hostname"), 400

    bearer = _bearer_from_request()
    if str(_cfg("GRAPH_AUTH_MODE", "delegated")).lower() == "delegated" and not bearer:
        return jsonify(error="Unauthorized: Please sign in with Microsoft."), 401

    try:
        drive_id, item_id = open_excel_by_components(hostname, site_path, drive_name, file_path, bearer)
        sheets = list_worksheets(drive_id, item_id, bearer, _tenant_from_request())
        tables = list_tables(drive_id, item_id, bearer, _tenant_from_request())
        return jsonify(ok=True, drive_id=drive_id, item_id=item_id, worksheets=sheets, tables=tables)
    except PermissionError as e:
        return jsonify(error=str(e)), 401
    except Exception as e:
        current_app.logger.exception("metadata failed")
        return jsonify(error=str(e)), 500

@bp.route("/preview", methods=["POST"])
def preview():
    data = request.get_json(silent=True) or {}

    hostname = (data.get("hostname") or "").strip()
    site_path = (data.get("site_path") or "").strip("/")
    drive_name = (data.get("drive_name") or "Documents").strip()
    file_path = (data.get("file_path") or "").strip("/")

    mode = (data.get("mode") or "range").strip().lower()
    worksheet = (data.get("worksheet") or "").strip()
    address = (data.get("address") or "").strip()
    table = (data.get("table") or "").strip()
    first_row_headers = bool(data.get("first_row_headers", True))

    if not hostname or not drive_name or not file_path:
        return jsonify(error="Missing hostname, drive_name, or file_path"), 400
    if not _validate_host(hostname):
        return jsonify(error="Invalid SharePoint hostname"), 400

    bearer = _bearer_from_request()
    if str(_cfg("GRAPH_AUTH_MODE", "delegated")).lower() == "delegated" and not bearer:
        return jsonify(error="Unauthorized: Please sign in with Microsoft."), 401

    try:
        drive_id, item_id = open_excel_by_components(hostname, site_path, drive_name, file_path, bearer)
        if mode == "table":
            rows_payload = read_table_rows(drive_id, item_id, table, bearer)
            values = []
            for r in rows_payload.get("value", []):
                values.extend(r.get("values", []))
            df = pd.DataFrame(values)
            if first_row_headers and not df.empty:
                cols = [str(c) for c in list(df.iloc[0])]
                df = df.iloc[1:].reset_index(drop=True)
                df.columns = cols
        else:
            rng_payload = read_range(drive_id, item_id, worksheet, address, bearer)
            df = pandas_from_range_payload(rng_payload, first_row_headers=first_row_headers)

        max_rows = int(_cfg("EXCEL_PREVIEW_ROW_LIMIT", 500))
        truncated = False
        if len(df) > max_rows:
            df = df.head(max_rows)
            truncated = True

        columns = [str(c) for c in df.columns]
        rows = [dict(zip(columns, map(lambda x: x if x is not None else "", row))) for row in df.fillna("").to_numpy()]
        return jsonify(ok=True, columns=columns, rows=rows, truncated=truncated)
    except PermissionError as e:
        return jsonify(error=str(e)), 401
    except Exception as e:
        current_app.logger.exception("preview failed")
        return jsonify(error=str(e)), 500

# ---------------------------------------------------------
# Connections (DB-backed)
# ---------------------------------------------------------
@bp.route("/connect_by_url", methods=["POST"])
def connect_by_url():
    data = request.get_json(silent=True) or {}
    share_url = (data.get("url") or "").strip()
    if not share_url:
        return jsonify(error="Missing 'url'"), 400

    user_id = _current_user_id()
    if not user_id:
        return jsonify(error="Unauthorized: please log in to your app."), 401

    bearer = _bearer_from_request()
    if str(_cfg("GRAPH_AUTH_MODE", "delegated")).lower() == "delegated" and not bearer:
        return jsonify(error="Unauthorized: please sign in with Microsoft."), 401

    try:
        drive_id, item_id = open_excel_by_share_url(share_url, bearer)
        _ = list_worksheets(drive_id, item_id, bearer, None)  # validate access

        added_by = (session.get("ms_account") or {}).get("userPrincipalName") \
                   or (session.get("ms_account") or {}).get("mail") \
                   or (session.get("ms_account") or {}).get("displayName")

        existing = SharePointConnection.query.filter_by(user_id=user_id, item_id=item_id).first()
        if not existing:
            conn = SharePointConnection(
                user_id=user_id,
                url=share_url,
                drive_id=drive_id,
                item_id=item_id,
                added_by=added_by,
            )
            db.session.add(conn)
            db.session.commit()

        conns = SharePointConnection.query.filter_by(user_id=user_id).order_by(SharePointConnection.id.desc()).all()
        return jsonify(ok=True, connections=[c.to_dict() for c in conns])
    except PermissionError as e:
        return jsonify(error=str(e)), 401
    except Exception as e:
        current_app.logger.exception("connect_by_url failed")
        return jsonify(error=str(e)), 500

@bp.route("/connections", methods=["GET"])
def list_connections():
    user_id = _current_user_id()
    if not user_id:
        return jsonify(ok=True, connections=[])
    conns = SharePointConnection.query.filter_by(user_id=user_id).order_by(SharePointConnection.id.desc()).all()
    return jsonify(ok=True, connections=[c.to_dict() for c in conns])

@bp.route("/connections/<conn_id>", methods=["DELETE"])
def delete_connection(conn_id: str):
    user_id = _current_user_id()
    if not user_id:
        return jsonify(error="Unauthorized"), 401

    conn = SharePointConnection.query.filter_by(id=conn_id, user_id=user_id).first()
    if conn:
        db.session.delete(conn)
        db.session.commit()

    conns = SharePointConnection.query.filter_by(user_id=user_id).order_by(SharePointConnection.id.desc()).all()
    return jsonify(ok=True, connections=[c.to_dict() for c in conns])
