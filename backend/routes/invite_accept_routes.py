# backend/routes/invite_accept_routes.py — updated for XSRF + login_required + emergency_contact
from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash
from datetime import datetime
from flask_login import login_required, current_user

from backend.extensions import db
from backend.models import Invitation, User, Investor

invite_accept_bp = Blueprint("invite_accept", __name__, url_prefix="/admin")

# NOTE ON XSRF/CSRF:
# This blueprint relies on app-wide CSRFProtect (e.g., CSRFProtect(app))
# which validates the XSRF-TOKEN cookie against the X-XSRF-TOKEN header
# for unsafe methods (POST/PUT/PATCH/DELETE). No JWT usage remains.


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

    # return what AcceptInvite needs to prefill
    return jsonify({
        "email": inv.email,
        "name": inv.name,
        "token": inv.token,
        # include user_type if present on model
        "user_type": getattr(inv, "user_type", "investor"),
    }), 200


@invite_accept_bp.post("/invite/<token>")
def accept_invite(token):
    """
    Accepts the Personal Information + Residential Address payload
    and creates/links the User & Investor records.
    Now stores `emergency_contact` as well.
    """
    inv = Invitation.query.filter_by(token=token).first()
    if not inv or inv.status not in ("pending",):
        return jsonify({"msg": "Invalid or expired link"}), 400

    data = request.get_json(silent=True) or {}

    # Personal Information (required)
    first_name = (data.get("first_name") or "").strip()
    last_name  = (data.get("last_name") or "").strip()
    full_name  = (first_name + " " + last_name).strip() or (inv.name or "").strip()

    # Optional details that we persist if provided
    birthdate          = (data.get("birthdate") or "").strip()
    citizenship        = (data.get("citizenship") or "").strip()
    ssn_tax_id         = (data.get("ssn") or "").strip()
    emergency_contact  = (data.get("emergency_contact") or "").strip()  # <-- NEW

    # Contact / login
    email    = (data.get("email") or inv.email or "").strip().lower()
    phone    = (data.get("phone") or "").strip()
    password = (data.get("password") or "").strip()

    # Residential Address
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

    # Compose single address string to fit current schema
    lines = [address1]
    if address2:
        lines.append(address2)
    locality = ", ".join([p for p in [city, state] if p])
    endline  = " ".join([p for p in [locality, zip_code] if p]).strip()
    if country:
        endline = (endline + (", " if endline else "") + country).strip(", ")
    if endline:
        lines.append(endline)
    composed_address = ", ".join([l for l in lines if l])

    # Create User (cookie-session login system; password hashed)
    user = User(
        first_name = first_name or (inv.name or "").strip(),
        last_name  = last_name or "",
        email      = email,
        username   = email,
        password   = generate_password_hash(password),
        user_type  = "investor",
        address    = composed_address or None,
        phone      = phone or None,
        status     = "Active",
        permission = "Viewer",
    )
    db.session.add(user)
    db.session.flush()

    # Create/attach Investor
    investor = Investor.query.filter_by(invitation_id=inv.id).first()
    if not investor:
        investor = Investor(
            name = full_name or email,
            owner_id = inv.invited_by or user.id,
            invitation_id = inv.id,
        )
        db.session.add(investor)

    investor.name            = full_name or investor.name
    investor.address         = composed_address or investor.address
    investor.contact_phone   = phone or investor.contact_phone
    investor.email           = email
    investor.account_user_id = user.id

    # Persist extra fields (includes NEW emergency_contact)
    investor.birthdate         = birthdate or investor.birthdate
    investor.citizenship       = citizenship or investor.citizenship
    investor.ssn_tax_id        = ssn_tax_id or investor.ssn_tax_id
    investor.emergency_contact = emergency_contact or investor.emergency_contact

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

    # Echo back (mask SSN)
    return jsonify({
        "msg": "Account created",
        "user_id": user.id,
        "investor": investor.to_dict(),
        "received_extras": {
            "birthdate": birthdate,
            "citizenship": citizenship,
            "ssn": "***" if ssn_tax_id else "",
            "emergency_contact": emergency_contact,
        },
    }), 201
