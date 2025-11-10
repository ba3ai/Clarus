# backend/files_routes.py
import io
import os
import shutil
import mimetypes
import time, hmac, hashlib, base64
from zipfile import ZipFile, ZIP_DEFLATED
from flask import Blueprint, current_app, jsonify, request, send_file, abort, url_for
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
from flask_login import login_required

from backend.extensions import db
from backend.models import FileNode

files_bp = Blueprint("files", __name__)

# ---------- helpers ----------



def _children_of(parent_id: int | None, scope: str, uid):
    q = _ownable_query(scope, uid).filter_by(parent_id=parent_id)
    return q.order_by(FileNode.type.desc(), FileNode.name.asc()).all()

def _is_descendant(node_id: int, maybe_parent_id: int) -> bool:
    """Return True if node_id is inside maybe_parent_id (to block moving a folder into itself)."""
    if node_id == maybe_parent_id:
        return True
    cur = FileNode.query.get(maybe_parent_id)
    while cur and cur.parent_id is not None:
        if cur.parent_id == node_id:
            return True
        cur = FileNode.query.get(cur.parent_id)
    return False

def _update_subtree_paths(folder: FileNode, old_root: str, new_root: str):
    """After a folder is moved, update all children paths in DB."""
    for child in FileNode.query.filter_by(parent_id=folder.id).all():
        rel = os.path.relpath(child.path, start=old_root)
        child.path = os.path.normpath(os.path.join(new_root, rel))
        db.session.add(child)
        if child.type == "folder":
            _update_subtree_paths(child, old_root=os.path.join(old_root, os.path.basename(child.path)),
                                  new_root=os.path.join(new_root, os.path.basename(child.path)))

def _parse_user_id(raw):
    try:
        return int(raw)
    except (TypeError, ValueError):
        return raw

def _current_user_id():
    return _parse_user_id(get_jwt_identity())

def _owns(node: FileNode, uid):
    if node.scope != "direct":
        return True
    try:
        return int(node.owner_id) == int(uid)
    except Exception:
        return str(node.owner_id) == str(uid)

def _root_dir(scope: str, user_id) -> str:
    base = current_app.config["UPLOAD_ROOT"]
    root = os.path.join(base, "direct", str(user_id)) if scope == "direct" else os.path.join(base, "shared")
    os.makedirs(root, exist_ok=True)
    return root

def _node_path(node: FileNode) -> str:
    return node.path

def _ensure_safe_name(name: str) -> str:
    s = secure_filename(name or "").strip()
    return s or "untitled"

def _check_scope(scope: str):
    if scope not in ("direct", "shared"):
        abort(400, "scope must be 'direct' or 'shared'")

def _ownable_query(scope: str, user_id):
    q = FileNode.query.filter_by(scope=scope)
    if scope == "direct":
        q = q.filter_by(owner_id=_parse_user_id(user_id))
    else:
        q = q.filter_by(owner_id=None)
    return q

# ---- preview signing helpers (for public inline preview) ----
def _preview_secret() -> bytes:
    return (current_app.config.get("PREVIEW_SECRET") or "change-me").encode()

def _preview_ttl() -> int:
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

# ---------- routes ----------

@files_bp.get("/tree")
@login_required
def list_tree():
    """Return the full tree for the chosen scope (root level)."""
    scope = request.args.get("scope", "direct")
    _check_scope(scope)
    uid = _current_user_id()
    q = _ownable_query(scope, uid).filter(FileNode.parent_id.is_(None))
    roots = q.order_by(FileNode.type.desc(), FileNode.name.asc()).all()
    return jsonify([r.to_dict() for r in roots])

@files_bp.post("/folder")
@login_required
def create_folder():
    data = request.get_json(force=True) or {}
    scope = data.get("scope", "direct")
    _check_scope(scope)
    uid = _current_user_id()
    name = _ensure_safe_name(data.get("name", "New Folder"))
    parent_id = data.get("parent_id")

    root = _root_dir(scope, uid)
    parent = None
    if parent_id:
        parent = _ownable_query(scope, uid).filter_by(id=int(parent_id)).first_or_404()
        root = _node_path(parent)

    folder_path = os.path.join(root, name)
    os.makedirs(folder_path, exist_ok=True)

    node = FileNode(
        owner_id=None if scope == "shared" else (uid if isinstance(uid, int) else None),
        scope=scope,
        name=name,
        type="folder",
        parent_id=parent.id if parent else None,
        path=folder_path,
    )
    db.session.add(node)
    db.session.commit()
    return jsonify(node.to_dict()), 201

