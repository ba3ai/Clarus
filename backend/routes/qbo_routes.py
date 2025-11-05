# backend/routes/qbo_routes.py
from __future__ import annotations

import os
import json
import requests
from datetime import datetime, timedelta, date
from calendar import monthrange

from flask import Blueprint, request, redirect, jsonify, session
from flask_jwt_extended import jwt_required, get_jwt_identity

from intuitlib.client import AuthClient
from intuitlib.enums import Scopes
from flask_login import login_required

from backend.models import (
    db,
    QuickBooksConnection,
    QboPeriodMetric,  # keeps your monthly rollup route working
    QboEntity,        # stores raw objects (JSON) + searchable indexes
    QboSyncLog,       # logs each full-sync run
)

qbo_bp = Blueprint("qbo", __name__, url_prefix="/api/qbo")

# ======================================================================================
# OAuth helpers
# ======================================================================================

def _make_auth_client() -> AuthClient:
    env = (os.getenv("QBO_ENV", "sandbox") or "sandbox").lower()
    client_id = os.getenv("QBO_CLIENT_ID")
    client_secret = os.getenv("QBO_CLIENT_SECRET")
    redirect_uri = os.getenv("QBO_REDIRECT_URI")
    if not client_id or not client_secret or not redirect_uri:
        raise RuntimeError("Missing QBO env vars")
    return AuthClient(
        client_id=client_id,
        client_secret=client_secret,
        environment=env,
        redirect_uri=redirect_uri,
    )

def _scopes():
    return [Scopes.ACCOUNTING]

def _ensure_valid_token(conn: QuickBooksConnection, auth_client: AuthClient) -> None:
    if conn.expires_at and datetime.utcnow() < (conn.expires_at - timedelta(seconds=60)):
        return
    auth_client.access_token  = conn.access_token
    auth_client.refresh_token = conn.refresh_token

    refreshed = False
    try:
        if hasattr(auth_client, "refresh") and callable(getattr(auth_client, "refresh")):
            auth_client.refresh()
            refreshed = True
    except Exception:
        pass
    if not refreshed:
        try:
            if hasattr(auth_client, "refresh_bearer_token"):
                auth_client.refresh_bearer_token()
                refreshed = True
        except Exception:
            pass
    if not refreshed:
        raise RuntimeError("Could not refresh QuickBooks token (intuitlib version mismatch).")

    conn.access_token  = getattr(auth_client, "access_token", conn.access_token)
    conn.refresh_token = getattr(auth_client, "refresh_token", conn.refresh_token)
    expires_in = getattr(auth_client, "expires_in", 3600)
    conn.expires_at   = datetime.utcnow() + timedelta(seconds=expires_in)
    conn.updated_at   = datetime.utcnow()
    db.session.commit()

def _qbo_base(conn: QuickBooksConnection) -> str:
    return "https://sandbox-quickbooks.api.intuit.com" if (conn.environment or "sandbox") == "sandbox" \
           else "https://quickbooks.api.intuit.com"

# ======================================================================================
# Connect / Callback / Quick tests / Disconnect
# ======================================================================================

@qbo_bp.get("/connect")
@login_required
def connect():
    auth_client = _make_auth_client()
    url = auth_client.get_authorization_url(_scopes())
    session["qbo_state"] = auth_client.state_token
    session["qbo_user_id"] = get_jwt_identity()
    return jsonify({"url": url})

@qbo_bp.get("/callback")
def callback():
    auth_client = _make_auth_client()
    if request.args.get("state") != session.get("qbo_state"):
        return "State mismatch", 400
    code     = request.args.get("code")
    realm_id = request.args.get("realmId")
    user_id  = session.get("qbo_user_id")
    if not user_id:
        return "Missing session; start connect again.", 401
    auth_client.get_bearer_token(auth_code=code, realm_id=realm_id)
    expires_at = datetime.utcnow() + timedelta(seconds=auth_client.expires_in)

    conn = QuickBooksConnection.query.filter_by(user_id=user_id, realm_id=realm_id).first()
    if not conn:
        conn = QuickBooksConnection(
            user_id=user_id,
            realm_id=realm_id,
            environment=os.getenv("QBO_ENV", "sandbox").lower(),
        )
        db.session.add(conn)

    conn.access_token  = auth_client.access_token
    conn.refresh_token = auth_client.refresh_token
    conn.token_type    = "bearer"
    conn.expires_at    = expires_at
    conn.updated_at    = datetime.utcnow()
    db.session.commit()

    session.pop("qbo_state", None)
    session.pop("qbo_user_id", None)
    return redirect("/settings/integrations?qbo=connected")

