# backend/routes/statements_routes.py
from __future__ import annotations

import os
from datetime import date, datetime
from flask import Blueprint, jsonify, send_file, request, abort, url_for
from backend.extensions import db
from backend.models import Statement, Investor
from flask_login import current_user, login_required
from sqlalchemy import func
from backend.services.statement_service import (
    quarter_bounds,
    compute_statement_from_period_balances,
    ensure_statement_pdf,
)
# ⬇️ reads identity from Authorization header/cookie (same helper used elsewhere)
from backend.services.auth_utils import get_request_user

statements_bp = Blueprint("statements", __name__, url_prefix="/api/statements")


# ----------------------------- helpers ----------------------------


def _safe_int(x):
    try:
        return int(x)
    except (TypeError, ValueError):
        return None

def _resolve_investor_from_payload(payload) -> int | None:
    """
    Try to map a 'payload' dict (from token or session) to an Investor.id.
    Returns None for admins (unrestricted) or when no mapping is found.
    """
    if not payload:
        return None

    user_type = (payload.get("user_type") or "").lower()
    if user_type == "admin":
        return None  # admins can see all

    # 1) direct account_user_id link
    uid = _safe_int(payload.get("id"))
    if uid:
        link = Investor.query.filter_by(account_user_id=uid).first()
        if link:
            return int(link.id)

    # 2) explicit investor id in payload (various shapes)
    explicit_id = payload.get("investor_id") or (payload.get("investor") or {}).get("id")
    eid = _safe_int(explicit_id)
    if eid:
        return eid

    # 3) email match
    email = (payload.get("email") or "").strip().lower()
    if email:
        inv = Investor.query.filter(Investor.email.ilike(email)).first()
        if inv:
            return int(inv.id)

    # 4) normalized name match
    candidates = []
    if payload.get("name"):
        candidates.append(payload["name"])
    first = (payload.get("first_name") or "").strip()
    last = (payload.get("last_name") or "").strip()
    if first or last:
        candidates.append(f"{first} {last}")

    for cand in candidates:
        norm = _normalize_name(cand)
        if not norm:
            continue
        inv = Investor.query.filter(func.lower(func.trim(Investor.name)) == norm).first()
        if inv:
            return int(inv.id)

    return None

def _parse_iso(d: str | None) -> date | None:
    if not d:
        return None
    try:
        return datetime.fromisoformat(d).date()  # accepts YYYY-MM-DD or full ISO datetime
    except Exception:
        return None


_NUM_KEYS = [
    "beginning_balance",
    "contributions",
    "distributions",
    "unrealized_gl",
    "incentive_fees",
    "management_fees",
    "operating_expenses",
    "adjustment",
    "net_income_loss",
    "ending_balance",
    "ownership_percent",
    "roi_pct",
]


def _block_from_stmt(stmt: Statement, prefix: str) -> dict:
    """
    Build a numbers dictionary from Statement attributes with the given prefix.
    Example: prefix='current' -> current_beginning_balance, current_contributions, ...
    Unknown/missing attributes are treated as 0.0.
    """
    out = {}
    for key in _NUM_KEYS:
        attr = f"{prefix}_{key}"
        val = getattr(stmt, attr, None)
        try:
            out[key] = float(val if val is not None else 0.0)
        except Exception:
            out[key] = 0.0
    return out


def _payload_from_stmt(stmt: Statement) -> dict:
    """
    Serialize a Statement row into the JSON structure expected by the UI.
    If any computed fields are missing, we return zeros for them (the UI can still render).
    """
    return {
        "id": stmt.id,
        "entity": getattr(stmt, "entity_name", "") or "",
        "investor": getattr(stmt, "investor_name", "") or "",
        "period": {
            "start": stmt.period_start.isoformat() if stmt.period_start else None,
            "end": stmt.period_end.isoformat() if stmt.period_end else None,
        },
        "current": _block_from_stmt(stmt, "current"),
        "ytd": _block_from_stmt(stmt, "ytd"),
        "pdfAvailable": bool(getattr(stmt, "pdf_path", None)),
    }



def _normalize_name(s: str | None) -> str:
    # collapse internal whitespace and lowercase
    if not s:
        return ""
    return " ".join(s.split()).lower()


def _current_investor_id() -> int | None:
    """
    Resolve investor id from either the request token OR the Flask-Login session.
    """
    # 1) Try token/JWT or any request-based identity
    ru = get_request_user(request) or {}
    inv_id = _resolve_investor_from_payload(ru)

    # 2) If token was missing/invalid/incomplete, fall back to cookie session
    if inv_id is None and getattr(current_user, "is_authenticated", False):
        session_payload = {
            "id": getattr(current_user, "id", None),
            "email": getattr(current_user, "email", None),
            "first_name": getattr(current_user, "first_name", None),
            "last_name": getattr(current_user, "last_name", None),
            "user_type": getattr(current_user, "user_type", None),
        }
        inv_id = _resolve_investor_from_payload(session_payload)

    return inv_id

