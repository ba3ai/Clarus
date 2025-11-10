from __future__ import annotations

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from sqlalchemy import or_, desc

from backend.extensions import db
from backend.models import Invitation, Investor, Statement


# Add near the top with the other imports
from sqlalchemy.exc import SQLAlchemyError

# Optional snapshot fallback (if your project has it)
try:
    from backend.models_snapshot import InvestorPeriodBalance  # type: ignore
except Exception:  # pragma: no cover
    InvestorPeriodBalance = None

# Mount under /api like the rest of your app
invitations_bp = Blueprint("invitations", __name__, url_prefix="/api")


def _resolve_current_balance(investor_id: int | None, investor_name: str | None):
    """
    Return the most recently RECEIVED balance for an investor.

    Priority:
      1) Latest Statement row by created_at DESC (i.e., newest received) then period_end DESC.
      2) Latest InvestorPeriodBalance row by created_at DESC then period_date DESC (snapshot fallback).

    Returns: (ending_balance or None, source: 'statement'|'snapshot'|'none',
              balance_received_at_iso, balance_as_of_iso)
    """
    # 1) Preferred: Statements by investor_id (newest row in DB wins)
    if investor_id:
        st = (
            Statement.query.filter(Statement.investor_id == investor_id)
            .order_by(
                desc(Statement.created_at).nullslast(),
                desc(Statement.period_end).nullslast(),
            )
            .first()
        )
        if st:
            received_at = getattr(st, "created_at", None)
            as_of = getattr(st, "period_end", None)
            val = float(st.ending_balance) if st.ending_balance is not None else None
            return (
                val,
                "statement",
                received_at.isoformat() if received_at else None,
                as_of.isoformat() if as_of else None,
            )

    # 2) Fallback: Snapshot by investor name (newest row in DB wins)
    if investor_name and InvestorPeriodBalance is not None:
        row = (
            InvestorPeriodBalance.query.filter(InvestorPeriodBalance.investor == investor_name)
            .order_by(
                desc(InvestorPeriodBalance.created_at).nullslast(),
                desc(InvestorPeriodBalance.period_date).nullslast(),
            )
            .first()
        )
        if row:
            received_at = getattr(row, "created_at", None)
            as_of = getattr(row, "period_date", None)
            val = float(row.ending_balance) if row.ending_balance is not None else None
            return (
                val,
                "snapshot",
                received_at.isoformat() if received_at else None,
                as_of.isoformat() if as_of else None,
            )

    return None, "none", None, None


def serialize_invitation(inv: Invitation) -> dict:
    """Serialize an invitation and attach the linked Investor, contact, and current balance."""
    if hasattr(inv, "to_dict"):
        base = inv.to_dict()
    else:
        base = {
            "id": getattr(inv, "id", None),
            "name": getattr(inv, "name", None),
            "email": getattr(inv, "email", None),
            "status": getattr(inv, "status", None),
            "invited_by": getattr(inv, "invited_by", None),
            "created_at": getattr(inv, "created_at", None),
            "used_at": getattr(inv, "used_at", None),
        }

    # Attach linked investor (kept compatible with existing frontend)
    linked = Investor.query.filter_by(invitation_id=inv.id).first()
    investor_payload = None
    if linked:
        if hasattr(linked, "to_dict"):
            investor_payload = linked.to_dict()
        else:
            investor_payload = {
                "id": getattr(linked, "id", None),
                "name": getattr(linked, "name", None),
                "email": getattr(linked, "email", None),
                "company_name": getattr(linked, "company_name", None),
                "address": getattr(linked, "address", None),
                "contact_phone": getattr(linked, "contact_phone", None),
            }

    base["investor"] = investor_payload

    # Compute and attach current balance (no extra route)
    inv_id = getattr(linked, "id", None) if linked else None
    inv_name = getattr(linked, "name", None) if linked else base.get("name")
    current_balance, source, received_at, as_of = _resolve_current_balance(inv_id, inv_name)

    base["current_balance"] = current_balance
    base["balance_source"] = source
    base["balance_received_at"] = received_at  # when DB received this row
    base["balance_as_of"] = as_of              # financial period end/date

    return base


# Preflight for fetch/axios
@invitations_bp.route("/invitations", methods=["OPTIONS"], strict_slashes=False)
def invitations_options():
    return ("", 204)