@qbo_bp.get("/customers")
@login_required
def customers():
    user_id = get_jwt_identity()
    q = QuickBooksConnection.query.filter_by(user_id=user_id).order_by(QuickBooksConnection.updated_at.desc())
    conn = q.first()
    if not conn:
        return jsonify({"error": "No QBO connection"}), 400

    auth = _make_auth_client()
    auth.access_token  = conn.access_token
    auth.refresh_token = conn.refresh_token
    _ensure_valid_token(conn, auth)

    url     = f"{_qbo_base(conn)}/v3/company/{conn.realm_id}/query"
    headers = {"Accept": "application/json", "Authorization": f"Bearer {conn.access_token}"}
    params  = {"query": "SELECT * FROM Customer MAXRESULTS 100", "minorversion": "75"}
    r = requests.get(url, params=params, headers=headers, timeout=30)
    out = r.json()
    if isinstance(out, dict):
        out["realmId"]     = conn.realm_id
        out["environment"] = conn.environment
    return jsonify(out), r.status_code

@qbo_bp.post("/disconnect")
@login_required
def disconnect():
    user_id = get_jwt_identity()
    realm_id = (request.json or {}).get("realmId")
    q = QuickBooksConnection.query.filter_by(user_id=user_id)
    if realm_id:
        q = q.filter_by(realm_id=realm_id)
    conn = q.order_by(QuickBooksConnection.updated_at.desc()).first()
    if not conn:
        return jsonify({"ok": False, "message": "No connection"}), 404
    try:
        requests.post(
            "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
            data={"token": conn.refresh_token},
            auth=(os.getenv("QBO_CLIENT_ID"), os.getenv("QBO_CLIENT_SECRET")),
            headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
            timeout=15,
        )
    except Exception:
        pass
    db.session.delete(conn)
    db.session.commit()
    return jsonify({"ok": True})

# ======================================================================================
# Reports helpers (used by your monthly rollup route)
# ======================================================================================

def _qbo_report(conn: QuickBooksConnection, report_name: str, params: dict) -> dict:
    url = f"{_qbo_base(conn)}/v3/company/{conn.realm_id}/reports/{report_name}"
    headers = {"Accept": "application/json", "Authorization": f"Bearer {conn.access_token}"}
    q = dict(params or {})
    q.setdefault("minorversion", "75")
    q.setdefault("accounting_method", "Accrual")
    q.setdefault("summarize_column_by", "Total")
    r = requests.get(url, headers=headers, params=q, timeout=60)
    r.raise_for_status()
    return r.json()

def _parse_amount(raw) -> float:
    if raw is None:
        return 0.0
    s = str(raw).strip()
    neg = s.startswith("(") and s.endswith(")")
    s = s.replace("(", "").replace(")", "").replace(",", "")
    try:
        v = float(s or "0")
    except Exception:
        v = 0.0
    return -v if neg else v

# ======================================================================================
# Low-level SQL + pagination for any entity
# ======================================================================================

def _qbo_query(conn: QuickBooksConnection, sql: str) -> dict:
    url     = f"{_qbo_base(conn)}/v3/company/{conn.realm_id}/query"
    headers = {"Accept": "application/json", "Authorization": f"Bearer {conn.access_token}"}
    params  = {"query": sql, "minorversion": "75"}
    r = requests.get(url, params=params, headers=headers, timeout=60)
    r.raise_for_status()
    return r.json()

def _qbo_query_iter(conn: QuickBooksConnection, base_sql: str, page_size: int = 1000):
    start = 1
    while True:
        sql = f"{base_sql} STARTPOSITION {start} MAXRESULTS {page_size}"
        data = _qbo_query(conn, sql)
        qresp = data.get("QueryResponse") if isinstance(data, dict) else {}
        rows = None
        for k, v in (qresp or {}).items():
            if isinstance(v, list):
                rows = v
                break
        rows = rows or []
        if not rows:
            break
        yield rows
        if len(rows) < page_size:
            break
        start += page_size

# ======================================================================================
# Full-sync: dump ALL entities into qbo_entities (+ log)
# ======================================================================================

_TXN_ENTITIES = [
    "Invoice", "SalesReceipt", "CreditMemo", "Payment", "RefundReceipt",
    "Bill", "VendorCredit", "Purchase", "PurchaseOrder", "TimeActivity",
    "JournalEntry", "Deposit", "Transfer", "Estimate", "InventoryAdjustment",
]
_MASTER_ENTITIES = [
    "Customer", "Vendor", "Employee", "Item", "Account", "Class", "Department",
    "TaxCode", "Term",
]

def _to_date(s: str | None) -> date | None:
    if not s:
        return None
    try:
        if len(s) == 7:  # YYYY-MM
            y, m = [int(x) for x in s.split("-")]
            return date(y, m, 1)
        return datetime.strptime(s, "%Y-%m-%d").date()
    except Exception:
        return None