def _is_admin() -> bool:
    ru = get_request_user(request) or {}
    if not ru and getattr(current_user, "is_authenticated", False):
        return (getattr(current_user, "user_type", "") or "").lower() == "admin"
    return (ru.get("user_type") or "").lower() == "admin"


def _is_admin() -> bool:
    ru = get_request_user(request)
    return bool(ru and (ru.get("user_type") or "").lower() == "admin")


def _enforce_ownership(stmt: Statement) -> None:
    if _is_admin():
        return
    my_inv_id = _current_investor_id()
    if not my_inv_id:
        abort(403, description="Not allowed")

    if getattr(stmt, "investor_id", None) == my_inv_id:
        return

    # Fallback: if legacy statement lacks/has wrong investor_id, match by normalized name
    from backend.models import Investor
    me = Investor.query.get(my_inv_id)
    me_name = (me.name or "").strip().lower() if me else ""
    stmt_name = (getattr(stmt, "investor_name", "") or "").strip().lower()
    if not me_name or me_name != stmt_name:
        abort(403, description="Not allowed")


# ------------------------------ routes -----------------------------

@statements_bp.get("")
@login_required
def list_statements_no_slash():
    """
    GET /api/statements
    Query params:
      - investor_id: int (optional for admin; used for investors too if it matches)
      - start: ISO date (optional)  -> filters period_end >= start
      - end: ISO date (optional)    -> filters period_start <= end
    """
    user_is_admin = _is_admin()

    # read any explicit param
    investor_id_param = request.args.get("investor_id", type=int)

    if user_is_admin:
        investor_id = investor_id_param  # admins may see all or filter
    else:
        my_inv = _current_investor_id()
        if my_inv:
            # if caller supplied a different investor id, block it
            if investor_id_param and investor_id_param != my_inv:
                return jsonify([])  # or abort(403)
            investor_id = my_inv
        else:
            # couldn’t resolve from auth payload; fall back to the param
            investor_id = investor_id_param
            if not investor_id:
                # still nothing -> nothing to show (don’t leak)
                return jsonify([])

    start = _parse_iso(request.args.get("start"))
    end = _parse_iso(request.args.get("end"))

    q = Statement.query
    if investor_id:
        q = q.filter(Statement.investor_id == investor_id)
    if start:
        q = q.filter(Statement.period_end >= start)
    if end:
        q = q.filter(Statement.period_start <= end)

    rows = q.order_by(Statement.period_end.desc()).all()
    payload = []
    for s in rows:
        payload.append({
            "id": s.id,
            "name": f"Investor Statement {s.period_start}–{s.period_end}",
            "investor": s.investor_name,
            "entity": s.entity_name,
            "dueDate": s.period_end.isoformat() if s.period_end else None,
            "status": "Paid" if (getattr(s, "ending_balance", 0) or 0) >= 0 else "Outstanding",
            "amountDue": float(0),
            "paidDate": None,
            "pdfAvailable": bool(getattr(s, "pdf_path", None)),
        })
    return jsonify(payload)



@statements_bp.get("/")
@login_required
def list_statements_with_slash():
    # Trailing slash variant for convenience/reverse proxy configurations
    return list_statements_no_slash()


@statements_bp.get("/<int:statement_id>")
@login_required
def get_statement_detail(statement_id: int):
    """
    GET /api/statements/<id>
    Returns JSON for the preview drawer.

    Ownership is enforced for non-admin users.

    If stored computed fields are missing or stale, recompute them in-memory
    (and persist the refreshed numbers).
    """
    stmt = Statement.query.get(statement_id)
    if not stmt:
        abort(404, description="Statement not found")

    _enforce_ownership(stmt)

    # If the statement might predate new fields, recompute using the service so
    # the JSON always has values the UI expects.
    need_recompute = False
    for key in ("current_beginning_balance", "current_ending_balance",
                "ytd_beginning_balance", "ytd_ending_balance"):
        if not hasattr(stmt, key):
            need_recompute = True
            break

    if not need_recompute:
        for k in ("current_beginning_balance", "current_ending_balance"):
            if getattr(stmt, k, None) is None:
                need_recompute = True
                break

    if need_recompute:
        inv = Investor.query.get(getattr(stmt, "investor_id", None))
        if inv and stmt.period_start and stmt.period_end:
            stmt = compute_statement_from_period_balances(
                inv,
                stmt.period_start,
                stmt.period_end,
                getattr(stmt, "entity_name", "") or "Elpis Opportunity Fund LP",
            )
            db.session.commit()

    payload = _payload_from_stmt(stmt)
    return jsonify(payload)


