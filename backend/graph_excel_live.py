# backend/graph_excel_live.py
from __future__ import annotations

import re
import time
from datetime import datetime
from typing import Optional, Dict, Any, List, Tuple

import requests
from requests import Response

GRAPH_BASE = "https://graph.microsoft.com/v1.0"


# ────────────────────────── HTTP helpers ──────────────────────────
def _headers(bearer: str, session_id: Optional[str] = None) -> Dict[str, str]:
    h = {"Authorization": f"Bearer {bearer}"}
    if session_id:
        h["workbook-session-id"] = session_id
    return h


def _sleep_from_retry_after(resp: Response, fallback_seconds: float) -> float:
    try:
        ra = resp.headers.get("Retry-After")
        if not ra:
            return fallback_seconds
        secs = float(ra)
        return max(secs, fallback_seconds)
    except Exception:
        return fallback_seconds


def _request_with_retries(
    method: str,
    url: str,
    *,
    max_attempts: int = 3,
    timeout: float = 90.0,
    backoff_base: float = 2.0,
    backoff_cap: float = 30.0,
    retry_on_status: tuple = (429, 500, 502, 503, 504),
    **kwargs: Any,
) -> Response:
    attempt = 0
    last_exc: Optional[Exception] = None

    while attempt < max_attempts:
        attempt += 1
        try:
            resp = requests.request(method, url, timeout=timeout, **kwargs)
            if resp.status_code in retry_on_status:
                sleep_s = _sleep_from_retry_after(resp, min(backoff_cap, backoff_base * attempt))
                time.sleep(sleep_s)
                last_exc = requests.HTTPError(f"{resp.status_code} on {method} {url}")
                continue

            resp.raise_for_status()
            return resp

        except (requests.exceptions.ReadTimeout,
                requests.exceptions.ConnectTimeout,
                requests.exceptions.ConnectionError) as e:
            last_exc = e
            sleep_s = min(backoff_cap, backoff_base * attempt)
            time.sleep(sleep_s)
            continue

        except requests.exceptions.RequestException:
            raise

    if last_exc:
        raise last_exc
    raise RuntimeError(f"Request failed after {max_attempts} attempts: {method} {url}")


# ─────────────────────── Workbook sessions ────────────────────────
def create_session(drive_id: str, item_id: str, bearer: str, persist: bool = False) -> str:
    url = f"{GRAPH_BASE}/drives/{drive_id}/items/{item_id}/workbook/createSession"
    resp = _request_with_retries(
        "POST",
        url,
        max_attempts=3,
        timeout=90.0,
        json={"persistChanges": persist},
        headers=_headers(bearer),
    )
    sid = resp.json().get("id")
    if not sid:
        raise RuntimeError("createSession succeeded but no session id was returned")
    return sid


def close_session(drive_id: str, item_id: str, bearer: str, session_id: str) -> None:
    url = f"{GRAPH_BASE}/drives/{drive_id}/items/{item_id}/workbook/closeSession"
    try:
        requests.post(url, headers=_headers(bearer, session_id), timeout=15).raise_for_status()
    except Exception:
        pass


# ───────────────────────── Range helpers ──────────────────────────
def used_range_values(
    drive_id: str,
    item_id: str,
    sheet: str,
    bearer: str,
    session_id: str,
) -> List[List]:
    url = (
        f"{GRAPH_BASE}/drives/{drive_id}/items/{item_id}"
        f"/workbook/worksheets('{sheet}')/usedRange(valuesOnly=true)?$select=values"
    )
    resp = _request_with_retries(
        "GET",
        url,
        max_attempts=3,
        timeout=120.0,
        headers=_headers(bearer, session_id),
    )
    return resp.json().get("values") or []


def read_range(
    drive_id: str,
    item_id: str,
    worksheet: str,
    address: str,
    bearer: str,
    session_id: Optional[str] = None,
) -> Dict[str, Any]:
    ws = requests.utils.quote(worksheet)
    addr = requests.utils.quote(address)
    url = (
        f"{GRAPH_BASE}/drives/{drive_id}/items/{item_id}"
        f"/workbook/worksheets('{ws}')/range(address='{addr}')?$select=values,address"
    )
    resp = _request_with_retries("GET", url, headers=_headers(bearer, session_id), timeout=60.0)
    return resp.json()


def write_range_value(
    drive_id: str,
    item_id: str,
    worksheet: str,
    address: str,
    value,
    bearer: str,
    session_id: Optional[str] = None,
    number_format: Optional[str] = None,
) -> None:
    ws = requests.utils.quote(worksheet)
    addr = requests.utils.quote(address)
    url = (
        f"{GRAPH_BASE}/drives/{drive_id}/items/{item_id}"
        f"/workbook/worksheets('{ws}')/range(address='{addr}')"
    )
    if isinstance(value, (list, tuple)):
        vals = [list(value)]
    else:
        vals = [[value]]

    body = {"values": vals}
    if number_format:
        body["numberFormat"] = [[number_format] * len(vals[0])]

    _request_with_retries(
        "PATCH",
        url,
        headers=_headers(bearer, session_id),
        json=body,
        timeout=60.0,
        max_attempts=3,
    )


# ──────────────────────── Dynamic discovery ───────────────────────
def _a1(row: int, col: int) -> str:
    """Convert 1-based row, col to A1 (e.g., 1,1 -> A1)."""
    name = ""
    c = col
    while c:
        c, r = divmod(c - 1, 26)
        name = chr(65 + r) + name
    return f"{name}{row}"


