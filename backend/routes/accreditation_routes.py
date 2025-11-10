# backend/routes/accreditation_routes.py
from flask import Blueprint, request, jsonify
from flask_login import current_user, login_required
from backend.extensions import db
from backend.models import Investor, InvestorAccreditation, User

accreditation_bp = Blueprint("accreditation", __name__)

def _resolve_investor_for_request() -> Investor | None:
    """
    Resolve which investor this request is acting on.
    Admins may target ?investor_id=..., otherwise use the logged-in user's investor.
    """
    # Admin override
    inv_id = request.args.get("investor_id") or (request.get_json(silent=True) or {}).get("investor_id")
    if inv_id and getattr(current_user, "is_authenticated", False):
        try:
            u: User = current_user  # type: ignore
            if str(getattr(u, "user_type", "")).lower() == "admin":
                return Investor.query.get(int(inv_id))
        except Exception:
            pass

    if not getattr(current_user, "is_authenticated", False):
        return None

    # 1) Preferred link: account_user_id
    inv = Investor.query.filter_by(account_user_id=current_user.id).first()
    if inv:
        return inv
    # 2) Legacy link: owner_id
    inv = Investor.query.filter_by(owner_id=current_user.id).first()
    if inv:
        return inv
    # 3) Soft fallback: match by email if present
    if getattr(current_user, "email", None):
        inv = Investor.query.filter_by(email=current_user.email).first()
        if inv:
            return inv
    return None


# Preflight so the browser will actually send the POST
@accreditation_bp.route("/accreditation", methods=["OPTIONS"], strict_slashes=False)
def _accreditation_options():
    return ("", 204)


@accreditation_bp.route("/accreditation", methods=["GET"], strict_slashes=False)
@login_required
def get_accreditation():
    inv = _resolve_investor_for_request()
    if not inv:
        return jsonify(error="Investor not found"), 404

    row = InvestorAccreditation.query.filter_by(investor_id=inv.id).first()
    if not row:
        # No record yet — return empty but 200 so the UI stays calm
        return jsonify(selection=None, accredited=False), 200

    return jsonify(
        investor_id=inv.id,
        selection=row.selection,
        accredited=bool(row.accredited),
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
    ), 200


@accreditation_bp.route("/accreditation", methods=["POST"], strict_slashes=False)
@login_required
def set_accreditation():
    inv = _resolve_investor_for_request()
    if not inv:
        return jsonify(error="Investor not found"), 404

    data = request.get_json(silent=True) or {}
    selection = (data.get("selection") or "").strip()
    accredited = bool(data.get("accredited"))

    if not selection:
        return jsonify(error="selection is required"), 400

    row = InvestorAccreditation.query.filter_by(investor_id=inv.id).first()
    if row:
        row.selection = selection
        row.accredited = accredited
    else:
        row = InvestorAccreditation(investor_id=inv.id, selection=selection, accredited=accredited)
        db.session.add(row)

    db.session.commit()
    return jsonify(
        ok=True,
        investor_id=inv.id,
        selection=row.selection,
        accredited=bool(row.accredited),
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
    ), 200