@statements_bp.get("/<int:statement_id>/view")
@login_required
def get_statement_view_alias(statement_id: int):
    """
    GET /api/statements/<id>/view
    Convenience alias for the frontend "View" action.
    """
    return get_statement_detail(statement_id)


@statements_bp.delete("/<int:statement_id>")
@login_required
def delete_statement(statement_id: int):
    """
    DELETE /api/statements/<id>
    Removes the statement and (best-effort) deletes the generated PDF file.
    (Optionally, you can enforce admin-only here.)
    """
    stmt = Statement.query.get(statement_id)
    if not stmt:
        abort(404, description="Statement not found")

    # Only owner or admin may delete
    _enforce_ownership(stmt)

    # Best-effort cleanup of the generated PDF
    try:
        if stmt.pdf_path and os.path.isfile(stmt.pdf_path):
            os.remove(stmt.pdf_path)
    except Exception:
        pass

    db.session.delete(stmt)
    db.session.commit()
    return jsonify({"ok": True})


@statements_bp.post("/generate")
@login_required
def generate_statement():
    """
    POST /api/statements/generate
    Body: { "investor_id": 123, "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "entity_name": "..." }
    If start/end are omitted, generates for the current quarter.

    (Typically an admin action; add admin check if required.)
    """
    data = request.get_json(silent=True) or {}
    investor_id = data.get("investor_id")
    if not investor_id:
        return jsonify(error="investor_id is required"), 400

    inv = Investor.query.get_or_404(investor_id)

    start = _parse_iso(data.get("start"))
    end = _parse_iso(data.get("end"))
    if not (start and end):
        start, end = quarter_bounds(date.today())

    entity_name = (data.get("entity_name") or "Elpis Opportunity Fund LP").strip()

    stmt = compute_statement_from_period_balances(inv, start, end, entity_name)
    db.session.commit()

    pdf_path = ensure_statement_pdf(stmt)
    stmt.pdf_path = pdf_path
    db.session.commit()

    return jsonify({
        "ok": True,
        "statement_id": stmt.id,
        "pdf": pdf_path,
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "investor": {"id": inv.id, "name": inv.name},
    })


@statements_bp.post("/generate-quarter")
@login_required
def generate_all_for_quarter():
    """
    POST /api/statements/generate-quarter
    Body: { "year": 2025, "quarter": 1, "entity_name": "..." }
    Generates statements for ALL investors in that quarter.
    (Typically an admin action; add admin check if required.)
    """
    data = request.get_json(silent=True) or {}
    year = int(data.get("year") or date.today().year)
    quarter = int(data.get("quarter") or ((date.today().month - 1)//3 + 1))
    start_month = 3*(quarter-1)+1
    from calendar import monthrange
    start = date(year, start_month, 1)
    end = date(year, start_month+2, monthrange(year, start_month+2)[1])

    entity_name = (data.get("entity_name") or "Elpis Opportunity Fund LP").strip()

    created = []
    for inv in Investor.query.all():
        stmt = compute_statement_from_period_balances(inv, start, end, entity_name)
        db.session.flush()
        pdf_path = ensure_statement_pdf(stmt)
        stmt.pdf_path = pdf_path
        created.append(stmt.id)

    db.session.commit()
    return jsonify({"ok": True, "created_ids": created,
                    "period": {"start": start.isoformat(), "end": end.isoformat()}})



@statements_bp.get("/<int:statement_id>/pdf")
@login_required
def download_statement_pdf(statement_id: int):
    """
    GET /api/statements/<id>/pdf
    Always returns a PDF (renders one if missing).
    Ownership is enforced for non-admin users.
    Use ?inline=1 to preview in an <iframe>.
    """
    stmt = Statement.query.get_or_404(statement_id)

    _enforce_ownership(stmt)

    if not stmt.pdf_path:
        pdf_path = ensure_statement_pdf(stmt)
        stmt.pdf_path = pdf_path
        db.session.commit()

    filename = f"{stmt.investor_name}_{stmt.period_end}.pdf" if stmt.period_end else "statement.pdf"

    inline = (request.args.get("inline") == "1")
    # when inline=True, set as_attachment=False so browsers can render inside <iframe>
    return send_file(stmt.pdf_path, as_attachment=not inline, download_name=filename)
