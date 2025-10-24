# routes/metrics_sync_routes.py
# Purpose: ONLY portfolio/monthly totals sync from SharePoint sheets into PortfolioPeriodMetric.
from __future__ import annotations

import os, math, logging
from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Tuple, Optional

import pandas as pd
from flask import Blueprint, jsonify, request, current_app
from flask import has_request_context
from flask_jwt_extended import jwt_required
from apscheduler.schedulers.background import BackgroundScheduler

from backend.extensions import db
from backend.models import PortfolioPeriodMetric, SharePointConnection

from backend.graph_excel_live import create_session, close_session, used_range_values

log = logging.getLogger(__name__)
metrics_sync_bp = Blueprint("metrics_sync", __name__)

# ------------ bearer ------------
try:
    from routes.sharepoint_excel_routes import _bearer_from_request
except Exception:
    _bearer_from_request = None

def _get_bearer(allow_session: bool = True) -> Optional[str]:
    env_tok = (os.getenv("MS_GRAPH_BEARER") or "").strip()
    if env_tok: return env_tok
    if allow_session and has_request_context():
        auth = (request.headers.get("Authorization") or "").strip()
        if auth.lower().startswith("bearer "): return auth[7:].strip()
        if request.is_json:
            b = (request.json or {}).get("bearer")
            if b: return str(b).strip()
        if _bearer_from_request:
            try:
                b = _bearer_from_request()
                if b: return b
            except Exception:
                pass
    return None

# ------------ parsing helpers ------------
def _to_float_cell(v) -> float:
    if v is None or v == "" or str(v).strip() in {"—", "-", "–"}: return math.nan
    s = str(v).strip().replace(",", "").replace("$", "")
    if s.startswith("(") and s.endswith(")"): s = "-" + s[1:-1]
    try: return float(s)
    except Exception: return math.nan

def _candidate_date_formats():
    return ("%m/%d/%Y","%Y-%m-%d","%d/%m/%Y","%m/%d/%y","%d-%b-%Y","%Y-%m-%d %H:%M:%S","%Y-%m-%dT%H:%M:%S","%d-%b-%y","%b-%y","%b %y","%b-%Y","%b %Y")

def _maybe_excel_serial(v) -> Optional[date]:
    try:
        fv = float(v)
        if 20000 < fv < 90000:
            base = datetime(1899, 12, 30)
            return (base + timedelta(days=int(fv))).date()
    except Exception:
        pass
    return None

def _looks_like_date(v) -> bool:
    if isinstance(v, (datetime, date)): return True
    if _maybe_excel_serial(v): return True
    s = str(v).strip().rstrip("Z")
    for fmt in _candidate_date_formats():
        try: datetime.strptime(s, fmt); return True
        except Exception: continue
    return False

def _parse_date_any(v) -> Optional[date]:
    if isinstance(v, datetime): return v.date()
    if isinstance(v, date): return v
    ser = _maybe_excel_serial(v)
    if ser: return ser
    s = str(v).strip().rstrip("Z")
    for fmt in _candidate_date_formats():
        try: return datetime.strptime(s, fmt).date()
        except Exception: continue
    return None

import regex as _re
def _clean_txt(x: str) -> str:
    return _re.sub(r"\s+", " ", (x or "")).strip().lower()

_LABEL_ALIASES = {
    "Beginning Balance": [r"^begin(ning)? balance$", r"^opening (nav|balance)$", r"^current period begin(ning)? balance$", r"^total begin(ning)? balance$", r"^total beginning balance$"],
    "Ending Balance":    [r"^ending balance$", r"^closing balance$", r"^current value$", r"^total ending balance$", r"^total current value$"],
    "Unrealized Gain/Loss": [r"^realis?ed gain/?loss$", r"^unrealized pnl$", r"^realis?ed gain/\(loss\)$", r"^total unrealis?ed gain/?loss$"],
    "Realized Gain/Loss":   [r"^realis?ed gain/?loss$", r"^realized pnl$", r"^total realis?ed gain/?loss$"],
    "Management Fees":      [r"^management fees?$", r"^mgmt fees?$", r"^total management fees?$"],
}
_METRIC_KEYS = { "Beginning Balance":"beginning", "Ending Balance":"ending", "Unrealized Gain/Loss":"unrealized", "Realized Gain/Loss":"realized", "Management Fees":"fees" }

