# backend/routes/profile_routes.py
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from backend.models import User
from backend.extensions import db
import os, uuid

profile_bp = Blueprint("profile", __name__)

@profile_bp.get("/auth/me")
@jwt_required()
def me():
  uid = int(get_jwt_identity())
  u = User.query.get(uid)
  if not u:
    return jsonify({"msg":"User not found"}), 404
  profile = {
    "first_name": u.first_name, "last_name": u.last_name,
    "email": u.email, "phone": u.phone, "address1": u.address or "",
    # add other fields if you store them elsewhere
    "avatar_url": getattr(u, "avatar_url", None)
  }
  return jsonify({"user": {
      "first_name": u.first_name, "last_name": u.last_name,
      "email": u.email, "phone": u.phone, "address": u.address,
      "avatar_url": getattr(u, "avatar_url", None)
  }, "profile": profile})

@profile_bp.put("/auth/profile")
@jwt_required()
def update_profile():
  uid = int(get_jwt_identity())
  u = User.query.get(uid)
  if not u:
    return jsonify({"msg":"User not found"}), 404
  data = request.get_json(silent=True) or {}
  # Map fields you actually persist
  u.first_name = data.get("first_name") or u.first_name
  u.last_name  = data.get("last_name") or u.last_name
  u.email      = data.get("email") or u.email
  u.phone      = data.get("phone") or u.phone
  u.address    = data.get("address1") or u.address
  db.session.commit()
  return jsonify({"ok": True})

@profile_bp.put("/auth/profile/avatar")
@jwt_required()
def update_avatar():
  uid = int(get_jwt_identity())
  u = User.query.get(uid)
  if not u:
    return jsonify({"msg":"User not found"}), 404

  if request.form.get("remove_avatar") == "1":
    # delete file if you stored it; then clear u.avatar_url
    if hasattr(u, "avatar_url"): u.avatar_url = None
    db.session.commit()
    return jsonify({"ok": True, "avatar_url": None})

  f = request.files.get("avatar")
  if not f:
    return jsonify({"msg": "No file uploaded"}), 400

  upload_dir = os.path.join(current_app.root_path, "uploads", "avatars")
  os.makedirs(upload_dir, exist_ok=True)
  fname = f"{uuid.uuid4().hex}_{f.filename}"
  path = os.path.join(upload_dir, fname)
  f.save(path)

  # Expose via /static or a send_from_directory route
  public_url = f"/uploads/avatars/{fname}"
  if hasattr(u, "avatar_url"): u.avatar_url = public_url
  db.session.commit()
  return jsonify({"ok": True, "avatar_url": public_url})
