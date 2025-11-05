# backend/routes/manual_entry_routes.py
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from backend.extensions import db
from backend.models import Investor  # <-- use Investor directly
from flask_login import login_required

manual_entry_bp = Blueprint("manual_entry", __name__, url_prefix="/manual")

def _compose_address(address1, address2, country, city, state, zip_code):
    parts = []
    if address1: parts.append(address1)
    if address2: parts.append(address2)
    locality = ", ".join([p for p in [city, state] if p])
    tail = " ".join([p for p in [locality, zip_code] if p]).strip()
    if country:
        tail = (tail + (", " if tail else "") + country).strip(", ")
    if tail: parts.append(tail)
    return ", ".join([p for p in parts if p])

@manual_entry_bp.post("/manual_entry")
@login_required
def save_manual_entry():
    """
    Create a new Investor from the NEW manual entry form:
      - first_name, last_name, birthdate, citizenship, email, phone (maps to contact_phone)
      - ssn (maps to ssn_tax_id)
      - address1, address2, country, city, state, zip
    owner_id is taken from the current JWT user (admin) unless overridden by payload.owner_id.
    """
    data = request.get_json(silent=True) or {}

    # Required from form
    first_name = (data.get("first_name") or "").strip()
    last_name  = (data.get("last_name") or "").strip()
    email      = (data.get("email") or "").strip()
    if not first_name or not last_name or not email:
        return jsonify({"msg": "First name, last name, and email are required"}), 400

    # Optional
    birthdate   = (data.get("birthdate") or "").strip()
    citizenship = (data.get("citizenship") or "").strip()
    phone       = (data.get("phone") or "").strip()
    ssn         = (data.get("ssn") or "").strip()

    address1 = (data.get("address1") or "").strip()
    address2 = (data.get("address2") or "").strip()
    country  = (data.get("country") or "").strip()
    city     = (data.get("city") or "").strip()
    state    = (data.get("state") or "").strip()
    zip_code = (data.get("zip") or "").strip()

    full_name = f"{first_name} {last_name}".strip()
    composed_address = _compose_address(address1, address2, country, city, state, zip_code)

    # Owner (required by schema). Default to current JWT user.
    owner_id = data.get("owner_id")
    try:
        owner_id = int(owner_id) if owner_id is not None else int(get_jwt_identity())
    except Exception:
        owner_id = int(get_jwt_identity())

    inv = Investor(
        name=full_name,
        owner_id=owner_id,                      # <-- NOT NULL; must be set
        email=email,
        contact_phone=phone,
        # legacy single-line address for compatibility
        address=composed_address,

        # granular fields
        address1=address1 or None,
        address2=address2 or None,
        country=country or None,
        city=city or None,
        state=state or None,
        zip=zip_code or None,

        # personal fields
        birthdate=birthdate or None,
        citizenship=citizenship or None,
        ssn_tax_id=ssn or None,
    )

    db.session.add(inv)
    db.session.commit()

    return jsonify({"msg": "Investor created", "id": inv.id}), 201


@manual_entry_bp.get("/manual_entry")
@login_required
def list_manual_entries():
    """
    Return latest manual-created investors for the current owner/admin.
    You can adjust filters as needed.
    """
    current_uid = int(get_jwt_identity())
    q = Investor.query.filter_by(owner_id=current_uid).order_by(Investor.id.desc())
    rows = q.limit(200).all()
    data = [
        {
            "id": r.id,
            "name": r.name,
            "email": r.email,
            "contact_phone": r.contact_phone,
            "country": r.country,
            "city": r.city,
            "state": r.state,
            "zip": r.zip,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return jsonify(data), 200
