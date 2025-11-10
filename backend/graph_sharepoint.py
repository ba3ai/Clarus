# backend/graph_sharepoint.py
from __future__ import annotations

import base64
import json
from typing import List, Tuple, Optional, Dict

import requests
import pandas as pd
from flask import current_app

from backend.config import Config


def _cfg(key: str, default=None):
    if current_app and getattr(current_app, "config", None):
        if key in current_app.config and current_app.config[key] is not None:
            return current_app.config[key]
    return getattr(Config, key, default)


GRAPH_BASE = "https://graph.microsoft.com/v1.0"


def _auth_headers(bearer: Optional[str]) -> Dict[str, str]:
    if not bearer:
        raise PermissionError("Missing Microsoft Graph access token.")
    return {"Authorization": f"Bearer {bearer}"}


def _encode_share_url(url: str) -> str:
    # 'u!' + base64url-encoded original URL
    b = base64.urlsafe_b64encode(url.encode("utf-8")).decode("utf-8").rstrip("=")
    return f"u!{b}"


# --------- OPEN & METADATA ---------
def open_excel_by_share_url(share_url: str, bearer: str) -> Tuple[str, str]:
    """Resolve a SharePoint sharing URL to (drive_id, item_id)."""
    sid = _encode_share_url(share_url)
    r = requests.get(
        f"{GRAPH_BASE}/shares/{sid}/driveItem",
        headers=_auth_headers(bearer),
        timeout=30,
    )
    if r.status_code == 404:
        raise FileNotFoundError("File not found or no access.")
    r.raise_for_status()
    di = r.json()
    return di["parentReference"]["driveId"], di["id"]


def open_excel_by_components(hostname: str, site_path: str, drive_name: str, file_path: str, bearer: str) -> Tuple[str, str]:
    """Resolve site/drive/path to (drive_id, item_id)."""
    # Site
    site_r = requests.get(f"{GRAPH_BASE}/sites/{hostname}:{('/' + site_path.strip('/')) if site_path else ''}",
                          headers=_auth_headers(bearer), timeout=30)
    site_r.raise_for_status()
    site = site_r.json()

    # Drive
    drv_r = requests.get(f"{GRAPH_BASE}/sites/{site['id']}/drives", headers=_auth_headers(bearer), timeout=30)
    drv_r.raise_for_status()
    drives = drv_r.json().get("value", [])
    drive = next((d for d in drives if d["name"].lower() == drive_name.lower()), None)
    if not drive:
        raise FileNotFoundError(f"Drive '{drive_name}' not found")
    drive_id = drive["id"]

    # Item by path
    path = file_path.strip("/")
    item_r = requests.get(
        f"{GRAPH_BASE}/drives/{drive_id}/root:/{path}",
        headers=_auth_headers(bearer),
        timeout=30,
    )
    item_r.raise_for_status()
    item = item_r.json()
    return drive_id, item["id"]


def list_worksheets(drive_id: str, item_id: str, bearer: str, _tenant: Optional[str]) -> List[dict]:
    r = requests.get(
        f"{GRAPH_BASE}/drives/{drive_id}/items/{item_id}/workbook/worksheets",
        headers=_auth_headers(bearer),
        timeout=30,
    )
    r.raise_for_status()
    return r.json().get("value", [])


def list_tables(drive_id: str, item_id: str, bearer: str, _tenant: Optional[str]) -> List[dict]:
    r = requests.get(
        f"{GRAPH_BASE}/drives/{drive_id}/items/{item_id}/workbook/tables",
        headers=_auth_headers(bearer),
        timeout=30,
    )
    r.raise_for_status()
    return r.json().get("value", [])


# --------- READ DATA ---------
def read_range(drive_id: str, item_id: str, worksheet: str, address: str, bearer: str) -> dict:
    # https://graph.microsoft.com/v1.0/drives/{drive-id}/items/{item-id}/workbook/worksheets('Sheet')/range(address='A1:B10')
    ws = requests.utils.quote(worksheet)
    addr = requests.utils.quote(address)
    r = requests.get(
        f"{GRAPH_BASE}/drives/{drive_id}/items/{item_id}/workbook/worksheets('{ws}')/range(address='{addr}')",
        headers=_auth_headers(bearer),
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def read_table_rows(drive_id: str, item_id: str, table_name: str, bearer: str) -> dict:
    tname = requests.utils.quote(table_name)
    r = requests.get(
        f"{GRAPH_BASE}/drives/{drive_id}/items/{item_id}/workbook/tables/{tname}/rows",
        headers=_auth_headers(bearer),
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def pandas_from_range_payload(payload: dict, first_row_headers: bool = True) -> pd.DataFrame:
    """
    payload is the response from /range(...).
    We make a DataFrame either using first row as headers or synthetic headers.
    """
    values = payload.get("values") or []
    if not values:
        return pd.DataFrame()

    if first_row_headers and len(values) >= 1:
        cols = [str(c) if c is not None else "" for c in values[0]]
        rows = values[1:]
        return pd.DataFrame(rows, columns=cols)

    # Synthetic headers
    width = max(len(row) for row in values)
    cols = [f"col_{i+1}" for i in range(width)]
    return pd.DataFrame(values, columns=cols)