def _normalize_for_index(entity: str, obj: dict) -> dict:
    txn_date = None
    doc_num  = None
    name     = None
    total    = None

    raw_date = obj.get("TxnDate") or obj.get("MetaData", {}).get("CreateTime")
    if raw_date:
        try:
            txn_date = datetime.strptime(raw_date[:10], "%Y-%m-%d").date()
        except Exception:
            txn_date = None

    doc_num = obj.get("DocNumber") or obj.get("FullyQualifiedName") or obj.get("Name")

    if "DisplayName" in obj:
        name = obj.get("DisplayName")
    elif isinstance(obj.get("CustomerRef"), dict):
        name = obj["CustomerRef"].get("name")
    elif isinstance(obj.get("VendorRef"), dict):
        name = obj["VendorRef"].get("name")
    elif isinstance(obj.get("EntityRef"), dict):
        name = obj["EntityRef"].get("name")

    total = obj.get("TotalAmt") or obj.get("Amount") or obj.get("Balance")

    return {
        "txn_date": txn_date,
        "doc_number": str(doc_num) if doc_num is not None else None,
        "name": name,
        "total_amount": float(total) if isinstance(total, (int, float, str)) and str(total).strip() != "" else None,
    }

def _upsert_entity(realm_id: str, entity: str, obj: dict) -> None:
    qbo_id = str(obj.get("Id") or obj.get("id") or "")
    if not qbo_id:
        return
    row = QboEntity.query.filter_by(realm_id=realm_id, entity_type=entity, qbo_id=qbo_id).first()
    if row is None:
        row = QboEntity(realm_id=realm_id, entity_type=entity, qbo_id=qbo_id, raw_json=json.dumps(obj))

    idx = _normalize_for_index(entity, obj)
    row.txn_date     = idx["txn_date"]
    row.doc_number   = idx["doc_number"]
    row.name         = idx["name"]
    row.total_amount = idx["total_amount"]
    row.raw_json     = json.dumps(obj)
    db.session.add(row)

@qbo_bp.post("/full-sync")
@login_required
def full_sync():
    """
    Body example:
    {
      "from": "YYYY-MM" | "YYYY-MM-DD",  // optional for masters; used for transactions
      "to":   "YYYY-MM" | "YYYY-MM-DD",
      "realmId": "...",                  // optional (pick latest if omitted)
      "entities": ["Invoice","Customer",...], // optional; default = MASTER+TXN
      "page_size": 1000
    }
    """
    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}

    realm_id = (data.get("realmId") or "").strip() or None
    q = QuickBooksConnection.query.filter_by(user_id=user_id)
    if realm_id:
        q = q.filter_by(realm_id=realm_id)
    conn = q.order_by(QuickBooksConnection.updated_at.desc()).first()
    if not conn:
        return jsonify({"error": "No QBO connection"}), 400

    auth = _make_auth_client()
    auth.access_token  = conn.access_token
    auth.refresh_token = conn.refresh_token
    _ensure_valid_token(conn, auth)

    entities  = data.get("entities") or (_MASTER_ENTITIES + _TXN_ENTITIES)
    page_size = int(data.get("page_size") or 1000)
    from_d   = _to_date(data.get("from"))
    to_d     = _to_date(data.get("to"))

    # default range for transactions: this month
    if not from_d or not to_d:
        today = datetime.utcnow().date()
        from_d = date(today.year, today.month, 1)
        to_d   = date(today.year, today.month, monthrange(today.year, today.month)[1])

    stats = {}
    for entity in entities:
        pulled = 0
        if entity in _TXN_ENTITIES:
            where = f" WHERE TxnDate >= '{from_d.isoformat()}' AND TxnDate <= '{to_d.isoformat()}'"
            base_sql = f"SELECT * FROM {entity}{where} ORDER BY TxnDate"
        else:
            base_sql = f"SELECT * FROM {entity} ORDER BY MetaData.CreateTime"

        for batch in _qbo_query_iter(conn, base_sql, page_size=page_size):
            for obj in batch:
                _upsert_entity(conn.realm_id, entity, obj)
                pulled += 1
        stats[entity] = pulled
        db.session.commit()

    log = QboSyncLog(
        realm_id=conn.realm_id,
        ran_at=datetime.utcnow(),
        from_date=from_d,
        to_date=to_d,
        entities=",".join(entities),
        stats_json=json.dumps(stats),
    )
    db.session.add(log)
    db.session.commit()

    return jsonify({
        "ok": True,
        "realmId": conn.realm_id,
        "from": from_d.isoformat(),
        "to": to_d.isoformat(),
        "stats": stats
    })

