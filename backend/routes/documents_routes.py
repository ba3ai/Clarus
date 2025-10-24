# backend/routes/documents_routes.py
import os, uuid, mimetypes, json, time, hmac, hashlib, base64
from flask import Blueprint, request, jsonify, current_app, send_from_directory, send_file, url_for, abort, Response
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from werkzeug.utils import secure_filename
from backend.extensions import db

# Models (your existing ones)
from backend.models import User, Investor, Document, DocumentShare

documents_bp = Blueprint("documents", __name__)

# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────
def _ensure_upload_dir():
    upload_dir = os.getenv(
        "UPLOAD_DOCS_DIR",
        os.path.join(current_app.root_path, "uploads", "docs"),
    )
    os.makedirs(upload_dir, exist_ok=True)
    return upload_dir

def _claims():
    return get_jwt() or {}

def _is_admin():
    return str(_claims().get("user_type", "")).lower() == "admin"

def _authed_user_id():
    ident = get_jwt_identity()
    if ident is not None:
        try:
            return int(ident)
        except Exception:
            return ident
    c = _claims()
    for key in ("sub_user_id", "user_id", "sub", "uid"):
        val = c.get(key)
        if val is not None:
            try:
                return int(val)
            except Exception:
                return val
    return None

def _is_admin_or_shared(doc_id: int) -> bool:
    if _is_admin():
        return True
    uid = _authed_user_id()
    if not uid:
        return False
    return (
        db.session.query(DocumentShare.id)
        .filter_by(document_id=doc_id, investor_user_id=uid)
        .first()
        is not None
    )

def _to_int_list(values):
    """Coerce a string/array of ids into a list of ints."""
    if values is None:
        return []
    if isinstance(values, (list, tuple)):
        raw = values
    else:
        s = str(values).strip()
        if not s:
            return []
        raw = json.loads(s) if s.startswith("[") else [x for x in s.split(",")]
    out = []
    for x in raw:
        try:
            out.append(int(x))
        except Exception:
            pass
    return out

def _resolve_user_ids(raw_ids):
    """
    Accept ids that might be user.id OR investor.id.
    Return a de-duplicated list of user.id suitable for DocumentShare.investor_user_id.
    """
    ids = _to_int_list(raw_ids)
    if not ids:
        return []

    users = User.query.with_entities(User.id).filter(User.id.in_(ids)).all()
    user_ids = {u.id for u in users}

    remaining = set(ids) - user_ids
    if remaining:
        linked = (
            Investor.query.with_entities(Investor.account_user_id)
            .filter(Investor.id.in_(remaining), Investor.account_user_id.isnot(None))
            .all()
        )
        user_ids.update(int(row[0]) for row in linked if row and row[0])

    return list(dict.fromkeys(user_ids))

def _label_from_user(first_name, last_name, email, fallback):
    name = f"{(first_name or '').strip()} {(last_name or '').strip()}".strip()
    return name or (email or fallback)

def _serialize(doc: Document):
    return {
        "id": doc.id,
        "title": doc.title,
        "original_name": doc.original_name,
        "mime_type": doc.mime_type,
        "size_bytes": doc.size_bytes,
        "uploaded_at": doc.uploaded_at.isoformat(),
        "shares": [
            {
                "investor_user_id": s.investor_user_id,
                "shared_at": s.shared_at.isoformat(),
            }
            for s in doc.shares
        ],
    }

# ─────────────────────────────────────────────────────────────
# HMAC preview signing (short-lived public links)
# ─────────────────────────────────────────────────────────────
def _preview_secret() -> bytes:
    return (current_app.config.get("PREVIEW_SECRET") or "change-me").encode()

def _preview_ttl() -> int:
    # seconds; default 5 minutes
    return int(current_app.config.get("PREVIEW_TTL", 300))

def _sign_public_url(abs_path_no_query: str, ttl_sec: int | None = None) -> str:
    exp = int(time.time()) + int(ttl_sec or _preview_ttl())
    msg = f"{abs_path_no_query}|{exp}".encode()
    sig = base64.urlsafe_b64encode(hmac.new(_preview_secret(), msg, hashlib.sha256).digest()).decode().rstrip("=")
    return f"{abs_path_no_query}?exp={exp}&sig={sig}"

def _validate_sig(base_url_no_query: str, exp: int, sig: str) -> bool:
    try:
        if exp < int(time.time()):
            return False
        msg = f"{base_url_no_query}|{exp}".encode()
        want = base64.urlsafe_b64encode(hmac.new(_preview_secret(), msg, hashlib.sha256).digest()).decode().rstrip("=")
        return hmac.compare_digest(want, sig or "")
    except Exception:
        return False

