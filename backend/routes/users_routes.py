from flask import Blueprint, request, jsonify
from sqlalchemy import func
from backend.models import User  # make sure this import path matches your project

users_bp = Blueprint("users_api", __name__, url_prefix="/api/users")

@users_bp.get("")
def list_users():
    """
    GET /api/users?type=<all|investor|admin|group-admin>
    Returns a JSON list of users for the Overview page.
    """
    filter_type = (request.args.get("type") or "all").strip().lower()
    q = User.query

    if filter_type != "all":
        # normalize "group admin" / "group-admin" / "groupadmin"
        if filter_type.replace("-", "").replace(" ", "") == "groupadmin":
            match = "group admin"
        else:
            match = filter_type
        q = q.filter(func.lower(User.user_type) == match)

    rows = (
        q.order_by(User.id.desc())
        .limit(1000)  # avoid dumping a huge table
        .all()
    )

    def _row(u: User):
        return {
            "id": u.id,
            "name": f"{u.first_name} {u.last_name}".strip(),
            "email": u.email,
            "user_type": u.user_type,
            "organization": u.organization_name,
            "status": u.status,
            "permission": u.permission,
        }

    data = [_row(u) for u in rows]
    return jsonify({"items": data, "count": len(data)})