# ======================================================================================
# Browse stored entities (filters + paging)
# ======================================================================================

@qbo_bp.get("/entities")
@login_required
def list_entities():
    """
    /api/qbo/entities?entity_type=Invoice&from=2025-01&to=2025-06&realmId=...&q=abc&page=1&limit=100
    """
    user_id = get_jwt_identity()
    realm_id = request.args.get("realmId")
    qconn = QuickBooksConnection.query.filter_by(user_id=user_id)
    if realm_id:
        qconn = qconn.filter_by(realm_id=realm_id)
    conn = qconn.order_by(QuickBooksConnection.updated_at.desc()).first()
    if not conn:
        return jsonify({"error": "No QBO connection"}), 400
    if not realm_id:
        realm_id = conn.realm_id

    entity_type = request.args.get("entity_type")
    search_text = (request.args.get("q") or "").strip().lower()
    from_d = _to_date(request.args.get("from"))
    to_d   = _to_date(request.args.get("to"))
    page  = max(int(request.args.get("page", 1)), 1)
    limit = max(min(int(request.args.get("limit", 100)), 1000), 1)

    query = QboEntity.query.filter(QboEntity.realm_id == realm_id)
    if entity_type:
        query = query.filter(QboEntity.entity_type == entity_type)
    if from_d:
        query = query.filter(QboEntity.txn_date >= from_d)
    if to_d:
        query = query.filter(QboEntity.txn_date <= to_d)
    if search_text:
        like = f"%{search_text}%"
        query = query.filter(
            (QboEntity.doc_number.ilike(like)) | (QboEntity.name.ilike(like))
        )

    total = query.count()
    rows = (query.order_by(QboEntity.txn_date.asc(), QboEntity.id.asc())
                 .offset((page - 1) * limit).limit(limit).all())

    return jsonify({
        "total": total,
        "page": page,
        "limit": limit,
        "items": [r.to_dict() for r in rows],
    })

# ======================================================================================
# (Optional) monthly rollup route still available for the UI button
# ======================================================================================

@qbo_bp.post("/periods/sync")
@login_required
def periods_sync():
    def parse_month(s: str) -> date:
        s = (s or "").strip()
        for fmt in ("%Y-%m", "%Y-%m-%d", "%B %Y"):
            try:
                dt = datetime.strptime(s, fmt)
                return date(dt.year, dt.month, 1)
            except Exception:
                pass
        raise ValueError(f"Bad month format: {s}")

    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    realm_id = (data.get("realmId") or "").strip() or None

    q = QuickBooksConnection.query.filter_by(user_id=user_id)
    if realm_id:
        q = q.filter_by(realm_id=realm_id)
    conn = q.order_by(QuickBooksConnection.updated_at.desc()).first()
    if not conn:
        return jsonify({"error": "No QBO connection"}), 400

    auth = _make_auth_client()
    auth.access_token  = conn.access_token
    auth.refresh_token = conn.refresh_token
    _ensure_valid_token(conn, auth)

    start_m = parse_month(data.get("from"))
    end_m   = parse_month(data.get("to"))
    if end_m < start_m:
        start_m, end_m = end_m, start_m

    cur = start_m
    created = 0
    while cur <= end_m:
        y, m = cur.year, cur.month
        first = date(y, m, 1)
        last  = date(y, m, monthrange(y, m)[1])

        try:
            pl = _qbo_report(conn, "ProfitAndLoss", {"start_date": first.isoformat(), "end_date": last.isoformat()})
        except Exception:
            pl = {}
        net_income = 0.0
        try:
            cols = (pl.get("Rows", {}) or {}).get("Row", [])[-1].get("Summary", {}).get("ColData", [])
            if cols:
                net_income = _parse_amount(cols[-1].get("value"))
        except Exception:
            pass

        row = QboPeriodMetric.query.filter_by(realm_id=conn.realm_id, sheet="QBO (BS+PL)", as_of_date=last).first()
        if row is None:
            row = QboPeriodMetric(realm_id=conn.realm_id, sheet="QBO (BS+PL)", as_of_date=last)
        prev = QboPeriodMetric.query.filter(
            QboPeriodMetric.realm_id == conn.realm_id,
            QboPeriodMetric.sheet == "QBO (BS+PL)",
            QboPeriodMetric.as_of_date < last
        ).order_by(QboPeriodMetric.as_of_date.desc()).first()

        row.beginning_balance = prev.ending_balance if prev and prev.ending_balance is not None else row.beginning_balance
        row.ending_balance = float(net_income)
        db.session.add(row)
        db.session.commit()
        created += 1

        cur = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)

    return jsonify({"ok": True, "realmId": conn.realm_id, "created": created})
