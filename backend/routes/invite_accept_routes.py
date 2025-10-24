# backend/routes/invite_accept_routes.py
from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash
from datetime import datetime

from backend.extensions import db
from backend.models import Invitation, User, Investor

invite_accept_bp = Blueprint("invite_accept", __name__, url_prefix="/admin")

def _split_name(full: str):
    full = (full or "").strip()
    if not full:
        return "", ""
    parts = full.split()
    if len(parts) == 1:
        return parts[0], ""
    return " ".join(parts[:-1]), parts[-1]

@invite_accept_bp.get("/invite/<token>")
def get_invite(token):
    inv = Invitation.query.filter_by(token=token).first()
    if not inv or inv.status not in ("pending",) or (inv.expires_at and inv.expires_at < datetime.utcnow()):
        return jsonify({"msg": "Invalid or expired link"}), 400

    # return what the AcceptInvite page needs to prefill
    return jsonify({
        "email": inv.email,
        "name": inv.name,
        "token": inv.token,
        # if you later add Invitation.user_type, include it here
        "user_type": getattr(inv, "user_type", "investor"),
    }), 200


@invite_accept_bp.post("/invite/<token>")
def accept_invite(token):
    """
    Accepts the enriched Personal Information + Residential Address payload
    coming from the new AcceptInvite form and creates:
      - a User (login account)
      - an Investor row linked to the invitation
    NOTE: birthdate / citizenship / ssn are accepted but not persisted
          because the current schema does not include those columns.
    """
    inv = Invitation.query.filter_by(token=token).first()
    if not inv or inv.status not in ("pending",):
        return jsonify({"msg": "Invalid or expired link"}), 400

    data = request.get_json(silent=True) or {}

    # Personal Information (required)
    first_name = (data.get("first_name") or "").strip()
    last_name  = (data.get("last_name") or "").strip()
    full_name  = (first_name + " " + last_name).strip() or (inv.name or "").strip()

    # Optional details we accept (but do not store without schema support)
    birthdate   = (data.get("birthdate") or "").strip()
    citizenship = (data.get("citizenship") or "").strip()
    ssn_tax_id  = (data.get("ssn") or "").strip()

    # Contact / login
    email    = (data.get("email") or inv.email or "").strip().lower()
    phone    = (data.get("phone") or "").strip()
    password = (data.get("password") or "").strip()

    # Residential Address (compose into a single address field)
    address1 = (data.get("address1") or "").strip()
    address2 = (data.get("address2") or "").strip()
    country  = (data.get("country") or "").strip()
    city     = (data.get("city") or "").strip()
    state    = (data.get("state") or "").strip()
    zip_code = (data.get("zip") or "").strip()

    # Basic validation
    if not email or not password or not first_name or not last_name:
        return jsonify({"msg": "First/Last name, email and password are required"}), 400

    # Prevent duplicate account
    if User.query.filter((User.email == email) | (User.username == email)).first():
        return jsonify({"msg": "An account already exists for this email"}), 409

    # Compose a single address string to fit current schema
    lines = [address1]
    if address2: lines.append(address2)
    locality = ", ".join([p for p in [city, state] if p])
    endline  = " ".join([p for p in [locality, zip_code] if p]).strip()
    if country: endline = (endline + (", " if endline else "") + country).strip(", ")
    if endline: lines.append(endline)
    composed_address = ", ".join([l for l in lines if l])

    # Create User
    user = User(
        first_name = first_name or (inv.name or "").strip(),
        last_name  = last_name or "",
        email      = email,
        username   = email,                 # keep username synced with email
        password   = generate_password_hash(password),
        user_type  = "investor",            # lower-case for consistency with your guards
        address    = composed_address or None,
        phone      = phone or None,
        status     = "Active",
        permission = "Viewer",
    )
    db.session.add(user)
    db.session.flush()  # get user.id

    # Create/attach Investor
    investor = Investor.query.filter_by(invitation_id=inv.id).first()
    if not investor:
        investor = Investor(
            name = full_name or email,
            owner_id = inv.invited_by or user.id,
            invitation_id = inv.id,
        )
        db.session.add(investor)

    investor.name          = full_name or investor.name
    investor.address       = composed_address or investor.address
    investor.contact_phone = phone or investor.contact_phone
    investor.email         = email
    investor.account_user_id = user.id

    # NEW: persist the extra fields
    investor.birthdate   = birthdate or investor.birthdate
    investor.citizenship = citizenship or investor.citizenship
    investor.ssn_tax_id  = ssn_tax_id or investor.ssn_tax_id

    investor.address1 = address1 or investor.address1
    investor.address2 = address2 or investor.address2
    investor.country  = country  or investor.country
    investor.city     = city     or investor.city
    investor.state    = state    or investor.state
    investor.zip      = zip_code or investor.zip

    # Mark invite used
    inv.status = "accepted"
    inv.used_at = datetime.utcnow()

    db.session.commit()

    # We include non-persisted fields just to echo back if you need to display a confirmation
    return jsonify({
        "msg": "Account created",
        "user_id": user.id,
        "investor": investor.to_dict(),
        "received_extras": {
            "birthdate": birthdate,
            "citizenship": citizenship,
            "ssn": "***" if ssn_tax_id else "",
        }
    }), 201
