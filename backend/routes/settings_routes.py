# routes/settings_routes.py
from __future__ import annotations

import os
import time
from pathlib import Path
from flask import Blueprint, jsonify, request, current_app
from werkzeug.utils import secure_filename
# If you store settings in DB, keep your setting model helpers:
# from backend.extensions import db
from backend.models_settings import AppSetting  # adjust import if different

settings_bp = Blueprint("settings", __name__, url_prefix="/api/settings")

ALLOWED = {"png", "jpg", "jpeg", "webp", "svg"}
LOGO_KEY = "brand_logo_path"  # absolute path saved here


def _static_root() -> Path:
    """Return the actual static directory Flask serves."""
    static_folder = current_app.static_folder  # absolute path
    return Path(static_folder)


def _static_url_path() -> str:
    """Return the URL prefix Flask uses to serve static files."""
    # Typically "/static" unless configured otherwise.
    return current_app.static_url_path.rstrip("/")


def _brand_dir() -> Path:
    """Directory where we store branding assets inside static."""
    p = _static_root() / "brand"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _ext_of(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def _public_url_for(abs_path: Path) -> str:
    """Map an absolute file path inside static/ to the public URL."""
    static_root = _static_root()
    rel = abs_path.relative_to(static_root).as_posix()  # e.g. "brand/statement_logo.png"
    return f"{_static_url_path()}/{rel}"


@settings_bp.get("/logo")
def get_logo():
    abs_path = AppSetting.get(LOGO_KEY)
    if not abs_path or not os.path.exists(abs_path):
        return jsonify({"url": None})
    # Append a tiny cache buster so refresh shows latest
    url = _public_url_for(Path(abs_path))
    return jsonify({"url": f"{url}?v={int(time.time())}"})


@settings_bp.post("/logo")
def upload_logo():
    if "file" not in request.files:
        return jsonify({"error": "Missing file"}), 400

    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "Empty filename"}), 400

    ext = _ext_of(f.filename)
    if ext not in ALLOWED:
        return jsonify({"error": f"Unsupported file type: {ext}"}), 400

    target_dir = _brand_dir()
    filename = secure_filename(f"statement_logo.{ext}")
    abs_path = target_dir / filename

    # Remove old variants with other extensions
    for old in target_dir.glob("statement_logo.*"):
        try:
            old.unlink()
        except Exception:
            pass

    f.save(str(abs_path))
    AppSetting.set(LOGO_KEY, str(abs_path))

    url = _public_url_for(abs_path) + f"?v={int(time.time())}"
    return jsonify({"ok": True, "url": url})


@settings_bp.delete("/logo")
def delete_logo():
    abs_path = AppSetting.get(LOGO_KEY)
    if abs_path and os.path.exists(abs_path):
        try:
            os.remove(abs_path)
        except Exception:
            pass
    AppSetting.delete(LOGO_KEY)
    return jsonify({"ok": True})