def _find_label_row(values: List[List], canonical_label: str, search_rows: int = 250) -> Optional[int]:
    pats = [_re.compile(p, _re.I) for p in _LABEL_ALIASES.get(canonical_label, [canonical_label])]
    for r_idx, row in enumerate(values[:search_rows], start=1):
        for cell in row:
            if any(p.fullmatch(_clean_txt(str(cell))) for p in pats):
                return r_idx
    return None

def _find_header_row_and_date_columns(values: List[List], max_scan_rows: int = 180, anchor_row: Optional[int] = None) -> Tuple[Optional[int], Dict[int, date]]:
    candidates: List[Tuple[int, Dict[int, date]]] = []
    rows = len(values)
    cols = max((len(r) for r in values), default=0)
    for r in range(1, min(rows, max_scan_rows) + 1):
        local: Dict[int, date] = {}
        row = values[r - 1]
        for c in range(1, cols + 1):
            v = row[c - 1] if c - 1 < len(row) else None
            if _looks_like_date(v):
                d = _parse_date_any(v)
                if d: local[c] = d
        if len(local) >= 2:
            candidates.append((r, local))
    if not candidates: return None, {}
    if anchor_row:
        above = [(r, m) for (r, m) in candidates if r <= anchor_row]
        if above:
            above.sort(key=lambda x: (anchor_row - x[0], -len(x[1])))
            return above[0]
    candidates.sort(key=lambda x: (-len(x[1]), x[0]))
    return candidates[0]

def _metric_for_column(values: List[List], header_row_1b: int, col_1b: int) -> Optional[str]:
    compiled = {name: [_re.compile(p, _re.I) for p in pats] for name, pats in _LABEL_ALIASES.items()}
    for d in range(0, 13):
        for r in (header_row_1b - d, header_row_1b + d):
            if r < 1: continue
            row = values[r - 1] if r - 1 < len(values) else []
            cell = row[col_1b - 1] if col_1b - 1 < len(row) else None
            txt = _clean_txt("" if cell is None else str(cell))
            for canonical, patterns in compiled.items():
                if any(p.fullmatch(txt) for p in patterns):
                    return _METRIC_KEYS.get(canonical)
    return None

def _next_metric_label_below(values: List[List], start_row_1b: int, all_label_rows: List[Optional[int]]) -> Optional[int]:
    below = [r for r in all_label_rows if r and r > start_row_1b]
    return min(below) if below else None

def _sum_investor_rows_ignore_total(values: List[List], start_label_row_1b: int, date_col_1b: int, stop_row_1b: Optional[int] = None, name_col_1b: int = 2, id_col_1b: int = 1, max_blank_streak: int = 50) -> Optional[float]:
    total = 0.0; have = False; blanks = 0
    FORBIDDEN = {"total", "entity level", "grand total"}
    r = start_label_row_1b + 1; rows = len(values); limit = stop_row_1b if stop_row_1b else rows + 1
    while r < limit and r <= rows:
        row = values[r - 1] if r - 1 < len(values) else []
        name_val = row[name_col_1b - 1] if name_col_1b - 1 < len(row) else None
        id_val   = row[id_col_1b   - 1] if id_col_1b   - 1 < len(row) else None
        name_txt = _clean_txt("" if name_val is None else str(name_val))
        if name_txt in FORBIDDEN:
            r += 1; blanks = 0; continue
        is_partner_row = bool(name_txt) or (isinstance(id_val, (int,float)) or (isinstance(id_val, str) and id_val.strip()))
        if not is_partner_row:
            blanks += 1
            if blanks >= max_blank_streak: break
            r += 1; continue
        else:
            blanks = 0
        v = row[date_col_1b - 1] if date_col_1b - 1 < len(row) else None
        f = _to_float_cell(v)
        if not math.isnan(f):
            total += float(f); have = True
        r += 1
    return total if have else None

def _find_period_dates_row_map(values: List[List], max_scan_rows: int = 80) -> Dict[int, date]:
    if not values: return {}
    rows = len(values)
    cols = max((len(r) for r in values), default=0)

    def _row_dates(r_idx_1b: int) -> Dict[int, date]:
        row = values[r_idx_1b - 1] if r_idx_1b - 1 < len(values) else []
        out: Dict[int, date] = {}
        for c in range(1, cols + 1):
            v = row[c - 1] if c - 1 < len(row) else None
            d = _parse_date_any(v)
            if d: out[c] = d
        return out

    for r in range(1, min(rows, max_scan_rows) + 1):
        row = values[r - 1]
        if any(_clean_txt(str(cell)) == "ending date" for cell in row):
            dates = _row_dates(r)
            if len(dates) >= 2: return dates
    best = {}
    for r in range(1, min(rows, max_scan_rows) + 1):
        dates = _row_dates(r)
        if len(dates) > len(best) and len(dates) >= 6:
            best = dates
    return best

