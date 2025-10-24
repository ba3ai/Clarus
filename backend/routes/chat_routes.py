from __future__ import annotations
import os, glob
from typing import Any, Dict, Optional, Tuple

from flask import Blueprint, request, jsonify, current_app
from flask_login import current_user

from backend.services.file_resolver import resolve_file_and_bytes
from backend.services.openai_client import LLMClient
from backend.services.nlp_router import parse_intent                 # <-- domain detector
from backend.services.sheet_embeddings import (
    build_or_load_index,
    answer_from_topk,
    clear_cache_for_path,
    index_stats,
)

chat_bp = Blueprint("chat_bp", __name__)
_llm = LLMClient()

ALLOWED_EXTS = (".xls", ".xlsx", ".xlsm")

# ---------- default workbook resolution ----------
def _abs_join(root: str, maybe_rel: str) -> str:
    if not maybe_rel:
        return ""
    p = os.path.expandvars(os.path.expanduser(maybe_rel))
    if os.path.isabs(p):
        return os.path.normpath(p)
    return os.path.normpath(os.path.join(root, p))

def _default_upload_ref() -> Optional[Dict[str, Any]]:
    root = current_app.root_path
    explicit_cfg = current_app.config.get("DEFAULT_WORKBOOK_FILE")
    if explicit_cfg:
        apath = _abs_join(root, explicit_cfg)
        if os.path.isfile(apath):
            return {"provider": "upload", "path": apath}

    upl_cfg = current_app.config.get("UPLOAD_FOLDER", "backend/uploads")
    upl_dir = _abs_join(root, upl_cfg)
    os.makedirs(upl_dir, exist_ok=True)
    candidates = []
    for ext in ALLOWED_EXTS:
        candidates.extend(glob.glob(os.path.join(upl_dir, f"*{ext}")))
        candidates.extend(glob.glob(os.path.join(upl_dir, f"*{ext.upper()}")))
    if not candidates:
        return None
    newest = max(candidates, key=os.path.getmtime)
    return {"provider": "upload", "path": os.path.normpath(newest)}

def _default_graph_ref() -> Optional[Dict[str, Any]]:
    provider = (current_app.config.get("DEFAULT_PROVIDER") or "").lower()
    if provider not in {"sharepoint", "onedrive"}:
        return None
    drive_id = current_app.config.get("DEFAULT_DRIVE_ID")
    item_id  = current_app.config.get("DEFAULT_ITEM_ID")
    if not (drive_id and item_id):
        return None
    return {"provider": provider, "drive_id": drive_id, "item_id": item_id}

def _get_default_file_ref() -> Optional[Dict[str, Any]]:
    ref = _default_upload_ref()
    if ref: return ref
    ref = _default_graph_ref()
    if ref: return ref
    return _default_upload_ref()

def _role_hint() -> Optional[str]:
    return (getattr(current_user, "user_type", None) or getattr(current_user, "role", None))

# ------------------------------ routes ---------------------------------

@chat_bp.route("/chat", methods=["POST"])
def chat() -> Tuple[Any, int]:
    data = request.get_json(silent=True) or {}
    raw = data.get("message")
    message: str = raw.strip() if isinstance(raw, str) else (raw or "")

    if not message:
        return jsonify({"type": "error", "message": "Empty message"}), 400

    # 1) Detect domain (financial | general)
    intent = parse_intent(message)
    domain = intent.get("domain", "general")

    # 2) General queries → answer with LLM only (NO embeddings)
    if domain != "financial":
        answer = _llm.finance_answer(f"(General question) {message}", role_hint=_role_hint())
        return jsonify({"type": "nlp", "answer": answer}), 200

    # 3) Financial queries → use workbook embeddings
    file_ref: Optional[Dict[str, Any]] = data.get("fileRef")
    if not file_ref:
        file_ref = _get_default_file_ref()
    if not file_ref:
        msg = ("No workbook configured. Set app.config['DEFAULT_WORKBOOK_FILE'] "
               "or place an .xls/.xlsx/.xlsm in UPLOAD_FOLDER.")
        return jsonify({"type": "error", "message": msg}), 200

    book_bytes, meta = resolve_file_and_bytes(getattr(current_user, "id", None), file_ref)
    if not book_bytes:
        return jsonify({"type": "error", "message": "No readable workbook found for chatbot."}), 200

    local_path = file_ref.get("path") if file_ref.get("provider") == "upload" else None
    index = build_or_load_index(
        _llm, book_bytes, local_path=local_path, provider_meta=file_ref if not local_path else None
    )
    result = answer_from_topk(_llm, message, index, k=5)
    return jsonify(result), 200


@chat_bp.route("/chat/ping", methods=["GET"])
def ping() -> Tuple[Any, int]:
    ref = _get_default_file_ref()
    exists = None
    if ref and ref.get("provider") == "upload":
        exists = os.path.isfile(ref.get("path", ""))
    return jsonify({"ok": True, "defaultRef": ref, "exists": exists}), 200

@chat_bp.route("/chat/reindex", methods=["POST"])
def reindex() -> Tuple[Any, int]:
    ref = _get_default_file_ref()
    if not ref:
        return jsonify({"ok": False, "message": "No default file ref."}), 400
    local_path = ref.get("path") if ref.get("provider") == "upload" else None
    removed = clear_cache_for_path(local_path, ref if not local_path else None)
    return jsonify({"ok": True, "removed": removed}), 200

@chat_bp.route("/chat/index-stats", methods=["GET"])
def index_stats_route() -> Tuple[Any, int]:
    ref = _get_default_file_ref()
    if not ref:
        return jsonify({"ok": False, "message": "No default file ref."}), 400
    book_bytes, _ = resolve_file_and_bytes(getattr(current_user, "id", None), ref)
    if not book_bytes:
        return jsonify({"ok": False, "message": "Workbook not readable."}), 400
    local_path = ref.get("path") if ref.get("provider") == "upload" else None
    stats = index_stats(_llm, book_bytes, local_path, ref if not local_path else None)
    return jsonify({"ok": True, **stats}), 200