@files_bp.post("/upload")
@login_required
def upload():
    scope = request.form.get("scope", "direct")
    _check_scope(scope)
    uid = _current_user_id()
    parent_id = request.form.get("parent_id")
    parent = None
    root = _root_dir(scope, uid)

    if parent_id:
        parent = _ownable_query(scope, uid).filter_by(id=int(parent_id)).first_or_404()
        root = _node_path(parent)

    files = request.files.getlist("files")
    if not files:
        abort(400, "No files uploaded")

    created = []
    for f in files:
        fn = _ensure_safe_name(f.filename)
        dest = os.path.join(root, fn)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        f.save(dest)

        node = FileNode(
            owner_id=None if scope == "shared" else (uid if isinstance(uid, int) else None),
            scope=scope,
            name=fn,
            type="file",
            parent_id=parent.id if parent else None,
            path=dest,
        )
        db.session.add(node)
        created.append(node)

    db.session.commit()
    return jsonify([n.to_dict() for n in created]), 201

@files_bp.post("/rename")
@login_required
def rename():
    data = request.get_json(force=True)
    node_id = int(data["id"])
    new_name = _ensure_safe_name(data["name"])

    uid = _current_user_id()
    node = FileNode.query.get_or_404(node_id)
    if not _owns(node, uid):
        abort(403)

    new_path = os.path.join(os.path.dirname(node.path), new_name)
    os.rename(node.path, new_path)
    node.name = new_name
    node.path = new_path
    db.session.commit()
    return jsonify(node.to_dict())

@files_bp.delete("/node/<int:node_id>")
@login_required
def delete_node(node_id):
    uid = _current_user_id()
    node = FileNode.query.get_or_404(node_id)
    if not _owns(node, uid):
        abort(403)

    if node.type == "folder":
        shutil.rmtree(node.path, ignore_errors=True)
    else:
        try:
            os.remove(node.path)
        except FileNotFoundError:
            pass

    db.session.delete(node)
    db.session.commit()
    return "", 204

@files_bp.post("/permissions")
@login_required
def update_permissions():
    data = request.get_json(force=True)
    node_id = int(data["id"])
    perm = data.get("permission", "Investor")

    uid = _current_user_id()
    node = FileNode.query.get_or_404(node_id)
    if not _owns(node, uid):
        abort(403)

    node.permission = perm
    db.session.commit()
    return jsonify(node.to_dict())

@files_bp.get("/download/<int:node_id>")
@login_required
def download(node_id):
    uid = _current_user_id()
    node = FileNode.query.get_or_404(node_id)
    if not _owns(node, uid):
        abort(403)

    if node.type == "file":
        mime, _ = mimetypes.guess_type(node.name)
        return send_file(
            node.path,
            as_attachment=True,
            download_name=node.name,
            mimetype=mime or "application/octet-stream",
        )

    mem = io.BytesIO()
    with ZipFile(mem, "w", ZIP_DEFLATED) as zf:
        base_dir = node.path
        for root, _, files in os.walk(base_dir):
            for f in files:
                abs_path = os.path.join(root, f)
                arcname = os.path.relpath(abs_path, start=os.path.dirname(base_dir))
                zf.write(abs_path, arcname=arcname)
    mem.seek(0)
    return send_file(mem, as_attachment=True, download_name=f"{node.name}.zip", mimetype="application/zip")

@files_bp.get("/download-all")
@login_required
def download_all():
    scope = request.args.get("scope", "direct")
    _check_scope(scope)
    uid = _current_user_id()

    root = _root_dir(scope, uid)
    mem = io.BytesIO()
    with ZipFile(mem, "w", ZIP_DEFLATED) as zf:
        for base, _, files in os.walk(root):
            for f in files:
                abs_path = os.path.join(base, f)
                arcname = os.path.relpath(abs_path, start=os.path.dirname(root))
                zf.write(abs_path, arcname=arcname)
    mem.seek(0)
    return send_file(mem, as_attachment=True, download_name=f"{scope}-files.zip", mimetype="application/zip")

# ─────────────────────────────────────────────────────────────
# NEW: Signed preview URL + public inline download
# ─────────────────────────────────────────────────────────────
@files_bp.get("/preview-url/<int:node_id>")
@login_required
def preview_url(node_id: int):
    """
    Returns a short-lived public URL for this file.
    Frontend can feed this into Office/GDocs viewers when the browser can't preview natively.
    """
    uid = _current_user_id()
    node = FileNode.query.get_or_404(node_id)
    if not _owns(node, uid):
        abort(403)
    if node.type != "file":
        abort(400, "Folders cannot be previewed.")

    abs_path = url_for("files.public_download_file", node_id=node_id, _external=True)
    return jsonify({"url": _sign_public_url(abs_path)})