@invitations_bp.route("/invitations", methods=["GET"], strict_slashes=False)
@login_required
def list_invitations():
    # Example role gating if needed:
    # if str(getattr(current_user, "user_type", "")).lower() != "admin":
    #     return jsonify({"error": "Forbidden"}), 403

    status = (request.args.get("status") or "").strip().lower()
    q = (request.args.get("q") or "").strip()

    page = max(int(request.args.get("page", 1) or 1), 1)
    per_page = min(max(int(request.args.get("per_page", 25) or 25), 1), 200)

    sort = (request.args.get("sort") or "used_at").strip()
    order = (request.args.get("order") or "desc").strip().lower()

    query = Invitation.query
    if status:
        query = query.filter(Invitation.status.ilike(status))
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                Invitation.name.ilike(like),
                Invitation.email.ilike(like),
                Invitation.invited_by.cast(db.String).ilike(like),
            )
        )

    order_col = Invitation.created_at if sort == "created_at" else Invitation.used_at
    query = query.order_by(
        (order_col.asc().nullslast() if order == "asc" else order_col.desc().nullslast()),
        Invitation.created_at.desc(),
    )

    paginated = query.paginate(page=page, per_page=per_page, error_out=False)

    # Serialize invitations + linked investor + current balance
    items = [serialize_invitation(inv) for inv in paginated.items]

    return (
        jsonify(
            {
                "items": items,
                "page": page,
                "per_page": per_page,
                "total": paginated.total,
                "sort": "created_at" if order_col is Invitation.created_at else "used_at",
                "order": order,
                "status_filter": status,
                "q": q,
            }
        ),
        200,
    )



# ...

@invitations_bp.route("/investors/<int:investor_id>", methods=["PUT"], strict_slashes=False)
@login_required
def update_investor(investor_id: int):
    """
    Update basic investor fields and (optionally) assign exactly ONE dependent
    when investor_type is 'Depends'.
    Body JSON:
      - name (str)
      - email (str)
      - investor_type (str: 'IRA'|'ROTH IRA'|'Retirement'|'Depends')
      - depends_on_ids (list[int])  # we will accept 0 or 1 item only
    """
    inv = Investor.query.get(investor_id)
    if not inv:
        return jsonify({"error": "Investor not found"}), 404

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip()
    investor_type = (data.get("investor_type") or inv.investor_type or "IRA").strip()

    if name:
        inv.name = name
    if email:
        inv.email = email
    inv.investor_type = investor_type

    # Handle single dependent when this investor "Depends"
    # Frontend sends depends_on_ids: [] or [child_id]
    depends_ids = data.get("depends_on_ids") or []
    # keep only one item if multiple were sent
    depends_ids = [i for i in depends_ids if i is not None][:1]

    try:
        if investor_type.lower() == "depends":
            # attach exactly one dependent if provided
            keep_id = depends_ids[0] if depends_ids else None

            # detach all current dependents except the one we're keeping
            for child in list(inv.dependents or []):
                if keep_id is None or child.id != keep_id:
                    child.parent_investor_id = None

            # attach the new child (if any)
            if keep_id is not None:
                if keep_id == inv.id:
                    return jsonify({"error": "An investor cannot depend on itself."}), 400
                child = Investor.query.get(keep_id)
                if not child:
                    return jsonify({"error": "Selected dependent investor not found."}), 404
                child.parent_investor_id = inv.id
        else:
            # if type changed away from Depends, remove all dependents
            for child in list(inv.dependents or []):
                child.parent_investor_id = None

        db.session.commit()
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({"error": "Database error", "details": str(e)}), 500

    # Return a compact payload that matches what your UI expects
    payload = inv.to_dict() if hasattr(inv, "to_dict") else {
        "id": inv.id,
        "name": inv.name,
        "email": inv.email,
        "investor_type": inv.investor_type,
        "parent_investor_id": inv.parent_investor_id,
        "dependents": [d.id for d in (inv.dependents or [])],
    }
    return jsonify(payload), 200


@invitations_bp.route("/investors/<int:investor_id>", methods=["DELETE"], strict_slashes=False)
@login_required
def delete_investor(investor_id: int):
    inv = Investor.query.get(investor_id)
    if not inv:
        return jsonify({"error": "Investor not found"}), 404
    try:
        # detach children first to avoid FK issues
        for child in list(inv.dependents or []):
            child.parent_investor_id = None
        db.session.delete(inv)
        db.session.commit()
        return jsonify({"ok": True}), 200
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({"error": "Database error", "details": str(e)}), 500
