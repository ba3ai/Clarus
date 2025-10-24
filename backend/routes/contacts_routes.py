# contacts_routes.py
from flask import Blueprint, request, jsonify
from sqlalchemy import or_
from backend.extensions import db
from backend.models import Investor, InvestorContact

contacts_bp = Blueprint("contacts_bp", __name__, url_prefix="/api/contacts")

def _contact_to_dict(c: InvestorContact):
    return c.to_dict()

@contacts_bp.route("/<int:investor_id>", methods=["GET"])
def list_contacts(investor_id):
    """
    GET /api/contacts/<investor_id>?q=&page=1&page_size=50
    Returns a paginated, optionally searched list of contacts for an investor.
    """
    q = (request.args.get("q") or "").strip()
    page = max(int(request.args.get("page", 1) or 1), 1)
    page_size = min(max(int(request.args.get("page_size", 50) or 50), 1), 200)

    query = InvestorContact.query.filter_by(investor_id=investor_id)
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                InvestorContact.name.ilike(like),
                InvestorContact.email.ilike(like),
                InvestorContact.phone.ilike(like),
                InvestorContact.notes.ilike(like),
            )
        )

    total = query.count()
    rows = (
        query.order_by(InvestorContact.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return jsonify(
        {
            "success": True,
            "data": [_contact_to_dict(c) for c in rows],
            "page": page,
            "page_size": page_size,
            "total": total,
        }
    ), 200


@contacts_bp.route("/<int:investor_id>", methods=["POST"])
def create_contact(investor_id):
    """
    POST /api/contacts/<investor_id>
    JSON: { "name": "...", "email": "...", "phone": "...", "notes": "..." }
    """
    payload = request.get_json(force=True) or {}
    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip()
    phone = (payload.get("phone") or "").strip() or None
    notes = (payload.get("notes") or "").strip() or None

    if not name or not email:
        return jsonify({"success": False, "error": "Name and email are required."}), 400

    investor = Investor.query.get(investor_id)
    if not investor:
        return jsonify({"success": False, "error": "Investor not found."}), 404

    # enforce unique (investor_id, email)
    existing = InvestorContact.query.filter_by(investor_id=investor_id, email=email).first()
    if existing:
        return jsonify({"success": False, "error": "A contact with this email already exists for the investor."}), 409

    c = InvestorContact(
        investor_id=investor_id,
        name=name,
        email=email,
        phone=phone,
        notes=notes,
    )
    db.session.add(c)
    db.session.commit()

    return jsonify({"success": True, "data": _contact_to_dict(c)}), 201


@contacts_bp.route("/item/<int:contact_id>", methods=["PUT", "PATCH"])
def update_contact(contact_id):
    """
    PUT/PATCH /api/contacts/item/<contact_id>
    JSON: any subset of { name, email, phone, notes }
    """
    c = InvestorContact.query.get(contact_id)
    if not c:
        return jsonify({"success": False, "error": "Contact not found."}), 404

    payload = request.get_json(force=True) or {}
    name = payload.get("name")
    email = payload.get("email")
    phone = payload.get("phone")
    notes = payload.get("notes")

    if name is not None:
        c.name = name.strip()
    if email is not None:
        new_email = email.strip()
        # check uniqueness within same investor
        dup = (
            InvestorContact.query.filter(
                InvestorContact.investor_id == c.investor_id,
                InvestorContact.email == new_email,
                InvestorContact.id != c.id,
            ).first()
        )
        if dup:
            return jsonify({"success": False, "error": "Another contact with this email exists for the investor."}), 409
        c.email = new_email
    if phone is not None:
        c.phone = (phone or "").strip() or None
    if notes is not None:
        c.notes = (notes or "").strip() or None

    db.session.commit()
    return jsonify({"success": True, "data": _contact_to_dict(c)}), 200


@contacts_bp.route("/item/<int:contact_id>", methods=["DELETE"])
def delete_contact(contact_id):
    """
    DELETE /api/contacts/item/<contact_id>
    """
    c = InvestorContact.query.get(contact_id)
    if not c:
        return jsonify({"success": False, "error": "Contact not found."}), 404

    db.session.delete(c)
    db.session.commit()
    return jsonify({"success": True}), 204