# ─────────────────────────────────────────────────────────────
# Role-based share options
# ─────────────────────────────────────────────────────────────
@documents_bp.get("/api/documents/share-options")
@jwt_required()
def share_options():
    # (unchanged)
    if not _is_admin():
        return jsonify(error="Admins only."), 403

    role = (request.args.get("role") or "").strip().lower()
    options = []

    if role == "admin":
        rows = (
            User.query.with_entities(User.id, User.first_name, User.last_name, User.email)
            .filter(User.user_type == "admin")
            .order_by(User.first_name.asc(), User.last_name.asc())
            .all()
        )
        for u in rows:
            options.append({
                "user_id": u.id,
                "label": _label_from_user(u.first_name, u.last_name, u.email, f"User {u.id}"),
                "email": u.email,
                "investor_id": None,
            })

    elif role == "group_admin":
        rows = (
            User.query.with_entities(User.id, User.first_name, User.last_name, User.email)
            .filter(User.user_type == "group_admin")
            .order_by(User.first_name.asc(), User.last_name.asc())
            .all()
        )
        for u in rows:
            options.append({
                "user_id": u.id,
                "label": _label_from_user(u.first_name, u.last_name, u.email, f"User {u.id}"),
                "email": u.email,
                "investor_id": None,
            })

    elif role == "investor":
        linked_rows = (
            db.session.query(
                Investor.id.label("investor_id"),
                Investor.name.label("investor_name"),
                Investor.email.label("investor_email"),
                Investor.account_user_id.label("user_id"),
                User.first_name, User.last_name, User.email,
            )
            .join(User, User.id == Investor.account_user_id)
            .order_by(Investor.name.asc())
            .all()
        )
        seen_user_ids = set()
        for r in linked_rows:
            label = (
                f"{(r.first_name or '').strip()} {(r.last_name or '').strip()}".strip()
                or (r.investor_name or "")
                or (r.email or r.investor_email or "")
                or f"User {r.user_id}"
            )
            options.append({
                "user_id": r.user_id,
                "investor_id": r.investor_id,
                "label": label,
                "email": r.email or r.investor_email,
            })
            seen_user_ids.add(r.user_id)

        more_users = (
            User.query.with_entities(User.id, User.first_name, User.last_name, User.email)
            .filter(User.user_type == "investor", ~User.id.in_(seen_user_ids))
            .order_by(User.first_name.asc(), User.last_name.asc())
            .all()
        )
        for u in more_users:
            options.append({
                "user_id": u.id,
                "investor_id": None,
                "label": _label_from_user(u.first_name, u.last_name, u.email, f"User {u.id}"),
                "email": u.email,
            })
    else:
        return jsonify(error="Unknown role. Use admin | group_admin | investor."), 400

    return jsonify(ok=True, options=options)

# ─────────────────────────────────────────────────────────────
# Upload
# ─────────────────────────────────────────────────────────────
@documents_bp.post("/api/documents/upload")
@jwt_required()
def upload_document():
    if not _is_admin():
        return jsonify(error="Admins only."), 403

    file = request.files.get("file")
    if not file:
        return jsonify(error="No file provided."), 400

    title = (request.form.get("title") or "").strip() or None

    raw_single = request.form.get("investor_id")
    raw_multi = request.form.get("investor_ids")
    raw_ids = [raw_single] if raw_single else _to_int_list(raw_multi)
    resolved_user_ids = _resolve_user_ids(raw_ids)

    upload_dir = _ensure_upload_dir()
    original = secure_filename(file.filename or "upload.bin")
    ext = os.path.splitext(original)[1]
    stored = f"{uuid.uuid4().hex}{ext or ''}"
    mime = file.mimetype or mimetypes.guess_type(original)[0] or "application/octet-stream"
    path = os.path.join(upload_dir, stored)
    file.save(path)
    size = os.path.getsize(path)

    doc = Document(
        title=title or os.path.splitext(original)[0],
        original_name=original,
        stored_name=stored,
        mime_type=mime,
        size_bytes=size,
        uploaded_by_user_id=int(_authed_user_id() or 0),
    )
    db.session.add(doc)
    db.session.flush()

    for uid in resolved_user_ids:
        db.session.add(DocumentShare(document_id=doc.id, investor_user_id=int(uid)))

    db.session.commit()
    return jsonify(ok=True, document=_serialize(doc))

# ─────────────────────────────────────────────────────────────
# List documents
# ─────────────────────────────────────────────────────────────
@documents_bp.get("/api/documents")
@jwt_required()
def list_documents():
    if _is_admin():
        docs = Document.query.order_by(Document.uploaded_at.desc()).all()
    else:
        uid = _authed_user_id()
        if uid is None:
            return jsonify(ok=True, documents=[])
        docs = (
            Document.query.join(DocumentShare)
            .filter(DocumentShare.investor_user_id == uid)
            .order_by(Document.uploaded_at.desc())
            .all()
        )
    return jsonify(ok=True, documents=[_serialize(d) for d in docs])

