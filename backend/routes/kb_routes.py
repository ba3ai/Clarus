# backend/routes/kb_routes.py
from __future__ import annotations
import os
import uuid
import time
import json
from typing import List, Dict
from flask import Blueprint, request, jsonify, current_app

from backend.services.auth_utils import get_request_user
from backend.services.sheet_embeddings import (
    _paths,
    sync_documents_to_metas,
    _ensure_index_built,
    rebuild_index,
)

kb_bp = Blueprint("kb_bp", __name__, url_prefix="/api/kb")

ALLOWED_ANY = {
    ".txt", ".md", ".csv", ".tsv",
    ".xlsx", ".xlsm", ".xls",
    ".pdf", ".docx",
    ".json", ".html",
}

def _safe_component(s: str) -> str:
    return "".join(
        c if c.isalnum() or c in (".", "_", "-", " ") else "_"
        for c in (s or "")
    ).strip() or "file"

def _tenant(user) -> str:
    return f"user:{user.get('email') or user.get('id') or 'anonymous_local'}"

def _tenant_paths(tenant: str) -> Dict[str, str]:
    return _paths(tenant)

def _docs_dir(tenant: str) -> str:
    return _tenant_paths(tenant)["docs"]

def _manifest_path(tenant: str) -> str:
    return _tenant_paths(tenant)["manifest"]

def _metas_path(tenant: str) -> str:
    return _tenant_paths(tenant)["meta"]

def _load_manifest(tenant: str) -> Dict[str, str]:
    p = _manifest_path(tenant)
    if os.path.exists(p):
        try:
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def _save_manifest(tenant: str, manifest: Dict[str, str]) -> None:
    with open(_manifest_path(tenant), "w", encoding="utf-8") as f:
        json.dump(manifest, f)

def _list_docs(tenant: str) -> List[Dict]:
    d = _docs_dir(tenant)
    os.makedirs(d, exist_ok=True)
    out = []
    for fn in os.listdir(d):
        full = os.path.join(d, fn)
        if not os.path.isfile(full):
            continue
        # stored as "<uuid>__<original.ext>"
        parts = fn.split("__", 1)
        doc_id = parts[0]
        original = parts[1] if len(parts) > 1 else fn
        st = os.stat(full)
        out.append({
            "id": doc_id,
            "name": original,
            "stored_name": fn,
            "size": st.st_size,
            "created": int(st.st_ctime),
        })
    # newest first
    out.sort(key=lambda x: x["created"], reverse=True)
    return out

@kb_bp.get("/list")
def kb_list():
    """Return all uploaded docs for the current tenant."""
    user = get_request_user(request)
    tenant = _tenant(user)
    try:
        return jsonify({"ok": True, "tenant": tenant, "items": _list_docs(tenant)})
    except Exception as e:
        current_app.logger.exception("KB list failed: %s", e)
        return jsonify(error=str(e)), 500

@kb_bp.post("/upload")
def kb_upload():
    """
    Upload ANY file, store it under:
        knowledgebase/<tenant>/documents/<uuid>__<original_name>

    Then (synchronously):
      1) sync_documents_to_metas(tenant) -> append new/changed file rows/chunks to metas.jsonl
      2) _ensure_index_built(tenant)     -> embed only new chunks and update the FAISS index
    """
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify(error="No file provided"), 400

    _, ext = os.path.splitext(f.filename.lower())
    if ext not in ALLOWED_ANY:
        return jsonify(error=f"Unsupported type: {ext}"), 400

    user = get_request_user(request)
    tenant = _tenant(user)

    try:
        base_docs = _docs_dir(tenant)
        os.makedirs(base_docs, exist_ok=True)

        original = _safe_component(f.filename)
        stored = f"{uuid.uuid4().hex}__{original}"
        dst = os.path.join(base_docs, stored)
        with open(dst, "wb") as out:
            out.write(f.read())

        # ---- Index immediately on upload ----
        sync_res = sync_documents_to_metas(tenant)   # parse → metas.jsonl
        _ensure_index_built(tenant)                  # embed new chunks → faiss

        # respond with a fresh list
        return jsonify({
            "ok": True,
            "tenant": tenant,
            "stored_path": dst,
            "items": _list_docs(tenant),
            "sync_result": sync_res,
            "note": "File stored and indexed immediately (FAISS updated)."
        }), 200

    except Exception as e:
        current_app.logger.exception("KB upload+index failed: %s", e)
        return jsonify(error=str(e)), 500

@kb_bp.delete("/<doc_id>")
def kb_delete(doc_id: str):
    """
    Delete a stored document by its id (uuid prefix).
    Steps:
      - remove the file from documents/
      - prune metas.jsonl lines that belong to this stored filename
      - remove entry from manifest
      - rebuild FAISS index to stay consistent
    """
    user = get_request_user(request)
    tenant = _tenant(user)
    try:
        # find file by id
        docs_dir = _docs_dir(tenant)
        target_name = None
        target_full = None
        for fn in os.listdir(docs_dir):
            if fn.startswith(doc_id + "__"):
                target_name = fn
                target_full = os.path.join(docs_dir, fn)
                break
        if not target_full or not os.path.exists(target_full):
            return jsonify(error="Not found"), 404

        # remove file
        os.remove(target_full)

        # prune metas.jsonl (workbook meta equals stored filename)
        p_meta = _metas_path(tenant)
        if os.path.exists(p_meta):
            tmp = p_meta + ".tmp"
            with open(p_meta, "r", encoding="utf-8") as src, open(tmp, "w", encoding="utf-8") as dst:
                for line in src:
                    if not line.strip():
                        continue
                    try:
                        obj = json.loads(line)
                    except Exception:
                        continue
                    meta = obj.get("meta", {}) or {}
                    if meta.get("workbook") == target_name:
                        continue  # drop lines from this file
                    dst.write(json.dumps(obj) + "\n")
            os.replace(tmp, p_meta)

        # update manifest (remove file key if present)
        manifest = _load_manifest(tenant)
        if target_full in manifest:
            manifest.pop(target_full, None)
            _save_manifest(tenant, manifest)

        # rebuild index to keep ntotal aligned with metas.jsonl
        rebuild_index(tenant)

        return jsonify({"ok": True, "tenant": tenant, "items": _list_docs(tenant)}), 200

    except Exception as e:
        current_app.logger.exception("KB delete failed: %s", e)
        return jsonify(error=str(e)), 500


@kb_bp.get("/coverage")
def kb_coverage():
    """Quick ingest coverage: files, chunks, suspiciously tiny rows."""
    from backend.services.sheet_embeddings import _paths, _count_metas
    user = get_request_user(request)
    tenant = _tenant(user)
    p = _paths(tenant)
    tiny, total, rows = 0, 0, []
    if os.path.exists(p["meta"]):
        with open(p["meta"], "r", encoding="utf-8") as f:
            for i, line in enumerate(f):
                if not line.strip(): continue
                obj = json.loads(line)
                txt = (obj.get("text") or "")
                total += 1
                if len(txt) < 40:
                    tiny += 1
                    rows.append({"i": i, "meta": obj.get("meta", {}), "len": len(txt)})
    return jsonify({
        "tenant": tenant,
        "docs_dir": p["docs"],
        "files": len(os.listdir(p["docs"])) if os.path.exists(p["docs"]) else 0,
        "chunks_total": total,
        "tiny_chunks": tiny,
        "sample_tiny": rows[:20],
    }), 200
