# backend/routes/profile_routes.py
from __future__ import annotations

import os, uuid
from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from backend.extensions import db
from backend.models import User, Investor  # <-- ensure Investor is imported

profile_bp = Blueprint("profile", __name__, url_prefix="/api")

def _json_user(u: User) -> dict:
    return {
        "id": u.id,
        "first_name": u.first_name,
        "last_name": u.last_name,
        "email": u.email,
        "phone": getattr(u, "phone", None),
        "address": getattr(u, "address", None),
        "avatar_url": getattr(u, "avatar_url", None),
    }

@profile_bp.route("/auth/me", methods=["GET"], strict_slashes=False)
@login_required
def me():
    u = User.query.get(int(current_user.id))
    if not u:
        return jsonify({"msg": "User not found"}), 404

    inv = Investor.query.filter_by(account_user_id=u.id).first()

    profile = {
        # core (from User)
        "first_name": u.first_name,
        "last_name":  u.last_name,
        "email":      u.email,
        "phone":      getattr(u, "phone", None),

        # extended (from Investor if available)
        "birthdate":          getattr(inv, "birthdate", "") or "",
        "citizenship":        getattr(inv, "citizenship", "") or "",
        "ssn":                getattr(inv, "ssn_tax_id", "") or "",
        "emergency_contact":  getattr(inv, "emergency_contact", "") or "",

        # address (split fields kept on Investor; User.address used as fallback for address1)
        "address1": getattr(inv, "address1", "") or (getattr(u, "address", "") or ""),
        "address2": getattr(inv, "address2", "") or "",
        "country":  getattr(inv, "country", "") or "",
        "city":     getattr(inv, "city", "") or "",
        "state":    getattr(inv, "state", "") or "",
        "zip":      getattr(inv, "zip", "") or "",

        "avatar_url": getattr(u, "avatar_url", None),
    }
    return jsonify({"user": _json_user(u), "profile": profile}), 200

@profile_bp.route("/auth/profile", methods=["OPTIONS"], strict_slashes=False)
def _profile_options():
    return ("", 204)

@profile_bp.route("/auth/profile", methods=["PUT"], strict_slashes=False)
@login_required
def update_profile():
    u = User.query.get(int(current_user.id))
    if not u:
        return jsonify({"msg": "User not found"}), 404

    inv = Investor.query.filter_by(account_user_id=u.id).first()
    if not inv:
        inv = Investor(account_user_id=u.id, name=f"{u.first_name} {u.last_name}".strip() or u.email)
        db.session.add(inv)

    data = request.get_json(silent=True) or {}

    # Update User basics
    u.first_name = data.get("first_name") or u.first_name
    u.last_name  = data.get("last_name")  or u.last_name
    u.email      = data.get("email")      or u.email
    if "phone" in data:
        u.phone = data.get("phone")

    # Update Investor extended fields
    inv.birthdate         = data.get("birthdate")         or inv.birthdate
    inv.citizenship       = data.get("citizenship")       or inv.citizenship
    inv.ssn_tax_id        = data.get("ssn")               or inv.ssn_tax_id
    inv.emergency_contact = data.get("emergency_contact") or inv.emergency_contact

    inv.address1 = data.get("address1") or inv.address1
    inv.address2 = data.get("address2") or inv.address2
    inv.country  = data.get("country")  or inv.country
    inv.city     = data.get("city")     or inv.city
    inv.state    = data.get("state")    or inv.state
    inv.zip      = data.get("zip")      or inv.zip

    # Keep User.address as a simple mirror of address1 for legacy code
    if "address1" in data:
        u.address = data.get("address1") or u.address

    db.session.commit()
    return jsonify({"ok": True}), 200

@profile_bp.route("/auth/profile/avatar", methods=["OPTIONS"], strict_slashes=False)
def _avatar_options():
    return ("", 204)

@profile_bp.route("/auth/profile/avatar", methods=["PUT"], strict_slashes=False)
@login_required
def update_avatar():
    u = User.query.get(int(current_user.id))
    if not u:
        return jsonify({"msg": "User not found"}), 404

    if request.form.get("remove_avatar") == "1":
        if hasattr(u, "avatar_url"):
            u.avatar_url = None
        db.session.commit()
        return jsonify({"ok": True, "avatar_url": None}), 200

    f = request.files.get("avatar")
    if not f:
        return jsonify({"msg": "No file uploaded"}), 400

    upload_dir = os.path.join(current_app.root_path, "uploads", "avatars")
    os.makedirs(upload_dir, exist_ok=True)

    fname = f"{uuid.uuid4().hex}_{f.filename}"
    path = os.path.join(upload_dir, fname)
    f.save(path)

    public_url = f"/uploads/avatars/{fname}"
    if hasattr(u, "avatar_url"):
        u.avatar_url = public_url

    db.session.commit()
    return jsonify({"ok": True, "avatar_url": public_url}), 200
