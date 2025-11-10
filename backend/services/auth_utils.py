# backend/services/auth_utils.py
from __future__ import annotations
from typing import Dict
import os, jwt
from flask import request

JWT_PUBLIC_KEY = os.getenv("JWT_PUBLIC_KEY")  # or use SECRET if symmetric
JWT_ALG = os.getenv("JWT_ALG", "HS256")

def get_request_user(req) -> Dict[str, str]:
    """
    Returns {"email": ..., "id": ...} for the current request.
    Reads Authorization: Bearer <token> OR a session cookie if that's your setup.
    """
    auth = req.headers.get("Authorization","")
    token = None
    if auth.lower().startswith("bearer "):
        token = auth.split(" ",1)[1].strip()
    else:
        token = req.cookies.get("accessToken")

    if not token:
        # Fall back to anonymous; you'll likely want to 401 instead.
        return {"email": "anonymous@local", "id": "anon"}

    try:
        payload = jwt.decode(token, JWT_PUBLIC_KEY or os.getenv("SECRET_KEY","dev"), algorithms=[JWT_ALG])
        email = payload.get("email") or payload.get("sub")
        uid = str(payload.get("user_id") or payload.get("id") or email)
        return {"email": email, "id": uid}
    except Exception:
        return {"email": "anonymous@local", "id": "anon"}
