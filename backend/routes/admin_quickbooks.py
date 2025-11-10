# backend/routes/admin_quickbooks.py

from flask import Blueprint, request, jsonify
from backend.extensions import db
from backend.models import AdminSettings
from flask_jwt_extended import jwt_required, get_jwt_identity
from flask_login import login_required

admin_qb_bp = Blueprint("admin_qb", __name__, url_prefix="/api/admin")  # ✅ ADD this prefix here

@admin_qb_bp.route("/quickbooks-api", methods=["POST"])
@admin_qb_bp.route("/quickbooks-api", methods=["GET"])
@admin_qb_bp.route("/quickbooks/customers", methods=["GET"])


# ---------------- Save QuickBooks API ----------------
@admin_qb_bp.route("/api/admin/quickbooks-api", methods=["POST"])
@login_required
def save_quickbooks_api():
    data = request.get_json()
    api = data.get("api")

    if not api:
        return jsonify({"msg": "QuickBooks API is required"}), 400

    user_id = get_jwt_identity()

    setting = AdminSettings.query.filter_by(admin_id=user_id).first()
    if not setting:
        setting = AdminSettings(admin_id=user_id, quickbooks_api=api)
        db.session.add(setting)
    else:
        setting.quickbooks_api = api

    db.session.commit()
    return jsonify({"msg": "QuickBooks API saved successfully."}), 200


# ---------------- Get QuickBooks API ----------------
@admin_qb_bp.route("/api/admin/quickbooks-api", methods=["GET"])
@login_required
def get_quickbooks_api():
    user_id = get_jwt_identity()
    setting = AdminSettings.query.filter_by(admin_id=user_id).first()

    if not setting or not setting.quickbooks_api:
        return jsonify({"msg": "No QuickBooks API saved."}), 404

    return jsonify({"api": setting.quickbooks_api}), 200


# ---------------- Mock Customer Data (Simulate Intuit Response Format) ----------------
@admin_qb_bp.route("/api/admin/quickbooks/customers", methods=["GET"])
@login_required
def get_quickbooks_customers():
    mock_customers = [
        {
            "Id": "CUST-001",
            "DisplayName": "John Smith",
            "PrimaryEmailAddr": {"Address": "john@example.com"},
            "PrimaryPhone": {"FreeFormNumber": "123-456-7890"},
            "Balance": 250.75
        },
        {
            "Id": "CUST-002",
            "DisplayName": "Acme Inc.",
            "PrimaryEmailAddr": {"Address": "support@acme.com"},
            "PrimaryPhone": {"FreeFormNumber": "987-654-3210"},
            "Balance": 1200.00
        }
    ]

    return jsonify({
        "QueryResponse": {
            "Customer": mock_customers
        }
    }), 200
