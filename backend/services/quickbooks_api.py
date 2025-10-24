# services/quickbooks_api.py

import requests
from extensions import fernet
from models import AdminSettings
# backend/quickbooks_api.py
from __future__ import annotations

import os
import requests
from datetime import datetime, timedelta

from intuitlib.client import AuthClient

def get_quickbooks_token(admin_id):
    setting = AdminSettings.query.filter_by(admin_id=admin_id).first()
    if not setting or not setting.quickbooks_token:
        raise Exception("QuickBooks token not configured")
    return fernet.decrypt(setting.quickbooks_token.encode()).decode()

def fetch_qb_data(admin_id):
    token = get_quickbooks_token(admin_id)
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }
    response = requests.get("https://api.dashboard.com/v1/quickbooks/transactions", headers=headers)
    return response.json()



def make_auth_client() -> AuthClient:
    return AuthClient(
        client_id=os.getenv("QBO_CLIENT_ID"),
        client_secret=os.getenv("QBO_CLIENT_SECRET"),
        environment=(os.getenv("QBO_ENV", "sandbox") or "sandbox").lower(),
        redirect_uri=os.getenv("QBO_REDIRECT_URI"),
    )

def revoke_refresh_token(refresh_token: str) -> None:
    try:
        requests.post(
            "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
            data={"token": refresh_token},
            auth=(os.getenv("QBO_CLIENT_ID"), os.getenv("QBO_CLIENT_SECRET")),
            headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
            timeout=15,
        )
    except Exception:
        pass


