# backend/routes/invitations_routes.py
from flask import Blueprint, request, jsonify
from sqlalchemy import or_

from backend.extensions import db
from backend.models import Invitation, Investor  # ⬅ add Investor
# Existing blueprint:
invitations_bp = Blueprint("invitations", __name__)

def serialize_invitation(inv):
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
    # ✨ attach linked investor (if exists)
    linked = Investor.query.filter_by(invitation_id=inv.id).first()
    base["investor"] = linked.to_dict() if linked else None
    return base

@invitations_bp.get("/invitations")
def list_invitations():
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
        Invitation.created_at.desc()
    )

    paginated = query.paginate(page=page, per_page=per_page, error_out=False)
    items = [serialize_invitation(inv) for inv in paginated.items]

    return jsonify({
        "items": items,
        "page": page,
        "per_page": per_page,
        "total": paginated.total,
        "sort": "created_at" if order_col is Invitation.created_at else "used_at",
        "order": order,
        "status_filter": status,
        "q": q,
    })