# ─────────────────────────────────────────────────────────────
# Share / Revoke
# ─────────────────────────────────────────────────────────────
@documents_bp.post("/api/documents/share")
@jwt_required()
def share_document():
    if not _is_admin():
        return jsonify(error="Admins only."), 403

    data = request.get_json(silent=True) or {}
    doc_id = int(data.get("document_id") or 0)
    raw_ids = [data["investor_id"]] if data.get("investor_id") else (data.get("investor_ids") or [])
    resolved_user_ids = _resolve_user_ids(raw_ids)

    if not doc_id or not resolved_user_ids:
        return jsonify(error="document_id and investor_id(s) are required."), 400

    doc = Document.query.get(doc_id)
    if not doc:
        return jsonify(error="Document not found."), 404

    existing = {s.investor_user_id for s in doc.shares}
    for uid in resolved_user_ids:
        if int(uid) not in existing:
            db.session.add(DocumentShare(document_id=doc.id, investor_user_id=int(uid)))
    db.session.commit()
    return jsonify(ok=True, document=_serialize(doc))

@documents_bp.delete("/api/documents/share")
@jwt_required()
def revoke_share():
    if not _is_admin():
        return jsonify(error="Admins only."), 403
    data = request.get_json(silent=True) or {}
    doc_id = int(data.get("document_id") or 0)
    investor_id = int(data.get("investor_id") or 0)
    if not doc_id or not investor_id:
        return jsonify(error="document_id and investor_id are required."), 400
    DocumentShare.query.filter_by(document_id=doc_id, investor_user_id=investor_id).delete()
    db.session.commit()
    return jsonify(ok=True)

# ─────────────────────────────────────────────────────────────
# Download (Admin or shared user)
# ─────────────────────────────────────────────────────────────
@documents_bp.get("/api/documents/download/<int:doc_id>")
@jwt_required()
def download_document(doc_id: int):
    if not _is_admin_or_shared(doc_id):
        return jsonify(error="Not authorized."), 403
    doc = Document.query.get(doc_id)
    if not doc:
        return jsonify(error="Not found."), 404
    upload_dir = _ensure_upload_dir()
    return send_from_directory(
        upload_dir,
        doc.stored_name,
        download_name=doc.original_name,
        mimetype=doc.mime_type,
        as_attachment=True,
    )

# ─────────────────────────────────────────────────────────────
# Inline view (authenticated) – handy for quick previews
# ─────────────────────────────────────────────────────────────
@documents_bp.get("/api/documents/view/<int:doc_id>")
@jwt_required()
def view_document(doc_id: int):
    if not _is_admin_or_shared(doc_id):
        return jsonify(error="Not authorized."), 403
    doc = Document.query.get(doc_id)
    if not doc:
        return jsonify(error="Not found."), 404
    upload_dir = _ensure_upload_dir()
    path = os.path.join(upload_dir, doc.stored_name)
    if not os.path.exists(path):
        return jsonify(error="File missing on server."), 404
    return send_file(path, mimetype=doc.mime_type or "application/octet-stream")

# ─────────────────────────────────────────────────────────────
# NEW: Signed preview URL (for cloud viewers)
# ─────────────────────────────────────────────────────────────
@documents_bp.get("/api/documents/preview-url/<int:doc_id>")
@jwt_required()
def preview_url_document(doc_id: int):
    """
    Returns a short-lived public URL that cloud viewers (Office/GDocs) can access.
    The public URL is validated by HMAC (exp, sig) in 'public-download' below.
    """
    if not _is_admin_or_shared(doc_id):
        return jsonify(error="Not authorized."), 403
    # absolute URL without query (we sign the path)
    abs_path = url_for("documents.public_download_document", doc_id=doc_id, _external=True)
    return jsonify({"url": _sign_public_url(abs_path)})

@documents_bp.get("/api/documents/public-download/<int:doc_id>")
def public_download_document(doc_id: int):
    """
    Public endpoint used by previews. We validate signature & expiration
    and then serve IN-LINE (no attachment) so <iframe> can render.
    """
    exp = int(request.args.get("exp", "0") or 0)
    sig = request.args.get("sig", "") or ""
    base_no_query = request.base_url  # no query string
    if not _validate_sig(base_no_query, exp, sig):
        return abort(403)

    doc = Document.query.get(doc_id)
    if not doc:
        return jsonify(error="Not found."), 404

    upload_dir = _ensure_upload_dir()
    path = os.path.join(upload_dir, doc.stored_name or "")
    if not os.path.exists(path):
        return jsonify(error="File missing on server."), 404

    # Inline (important for embedding)
    return send_file(
        path,
        mimetype=doc.mime_type or "application/octet-stream",
        as_attachment=False,
        download_name=doc.original_name,
        max_age=_preview_ttl(),
        conditional=True,
        etag=True,
        last_modified=doc.uploaded_at,
    )

# ─────────────────────────────────────────────────────────────
# Delete document (admin only). Removes shares, file, row
# ─────────────────────────────────────────────────────────────
@documents_bp.delete("/api/documents/<int:doc_id>")
@jwt_required()
def delete_document(doc_id: int):
    if not _is_admin():
        return jsonify(error="Admins only."), 403
    doc = Document.query.get(doc_id)
    if not doc:
        return jsonify(error="Not found."), 404

    upload_dir = _ensure_upload_dir()
    path = os.path.join(upload_dir, doc.stored_name or "")
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception:
        pass

    DocumentShare.query.filter_by(document_id=doc.id).delete()
    db.session.delete(doc)
    db.session.commit()
    return jsonify(ok=True)