# ------------ upsert (NO per-row commit) ------------
def _upsert_metric(sheet: str, as_of: date, beginning: Optional[float], ending: Optional[float], unrealized: Optional[float], realized: Optional[float], fees: Optional[float], source: str = "sharepoint-auto") -> None:
    row = PortfolioPeriodMetric.query.filter_by(sheet=sheet, as_of_date=as_of).first()
    if row is None: row = PortfolioPeriodMetric(sheet=sheet, as_of_date=as_of)
    row.beginning_balance    = float(beginning)  if beginning  is not None else None
    row.ending_balance       = float(ending)     if ending     is not None else None
    row.unrealized_gain_loss = float(unrealized) if unrealized is not None else None
    row.realized_gain_loss   = float(realized)   if realized   is not None else None
    row.management_fees      = float(fees)       if fees       is not None else None
    row.source = source
    db.session.add(row)

def _ingest_all_months_for_sheet(drive_id: str, item_id: str, bearer: str, sheet: str) -> Dict[str, Any]:
    from calendar import monthrange
    sid = None
    try:
        sid = create_session(drive_id, item_id, bearer, persist=False)
        values = None; tried = [sheet, sheet.replace(" ", ""), sheet.replace(" (", "(")]; last_err = None
        for sn in tried:
            try: values = used_range_values(drive_id, item_id, sn, bearer, sid); sheet = sn; break
            except Exception as e: last_err = e
        if values is None:
            return {"ok": False, "error": f"Worksheet not found (tried {tried}), last error: {last_err}"}

        lbl_end = None
        for r_i, row in enumerate(values[:200], start=1):
            if any("ending balance" in str(x).lower() for x in row if x is not None): lbl_end = r_i; break
        hdr_row, date_cols = _find_header_row_and_date_columns(values, max_scan_rows=200, anchor_row=(lbl_end or 200))
        if not hdr_row or not date_cols:
            return {"ok": False, "error": "No header row with month/date columns found near totals block."}

        # label rows
        def _find_label(label): 
            for r_i, row in enumerate(values[:250], start=1):
                if any(_clean_txt(str(x)) == _clean_txt(label) for x in row if x is not None): return r_i
            return None
        lbl_begin = _find_label("Beginning Balance")
        lbl_end   = _find_label("Ending Balance")
        lbl_unrl  = _find_label("Unrealized Gain/Loss")
        lbl_rlzd  = _find_label("Realized Gain/Loss")
        lbl_fees  = _find_label("Management Fees")
        label_rows = {"beginning": lbl_begin, "ending": lbl_end, "unrealized": lbl_unrl, "realized": lbl_rlzd, "fees": lbl_fees}
        all_label_rows = [lbl_begin, lbl_end, lbl_unrl, lbl_rlzd, lbl_fees]

        totals_by_date: Dict[date, Dict[str, Optional[float]]] = {}
        used_partner_sum = unmapped_cols = skipped_missing_label = 0

        for col1b, dt in sorted(date_cols.items()):
            # normalize month to month-end day
            as_of = date(dt.year, dt.month, monthrange(dt.year, dt.month)[1])
            rec = totals_by_date.get(as_of) or dict(beginning=None, ending=None, unrealized=None, realized=None, fees=None)

            metric = _metric_for_column(values, hdr_row, col1b)
            if not metric:
                unmapped_cols += 1; totals_by_date[as_of] = rec; continue

            start_row = label_rows.get(metric)
            if not start_row:
                skipped_missing_label += 1; totals_by_date[as_of] = rec; continue

            stop_row = _next_metric_label_below(values, start_row, all_label_rows)
            val = _sum_investor_rows_ignore_total(values, start_label_row_1b=start_row, date_col_1b=col1b, stop_row_1b=stop_row)
            if val is not None: used_partner_sum += 1
            rec[metric] = val
            totals_by_date[as_of] = rec

        # carry forward beginning where missing
        for d in sorted(totals_by_date.keys()):
            if totals_by_date[d]["beginning"] is None:
                prevs = [p for p in totals_by_date if p < d]
                if prevs:
                    totals_by_date[d]["beginning"] = totals_by_date[max(prevs)]["ending"]

        upserted = 0
        for dt_key, rec in sorted(totals_by_date.items()):
            _upsert_metric(sheet=sheet, as_of=dt_key, beginning=rec["beginning"], ending=rec["ending"],
                           unrealized=rec["unrealized"], realized=rec["realized"], fees=rec["fees"], source="sharepoint-auto")
            upserted += 1
        db.session.commit()  # single commit

        current_app.logger.info("sync: sheet=%s hdr=%s date_cols=%d used_partner_sum=%d unmapped=%d missing_label=%d upserted=%d",
                                sheet, hdr_row, len(date_cols), used_partner_sum, unmapped_cols, skipped_missing_label, upserted)
        return {"ok": True, "sheet": sheet, "header_row": hdr_row, "date_cols": len(date_cols),
                "used_partner_sum": used_partner_sum, "unmapped_cols": unmapped_cols,
                "skipped_missing_label": skipped_missing_label, "count": upserted}
    finally:
        if sid:
            try: close_session(drive_id, item_id, bearer, sid)
            except Exception: pass

