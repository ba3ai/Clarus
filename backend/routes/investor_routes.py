# routes/investor_routes.py
from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from backend.models import Record, User
from backend.extensions import db
from flask_login import login_required
import pandas as pd

investor_bp = Blueprint('investor', __name__)

@investor_bp.route('/dashboard', methods=['GET'])
@login_required
def get_dashboard():
    user_id = get_jwt_identity()  # This is just the user ID (str)
    claims = get_jwt()  # This contains user_type, email, etc.

    user_type = claims.get("user_type", "").lower()
    if user_type != "investor":
        return jsonify({"msg": "Unauthorized"}), 403

    user = User.query.get(user_id)
    if not user:
        return jsonify({"msg": "User not found"}), 404

    records = Record.query.filter_by(investor_id=user.id).all()
    investment = sum(r.amount for r in records if r.type == 'investment')
    expense = sum(r.amount for r in records if r.type == 'expense')
    profit = sum(r.amount for r in records if r.type == 'profit')
    balance = investment + profit - expense

    return jsonify({
        "investment": investment,
        "expense": expense,
        "profit": profit,
        "balance": balance,
        "investmentStartDate": None,
        "investmentType": None,
        "bankName": user.bank,
        "status": user.status
    }), 200


from sqlalchemy import text
from backend.excel_db import excel_engine

EXCEL_FILE_PATH = "uploads/Elpis_-_CAS_v.08_-_2025_Q1_PCAP_1.xlsm"
TARGET_SHEET = "bcas_q4_adj"  # adjust to match your sheet/tab name

@investor_bp.route("/dashboard/q4_report", methods=["GET"])
@login_required
def investor_q4_report():
    try:
        user_id = get_jwt_identity()

        # Fake lookup of user name for now (replace with real DB lookup)
        from models import User
        user = User.query.get(user_id)
        full_name = f"{user.first_name} {user.last_name}".strip().lower()

        # Read the Excel sheet using pandas
        df = pd.read_excel(EXCEL_FILE_PATH, sheet_name=TARGET_SHEET, header=9)

        # Normalize column names
        df.columns = df.columns.str.strip()

        # Normalize "Name Match" column and filter investor row
        df['Name Match'] = df['Name Match'].astype(str).str.strip().str.lower()
        investor_row = df[df['Name Match'] == full_name]

        if investor_row.empty:
            return jsonify({"error": f"No data found for {full_name}"}), 404

        row = investor_row.iloc[0]

        # Extract specific columns (ensure you match Excel headers exactly)
        report = {
            "Ending Balance": row.get("Ending Balance"),
            "Unrealized Gain/Loss": row.get("Unrealized Gain/Loss"),
            "Management Fee": row.get("Management Fee"),
            "Committed": row.get("Committed"),
            # Add other fields if needed
        }

        return jsonify(report), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500