@files_bp.get("/public-download/<int:node_id>")
def public_download_file(node_id: int):
    """
    Public inline download used by previews. Validates HMAC signature & expiration.
    Serves the file with Content-Disposition: inline.
    """
    exp = int(request.args.get("exp", "0") or 0)
    sig = request.args.get("sig", "") or ""
    base_no_query = request.base_url
    if not _validate_sig(base_no_query, exp, sig):
        return abort(403)

    node = FileNode.query.get_or_404(node_id)
    if node.type != "file":
        abort(400, "Folders cannot be previewed.")

    mime, _ = mimetypes.guess_type(node.name)
    return send_file(
        node.path,
        as_attachment=False,
        download_name=node.name,
        mimetype=mime or "application/octet-stream",
        max_age=_preview_ttl(),
        conditional=True,
        etag=True,
    )



@files_bp.get("/children")
@login_required
def list_children():
    """Return children for a folder (or root when no parent_id)."""
    scope = request.args.get("scope", "direct")
    _check_scope(scope)
    uid = _current_user_id()
    parent_id = request.args.get("parent_id")
    parent_id = int(parent_id) if parent_id not in (None, "", "null") else None
    rows = _children_of(parent_id, scope, uid)
    return jsonify([r.to_dict() for r in rows])

@files_bp.post("/move")
@login_required
def move_node():
    """Move a file/folder into another folder (or to root)."""
    data = request.get_json(force=True) or {}
    scope = data.get("scope", "direct")
    _check_scope(scope)
    uid = _current_user_id()

    node_id = int(data["id"])
    target_parent_id = data.get("target_parent_id")
    target_parent_id = int(target_parent_id) if target_parent_id not in (None, "", "null") else None

    node = FileNode.query.get_or_404(node_id)
    if not _owns(node, uid):
        abort(403)

    # resolve destination directory
    if target_parent_id is None:
        dest_dir = _root_dir(scope, uid)
        dest_parent = None
    else:
        dest_parent = _ownable_query(scope, uid).filter_by(id=target_parent_id).first_or_404()
        if dest_parent.type != "folder":
            abort(400, "Destination must be a folder")
        if node.type == "folder" and _is_descendant(node.id, dest_parent.id):
            abort(400, "Cannot move a folder into itself or its descendant")
        dest_dir = _node_path(dest_parent)

    # compute new absolute path and move on disk
    new_abs = os.path.join(dest_dir, node.name)
    os.makedirs(dest_dir, exist_ok=True)
    shutil.move(node.path, new_abs)

    # update DB paths (+ subtree if folder)
    old_abs = node.path
    node.parent_id = dest_parent.id if dest_parent else None
    node.path = new_abs
    db.session.add(node)

    if node.type == "folder":
        _update_subtree_paths(node, old_root=old_abs, new_root=new_abs)

    db.session.commit()
    return jsonify(node.to_dict())

@files_bp.post("/copy")
@login_required
def copy_node():
    """Copy a file/folder into another folder (or to root)."""
    data = request.get_json(force=True) or {}
    scope = data.get("scope", "direct")
    _check_scope(scope)
    uid = _current_user_id()

    node_id = int(data["id"])
    target_parent_id = data.get("target_parent_id")
    target_parent_id = int(target_parent_id) if target_parent_id not in (None, "", "null") else None

    src = FileNode.query.get_or_404(node_id)
    if not _owns(src, uid):
        abort(403)

    # destination folder path
    if target_parent_id is None:
        dest_parent = None
        dest_dir = _root_dir(scope, uid)
    else:
        dest_parent = _ownable_query(scope, uid).filter_by(id=target_parent_id).first_or_404()
        if dest_parent.type != "folder":
            abort(400, "Destination must be a folder")
        dest_dir = _node_path(dest_parent)

    os.makedirs(dest_dir, exist_ok=True)

    def duplicate_tree(src_node: FileNode, parent_id: int | None, at_dir: str) -> FileNode:
        new_path = os.path.join(at_dir, src_node.name)
        if src_node.type == "folder":
            os.makedirs(new_path, exist_ok=True)
            dst = FileNode(
                owner_id=src_node.owner_id,
                scope=src_node.scope,
                name=src_node.name,
                type="folder",
                parent_id=parent_id,
                path=new_path,
                permission=src_node.permission,
            )
            db.session.add(dst)
            db.session.flush()
            # copy children
            for child in FileNode.query.filter_by(parent_id=src_node.id).all():
                duplicate_tree(child, dst.id, new_path)
            return dst
        else:
            shutil.copy2(src_node.path, new_path)
            dst = FileNode(
                owner_id=src_node.owner_id,
                scope=src_node.scope,
                name=src_node.name,
                type="file",
                parent_id=parent_id,
                path=new_path,
                permission=src_node.permission,
            )
            db.session.add(dst)
            return dst

    new_node = duplicate_tree(src, dest_parent.id if dest_parent else None, dest_dir)
    db.session.commit()
    return jsonify(new_node.to_dict()), 201