@metrics_sync_bp.post("/api/metrics/sync/once")
@jwt_required(optional=True)
def sync_once():
    bearer = _get_bearer(allow_session=True)
    if not bearer:
        return jsonify(error="Missing Graph bearer (set MS_GRAPH_BEARER env or send Authorization header)"), 401
    body  = request.get_json(silent=True) or {}
    sheet = (body.get("sheet") or os.getenv("DEFAULT_SHEET") or "bCAS (Q4 Adj)").strip()
    conn = SharePointConnection.query.order_by(SharePointConnection.added_at.desc()).first()
    if not conn: return jsonify(error="No SharePoint connections saved."), 400
    res = _ingest_all_months_for_sheet(conn.drive_id, conn.item_id, bearer, sheet)
    ok = bool(res.get("ok"))
    return jsonify({"sheet": sheet, **res}), (200 if ok else 400)

@metrics_sync_bp.post("/api/metrics/sync/auto-now")
@jwt_required(optional=True)
def auto_now():
    bearer = _get_bearer(allow_session=True)
    if not bearer:
        return jsonify(error="Missing Graph bearer (set MS_GRAPH_BEARER env or send Authorization header)"), 401
    sheets_env = os.getenv("AUTO_SHEETS", "bCAS (Q4 Adj)")
    sheets = [s.strip() for s in sheets_env.split(",") if s.strip()]
    conns = SharePointConnection.query.order_by(SharePointConnection.added_at.desc()).all()
    if not conns: return jsonify(error="No SharePoint connections saved."), 400

    results = []
    for c in conns:
        for sh in sheets:
            res = _ingest_all_months_for_sheet(c.drive_id, c.item_id, bearer, sh)
            results.append({"connection": c.id, "sheet": sh, **res})
    return jsonify(ok=True, results=results)

# background autosync (unchanged)
_scheduler: Optional[BackgroundScheduler] = None
def init_autosync(app=None, interval_seconds: Optional[int] = None):
    global _scheduler
    if _scheduler is not None: return _scheduler
    if app is None:
        from flask import current_app as _ca
        app = _ca._get_current_object()
    seconds = interval_seconds or int(os.getenv("AUTOSYNC_SECONDS", "120"))
    if seconds <= 0:
        app.logger.info("autosync disabled (AUTOSYNC_SECONDS<=0)")
        return None
    _scheduler = BackgroundScheduler(daemon=True)
    def job():
        with app.app_context():
            try:
                bearer = _get_bearer(allow_session=False)
                if not bearer:
                    app.logger.info("autosync: no MS_GRAPH_BEARER; skipping"); return
                sheets_env = os.getenv("AUTO_SHEETS", "bCAS (Q4 Adj)")
                sheets = [s.strip() for s in sheets_env.split(",") if s.strip()]
                conns = SharePointConnection.query.order_by(SharePointConnection.added_at.desc()).all()
                if not conns:
                    app.logger.info("autosync: no SharePoint connections; skipping"); return
                for c in conns:
                    for sh in sheets:
                        _ingest_all_months_for_sheet(c.drive_id, c.item_id, bearer, sh)
            except Exception as e:
                app.logger.exception("autosync job failed: %s", e)
    _scheduler.add_job(job, "interval", seconds=seconds, id="metrics-autosync",
                       max_instances=1, coalesce=True, misfire_grace_time=30)
    _scheduler.start()
    try:
        import threading
        threading.Thread(target=job, name="metrics-autosync-warmup", daemon=True).start()
    except Exception:
        pass
    app.logger.info("autosync scheduler started (interval=%ss)", seconds)
    return _scheduler
