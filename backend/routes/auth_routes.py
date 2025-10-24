# backend/routes/auth_routes.py (merged)
from flask import Blueprint, request, jsonify
from werkzeug.security import check_password_hash
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity, get_jwt
)
from backend.models import User
from backend.extensions import db

auth_bp = Blueprint("auth", __name__)

def _find_user_by_identifier(identifier: str):
    """Try to find a user by email first; if not found and identifier
    doesn't look like an email, try username (if present on the model)."""
    ident = (identifier or "").strip().lower()
    if not ident:
        return None
    # Prefer email
    user = User.query.filter(User.email.ilike(ident)).first()
    if user:
        return user
    # Fall back to username only if identifier is not an email
    if "@" not in ident and hasattr(User, "username"):
        return User.query.filter((User.username.ilike(ident))).first()
    return None


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    identifier = (data.get("email") or data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if not identifier or not password:
        return jsonify({"msg": "Missing credentials"}), 400

    user = _find_user_by_identifier(identifier)
    if not user:
        return jsonify({"msg": "Invalid email/username or password"}), 401

    # Support either 'password_hash' or 'password' as the stored hash column
    hashed = getattr(user, "password_hash", None) or getattr(user, "password", None)
    if not hashed or not check_password_hash(hashed, password):
        return jsonify({"msg": "Invalid email/username or password"}), 401

    identity = str(user.id)

    claims = {
        "email": (user.email or "").lower(),
        "user_type": (user.user_type or "viewer").lower(),
        "full_name": f"{(user.first_name or '').strip()} {(user.last_name or '').strip()}".strip(),
        "permission": user.permission or "Viewer",
    }

    access_token = create_access_token(identity=identity, additional_claims=claims)
    refresh_token = create_refresh_token(identity=identity, additional_claims=claims)

    return jsonify(access_token=access_token, refresh_token=refresh_token), 200


@auth_bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    if not user:
        return jsonify({"msg": "User not found"}), 404

    claims = {
        "email": (user.email or "").lower(),
        "user_type": (user.user_type or "viewer").lower(),
        "full_name": f"{(user.first_name or '').strip()} {(user.last_name or '').strip()}".strip(),
        "permission": user.permission or "Viewer",
    }

    new_access_token = create_access_token(identity=str(user.id), additional_claims=claims)
    return jsonify(access_token=new_access_token), 200


@auth_bp.route("/protected", methods=["GET"])
@jwt_required()
def protected():
    current_user_id = get_jwt_identity()
    claims = get_jwt()
    return jsonify(logged_in_as=current_user_id, claims=claims), 200