def _is_int(v) -> bool:
    try:
        if isinstance(v, bool):
            return False
        if isinstance(v, (int,)):
            return True
        if isinstance(v, float) and float(v).is_integer():
            return True
        s = str(v).strip()
        if re.fullmatch(r"-?\d+", s):
            return True
    except Exception:
        pass
    return False


def _to_float(v) -> float | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        try:
            return float(v)
        except Exception:
            return None
    s = str(v).strip()
    if not s:
        return None
    s = s.replace(",", "").replace("$", "")
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1]
    try:
        return float(s)
    except Exception:
        return None


def _looks_like_date(v) -> bool:
    if isinstance(v, datetime):
        return True
    if isinstance(v, (int, float)) and 20000 < float(v) < 90000:
        return True
    s = str(v).strip()
    for fmt in ("%m/%d/%Y", "%d/%m/%Y", "%Y-%m-%d", "%m/%d/%y"):
        try:
            datetime.strptime(s, fmt)
            return True
        except Exception:
            continue
    return False


def _discover_control_block(values: List[List]) -> Optional[Tuple[int, int]]:
    """
    Find the top cell (row, col) of a 3-row control block:
      [YYYY]
      [  M ]  (1..12)
      [ date ] (end-of-month or any date)
    Returns 1-based (row, col) or None.
    """
    rows = len(values)
    cols = max((len(r) for r in values), default=0)
    for r in range(1, rows - 2 + 1):  # 1-based
        row = values[r - 1]
        for c in range(1, cols + 1):
            y = row[c - 1] if c - 1 < len(row) else None
            if not _is_int(y):
                continue
            yi = int(float(y))
            if yi < 1900 or yi > 2100:
                continue
            # month on next row
            m = values[r][c - 1] if r < rows and c - 1 < len(values[r]) else None
            if not _is_int(m):
                continue
            mi = int(float(m))
            if mi < 1 or mi > 12:
                continue
            # date on next next row
            d = values[r + 1][c - 1] if r + 1 < rows and c - 1 < len(values[r + 1]) else None
            if not _looks_like_date(d):
                continue
            return (r, c)
    return None


def _find_label_numeric_right(values: List[List], label: str) -> Optional[Tuple[str, float]]:
    """
    Locate a cell whose text equals the given label (case-insensitive, trimmed).
    Return (address_of_numeric_cell, numeric_value) where numeric cell is the first
    convertible-to-number cell to the RIGHT of the label in the same row.
    """
    target = label.strip().lower()
    for r_idx, row in enumerate(values, start=1):
        for c_idx, cell in enumerate(row, start=1):
            text = str(cell).strip().lower() if cell is not None else ""
            if text == target:
                # scan right for first numeric
                c = c_idx + 1
                while True:
                    if c - 1 >= len(row):
                        break
                    num = _to_float(row[c - 1])
                    if num is not None:
                        return _a1(r_idx, c), float(num)
                    c += 1
    return None


def compute_month_begin_end_dynamic(
    drive_id: str,
    item_id: str,
    sheet: str,
    bearer: str,
    year: int,
    month: int,
    session_id: Optional[str] = None,
    settle_delay_sec: float = 0.4,
) -> Dict[str, Any]:
    """
    Dynamic, no-hardcoding:
      - Discover the [Year, Month, Date] block; write year/month there.
      - Let Excel recalc (brief delay).
      - Find 'Beginning Balance' and 'Ending Balance' labels and read the first numeric to the right.
    If session_id is not provided, this function creates and closes one.
    """
    own_session = False
    sid = session_id
    if sid is None:
        sid = create_session(drive_id, item_id, bearer, persist=False)
        own_session = True

    try:
        # 1) read used range to discover where to write
        values = used_range_values(drive_id, item_id, sheet, bearer, sid)
        if not values:
            raise RuntimeError("Sheet has no values")

        ctrl = _discover_control_block(values)
        if not ctrl:
            raise RuntimeError("Could not locate Year/Month control block automatically.")
        r, c = ctrl
        year_addr = _a1(r, c)
        month_addr = _a1(r + 1, c)

        # 2) write year and month
        write_range_value(drive_id, item_id, sheet, year_addr, int(year), bearer, sid)
        write_range_value(drive_id, item_id, sheet, month_addr, int(month), bearer, sid)

        # 3) let Excel recalc briefly
        time.sleep(settle_delay_sec)

        # 4) re-read used range and locate totals by labels
        values2 = used_range_values(drive_id, item_id, sheet, bearer, sid)

        beg = _find_label_numeric_right(values2, "Beginning Balance")
        end = _find_label_numeric_right(values2, "Ending Balance")
        if not end:
            # many books show 'Current Value' instead of 'Ending Balance'
            end = _find_label_numeric_right(values2, "Current Value")

        if not beg or not end:
            raise RuntimeError("Could not locate 'Beginning Balance' / 'Ending Balance' totals dynamically.")

        _, beginning_value = beg
        _, ending_value = end

        return {
            "sheet": sheet,
            "year": int(year),
            "month": int(month),
            "initial_value": beginning_value,
            "current_value": ending_value,
            "labels_found": {
                "beginning": True,
                "ending": True
            },
            "write_addresses": {
                "year": year_addr,
                "month": month_addr
            }
        }

    finally:
        if own_session:
            close_session(drive_id, item_id, bearer, sid)
