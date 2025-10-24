# backend/services/file_resolver.py
import io
from typing import Tuple, Dict, Any, Optional

"""
Normalizes file access across:
  - Local uploads (path or DB pointer)
  - Microsoft Graph: SharePoint / OneDrive (drive_id + item_id OR share link)
  - Google Sheets (spreadsheet_id + range)
  - Google Drive file (download URL / fileId)

Returns: (bytes, meta)
"""

# ── Local Uploads ─────────────────────────────────────────────────────────────

def _fetch_local_upload(user_id: int, ref: Dict[str, Any]):
    path = (ref or {}).get("path")
    if not path:
        return None, {}
    try:
        with open(path, "rb") as f:
            return f.read(), {"provider": "upload", "path": path}
    except Exception:
        return None, {}

# ── Microsoft Graph (SharePoint / OneDrive) ──────────────────────────────────

def _fetch_ms_graph_excel(user_id: int, ref: Dict[str, Any]):
    """
    Expect ref fields:
      {"provider": "sharepoint"|"onedrive", "drive_id": "...", "item_id": "..."}

    Wire this to your existing project helpers (e.g., graph_sharepoint.download_drive_item_bytes).
    """
    # from graph_sharepoint import download_drive_item_bytes
    # content = download_drive_item_bytes(ref["drive_id"], ref["item_id"], user_id=user_id)
    content = None  # TODO: integrate with your MS Graph downloader
    meta = {
        "provider": (ref or {}).get("provider"),
        "drive_id": (ref or {}).get("drive_id"),
        "item_id": (ref or {}).get("item_id"),
    }
    return content, meta

# ── Google Sheets ────────────────────────────────────────────────────────────

def _fetch_google_sheets(user_id: int, ref: Dict[str, Any]):
    """
    Expect ref fields:
      {"provider": "g_sheets", "spreadsheet_id": "...", "range": "Sheet!A1:Z999"}

    Convert tabular values → in-memory .xlsx for a unified parser downstream.
    """
    # from google_integrations import fetch_sheet_values
    values = None  # TODO: replace with fetch via Google Sheets API
    if not values:
        return None, {}

    # Build an in-memory XLSX with openpyxl
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    for row in values:
        ws.append(row)
    bio = io.BytesIO()
    wb.save(bio)
    bio.seek(0)
    return bio.read(), {"provider": "g_sheets", "spreadsheet_id": (ref or {}).get("spreadsheet_id")}

PROVIDER_FETCHERS = {
    "upload": _fetch_local_upload,
    "sharepoint": _fetch_ms_graph_excel,
    "onedrive": _fetch_ms_graph_excel,
    "g_sheets": _fetch_google_sheets,
    # optionally: "gdrive": _fetch_google_drive_file
}

def resolve_file_and_bytes(user_id: int, ref: Optional[Dict[str, Any]]):
    if not ref:
        return None, {}
    provider = (ref or {}).get("provider")
    fetcher = PROVIDER_FETCHERS.get(provider)
    if not fetcher:
        return None, {}
    try:
        return fetcher(user_id, ref)
    except Exception:
        return None, {}
