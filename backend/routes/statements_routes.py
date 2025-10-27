# backend/routes/statements_routes.py
from __future__ import annotations

import os
from datetime import date, datetime
from flask import Blueprint, jsonify, send_file, request, abort
from backend.extensions import db
from backend.models import Statement, Investor
from backend.services.statement_service import (
    quarter_bounds,
    compute_statement_from_period_balances,
    ensure_statement_pdf,
)

statements_bp = Blueprint("statements", __name__, url_prefix="/api/statements")


# ----------------------------- helpers -----------------------------

def _parse_iso(d: str | None) -> date | None:
    if not d:
        return None
    try:
        # Accept both YYYY-MM-DD and full ISO datetime
        return datetime.fromisoformat(d).date()
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


# ------------------------------ routes -----------------------------

@statements_bp.get("")
def list_statements_no_slash():
    """
    GET /api/statements
    Query params:
      - investor_id: int (optional)
      - start: ISO date (optional)
      - end: ISO date (optional)
    """
    investor_id = request.args.get("investor_id", type=int)
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
            # Table "status" here is just a simple label; adjust if you track real payment state
            "status": "Paid" if (getattr(s, "ending_balance", 0) or 0) >= 0 else "Outstanding",
            "amountDue": float(0),
            "paidDate": None,
            "pdfAvailable": bool(getattr(s, "pdf_path", None)),
        })
    return jsonify(payload)


@statements_bp.get("/")
def list_statements_with_slash():
    # Trailing slash variant for convenience/reverse proxy configurations
    return list_statements_no_slash()


@statements_bp.get("/<int:statement_id>")
def get_statement_detail(statement_id: int):
    """
    GET /api/statements/<id>
    Returns JSON for the preview drawer.

    If stored computed fields are missing or stale, recompute them in-memory
    (and persist the refreshed numbers).
    """
    stmt = Statement.query.get(statement_id)
    if not stmt:
        abort(404, description="Statement not found")

    # If the statement might predate new fields, recompute using the service so
    # the JSON always has values the UI expects.
    need_recompute = False
    for key in ("current_beginning_balance", "current_ending_balance", "ytd_beginning_balance", "ytd_ending_balance"):
        if not hasattr(stmt, key):
            need_recompute = True
            break

    # Also treat obviously None values as a signal to recompute
    if not need_recompute:
        for k in ("current_beginning_balance", "current_ending_balance"):
            if getattr(stmt, k, None) is None:
                need_recompute = True
                break

    if need_recompute:
        inv = Investor.query.get(getattr(stmt, "investor_id", None))
        if inv and stmt.period_start and stmt.period_end:
            # This service computes/updates the statement from period balances
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
def get_statement_view_alias(statement_id: int):
    """
    GET /api/statements/<id>/view
    Convenience alias for the frontend "View" action.
    """
    return get_statement_detail(statement_id)


@statements_bp.delete("/<int:statement_id>")
def delete_statement(statement_id: int):
    """
    DELETE /api/statements/<id>
    Removes the statement and (best-effort) deletes the generated PDF file.
    """
    stmt = Statement.query.get(statement_id)
    if not stmt:
        abort(404, description="Statement not found")

    # Best-effort cleanup of the generated PDF
    try:
        if stmt.pdf_path and os.path.isfile(stmt.pdf_path):
            os.remove(stmt.pdf_path)
    except Exception:
        # Do not block delete on filesystem errors
        pass

    db.session.delete(stmt)
    db.session.commit()
    return jsonify({"ok": True})


@statements_bp.post("/generate")
def generate_statement():
    """
    POST /api/statements/generate
    Body: { "investor_id": 123, "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "entity_name": "..." }
    If start/end are omitted, generates for the current quarter.
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
def generate_all_for_quarter():
    """
    POST /api/statements/generate-quarter
    Body: { "year": 2025, "quarter": 1, "entity_name": "..." }
    Generates statements for ALL investors in that quarter.
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
    return jsonify({"ok": True, "created_ids": created, "period": {"start": start.isoformat(), "end": end.isoformat()}})


@statements_bp.get("/<int:statement_id>/pdf")
def download_statement_pdf(statement_id: int):
    """
    GET /api/statements/<id>/pdf
    Always returns a PDF (renders one if missing).
    """
    stmt = Statement.query.get_or_404(statement_id)
    if not stmt.pdf_path:
        pdf_path = ensure_statement_pdf(stmt)
        stmt.pdf_path = pdf_path
        db.session.commit()
    filename = f"{stmt.investor_name}_{stmt.period_end}.pdf" if stmt.period_end else "statement.pdf"
    return send_file(stmt.pdf_path, as_attachment=True, download_name=filename)
