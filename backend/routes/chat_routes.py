# backend/routes/chat_routes.py
from __future__ import annotations

import os, re, json, uuid, difflib
from datetime import datetime
from typing import Any, Dict, Optional, List, Tuple

from flask import Blueprint, request, jsonify, url_for
from flask_login import current_user, login_required

from backend.extensions import db
from backend.services.openai_client import LLMClient
from urllib.parse import quote

# ---- Models ----
from backend.models import (
    Investor,
    Investment,
    PortfolioInvestmentValue,
    Document,
    DocumentShare,
    User as AppUser,
)

# Optional tables (may or may not exist)
try:
    from backend.models_snapshot import InvestorPeriodBalance
except Exception:
    InvestorPeriodBalance = None  # type: ignore

try:
    from backend.models_snapshot import InvestorBalance
except Exception:
    InvestorBalance = None  # type: ignore

chat_bp = Blueprint("chat_bp", __name__, url_prefix="/api")
llm = LLMClient()

# ---- Config ----
CHAT_HISTORY_DIR = os.getenv("CHAT_HISTORY_DIR", "./chat_history")
MAX_TURNS        = int(os.getenv("CHAT_HISTORY_MAX_TURNS", "2"))
GEN_MODEL        = os.getenv("CHAT_GEN_MODEL", "gpt-4o-mini")
CHAT_DEBUG       = os.getenv("CHAT_DEBUG", "0") not in {"0", "false", "False", ""}

UPLOAD_ROOTS     = [p for p in (os.getenv("UPLOAD_ROOTS") or "").split(",") if p.strip()]
if not UPLOAD_ROOTS:
    UPLOAD_ROOTS = [
        os.path.abspath("./uploads"),
        os.path.abspath("./storage/uploads"),
        os.path.abspath("./backend/uploads"),
    ]

def _dprint(*args):
    if CHAT_DEBUG:
        print("[chat]", *args)

# =================== helpers ===================
def _safe_tenant(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", s or "anon")

def _hist_path(tenant: str, conv_id: str) -> str:
    root = os.path.join(CHAT_HISTORY_DIR, _safe_tenant(tenant))
    os.makedirs(root, exist_ok=True)
    return os.path.join(root, f"{conv_id}.jsonl")

def _append_turn(tenant: str, conv_id: str, role: str, content: str) -> None:
    p = _hist_path(tenant, conv_id)
    lines: List[Dict[str, str]] = []
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8") as f:
            lines = [json.loads(x) for x in f.readlines()]
    lines.append({"role": role, "content": content})
    lines = lines[-MAX_TURNS:]
    with open(p, "w", encoding="utf-8") as f:
        for obj in lines:
            f.write(json.dumps(obj) + "\n")

def _normalize_ws(s: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())

# ---------- identity (cookie-based only) ----------
def _get_user_safe() -> Dict[str, Any]:
    """
    Build a profile dict from flask_login.current_user.
    We do NOT parse Authorization/JWT. We only trust the cookie session.
    """
    base: Dict[str, Any] = {}
    try:
        if getattr(current_user, "is_authenticated", False):
            base = {
                "id": getattr(current_user, "id", None),
                "email": getattr(current_user, "email", None),
                "username": getattr(current_user, "username", None),
                "name": getattr(current_user, "name", None),
                "first_name": getattr(current_user, "first_name", None),
                "last_name": getattr(current_user, "last_name", None),
                "user_type": getattr(current_user, "user_type", "Investor"),
            }
    except Exception:
        base = {}

    # Allow non-authoritative body hints to fill blanks only
    hint = (request.get_json(silent=True) or {}).get("user") or {}
    merged = dict(base)
    for k in ("id","email","username","name","first_name","last_name","user_type"):
        v = hint.get(k)
        if v and not merged.get(k):
            merged[k] = v
    if not merged.get("user_type"):
        merged["user_type"] = "Investor"
    return merged

def _strict_self_investor(user: Dict[str, Any]) -> Optional[Investor]:
    """
    Link the session user to an Investor:
    1) account_user_id, 2) email/full name, 3) legacy owner_id.
    """
    try:
        uid = user.get("id")
        if uid:
            inv = Investor.query.filter_by(account_user_id=uid).first()
            if inv: return inv
        email = user.get("email")
        if email:
            inv = Investor.query.filter(Investor.email.ilike(email)).first()
            if inv: return inv
        fullname = _normalize_ws(user.get("name") or f"{user.get('first_name','')} {user.get('last_name','')}")
        if fullname:
            inv = Investor.query.filter(Investor.name.ilike(fullname)).first()
            if inv: return inv
        if uid:
            inv = Investor.query.filter_by(owner_id=uid).first()
            if inv: return inv
    except Exception:
        pass
    return None

def _resolve_user_id_from_profile(profile: Dict[str, Any]) -> Optional[int]:
    """
    BEST-EFFORT: resolve AppUser.id from the current session profile.
    """
    try:
        if profile.get("id"):
            uid = int(profile["id"])
            if AppUser.query.get(uid):
                return uid
    except Exception:
        pass

    email = (profile.get("email") or "").strip()
    username = (profile.get("username") or "").strip()
    if email or username:
        q = AppUser.query
        if email:
            q = q.filter(AppUser.email.ilike(email))
        else:
            q = q.filter(AppUser.username.ilike(username))
        u = q.first()
        if u:
            return int(u.id)

    fname = (profile.get("first_name") or "").strip()
    lname = (profile.get("last_name") or "").strip()
    if fname or lname:
        q = AppUser.query
        if fname:
            q = q.filter(db.func.lower(AppUser.first_name) == fname.lower())
        if lname:
            q = q.filter(db.func.lower(AppUser.last_name) == lname.lower())
        u = q.first()
        if u:
            return int(u.id)

    inv = _strict_self_investor(profile)
    if inv and inv.account_user_id:
        return int(inv.account_user_id)

    return None

# ---------- LLM gateway ----------
def _ask_llm(system: str, context_obj: Dict[str, Any], question: str) -> str:
    ctx_json = json.dumps(context_obj, ensure_ascii=False)
    prompt = f"""{system}

CONTEXT (JSON; objects shaped like
  {{ "table": "<TableName>", "columns": {{...}}, "row": {{col:value,...}} }}
  and/or "series", "matches", "selected", etc.):
{ctx_json}

USER MESSAGE:
{question}

RESPONSE RULES:
- Use only the information present in CONTEXT when citing numbers, names, dates, or files.
- Be concise and precise. Prefer one short paragraph; bullets only if helpful.
"""
    return llm.chat(prompt, model=GEN_MODEL)

def _to_float(x: Any) -> Optional[float]:
    try:
        if x is None: return None
        return float(x)
    except Exception:
        return None

# ---------- filename normalization / scoring ----------
def _norm_name(s: str) -> str:
    s = (s or "").lower().strip()
    s = re.sub(r"\.(pdf|xlsx|xls|csv|docx?)$", "", s)
    s = s.replace("_", " ").replace("-", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s

def _score(q: str, cand: str) -> float:
    qn, cn = _norm_name(q), _norm_name(cand)
    if not qn or not cn:
        return 0.0
    if qn in cn or cn in qn:
        return 0.99
    return difflib.SequenceMatcher(None, qn, cn).ratio()

def _keywords(s: str) -> List[str]:
    tokens = re.findall(r"[A-Za-z0-9_]+", s or "")
    stop = {"a","an","the","for","to","of","in","on","at","file","files","please","give","show","me","my","all"}
    return [t.lower() for t in tokens if t.lower() not in stop and len(t) >= 2]

# ---------- Investor identity for chat ----------
def _resolve_investor_for_request(user: Dict[str, Any], body: Dict[str, Any]) -> Optional[Investor]:
    """
    Priority:
      A) if body.investor_id belongs to this user (or user is admin), use it
      B) else map session user -> investor via account_user_id/email/name
      C) else legacy owner_id mapping
    """
    try:
        inv_id = body.get("investor_id") or body.get("investor", {}).get("id")
        if inv_id:
            inv = Investor.query.get(int(inv_id))
            if inv:
                is_admin = str(user.get("user_type", "")).lower() == "admin"
                uid = user.get("id")
                if is_admin or (uid and (inv.account_user_id == uid or getattr(inv, "owner_id", None) == uid)):
                    return inv
        inv = _strict_self_investor(user)
        if inv:
            return inv
        uid = user.get("id")
        if uid:
            inv = Investor.query.filter_by(owner_id=uid).first()
            if inv:
                return inv
    except Exception:
        pass
    return None

def _build_download_url(doc_id: int, original_name: Optional[str] = None) -> Optional[str]:
    try:
        base = url_for("documents.download_document", doc_id=doc_id, _external=True)
        if original_name:
            return f"{base}?filename={quote(original_name)}"
        return base
    except Exception:
        return None

def _match_by_keywords(query: str, docs: List[Document]) -> List[Tuple[Document,float]]:
    if re.search(r"\ball\b", query, flags=re.IGNORECASE):
        return [(d, 1.0) for d in docs]
    kws = _keywords(query)
    if not kws:
        return []
    matches: List[Tuple[Document,float]] = []
    for d in docs:
        title = d.title or ""
        orig  = d.original_name or ""
        hay   = f"{title} {orig}".lower()
        hits  = sum(1 for k in kws if k in hay)
        if hits > 0:
            fuzzy = max(_score(query, title), _score(query, orig))
            score = min(1.0, 0.30 + 0.12*hits + 0.58*fuzzy)
            matches.append((d, score))
    matches.sort(key=lambda x: (x[1], getattr(x[0], "uploaded_at", datetime.min)), reverse=True)
    return matches

def _fetch_shared_docs_for_user_id(uid: int, limit: int = 400) -> List[Document]:
    return (
        db.session.query(Document)
        .join(DocumentShare, DocumentShare.document_id == Document.id)
        .filter(DocumentShare.investor_user_id == uid)
        .order_by(Document.uploaded_at.desc())
        .limit(limit)
        .all()
    )

# =================== Intent 1: Balance Data ===================
def handle_balance_intent(user: Dict[str, Any], message: str, body: Dict[str, Any]) -> Dict[str, Any]:
    inv: Optional[Investor] = _resolve_investor_for_request(user, body)
    if not inv:
        ctx = {"ok": False, "issue": "no_investor_identity"}
        sys = "Explain the investor for this session couldn't be identified and suggest reloading the dashboard."
        return {"answer": _ask_llm(sys, ctx, message), "context": ctx}

    records: List[Dict[str, Any]] = []

    try:
        if InvestorPeriodBalance:
            cols = {
                "period_date": "date",
                "beginning_balance": "number",
                "ending_balance": "number",
                "contributions": "number",
                "distributions": "number",
                "fees": "number",
                "unrealized_gain_loss": "number",
                "management_fees": "number",
            }
            rows = (InvestorPeriodBalance.query
                    .filter(InvestorPeriodBalance.investor.ilike(f"%{inv.name}%"))
                    .order_by(InvestorPeriodBalance.period_date.desc())
                    .limit(48).all())
            for r in rows:
                records.append({
                    "table": "InvestorPeriodBalance",
                    "columns": cols,
                    "row": {
                        "period_date": str(r.period_date),
                        "beginning_balance": _to_float(getattr(r, "beginning_balance", None)),
                        "ending_balance": _to_float(getattr(r, "ending_balance", None)),
                        "contributions": _to_float(getattr(r, "contributions", None)),
                        "distributions": _to_float(getattr(r, "distributions", None)),
                        "fees": _to_float(getattr(r, "fees", None)),
                        "unrealized_gain_loss": _to_float(getattr(r, "unrealized_gain_loss", None)),
                        "management_fees": _to_float(getattr(r, "management_fees", None)),
                    }
                })
    except Exception:
        pass

    try:
        if InvestorBalance:
            cols = {
                "as_of_date": "date",
                "beginning_balance": "number",
                "ending_balance": "number",
                "contributions": "number",
                "distributions": "number",
                "fees": "number",
                "unrealized_gain_loss": "number",
                "management_fees": "number",
            }
            rows = (InvestorBalance.query
                    .filter(InvestorBalance.investor_id == inv.id)
                    .order_by(InvestorBalance.as_of_date.desc())
                    .limit(48).all())
            for r in rows:
                records.append({
                    "table": "InvestorBalance",
                    "columns": cols,
                    "row": {
                        "as_of_date": str(getattr(r, "as_of_date", "")),
                        "beginning_balance": _to_float(getattr(r, "beginning_balance", None)),
                        "ending_balance": _to_float(getattr(r, "ending_balance", None)),
                        "contributions": _to_float(getattr(r, "contributions", None)),
                        "distributions": _to_float(getattr(r, "distributions", None)),
                        "fees": _to_float(getattr(r, "fees", None)),
                        "unrealized_gain_loss": _to_float(getattr(r, "unrealized_gain_loss", None)),
                        "management_fees": _to_float(getattr(r, "management_fees", None)),
                    }
                })
    except Exception:
        pass

    try:
        cols = {"investment": "text", "as_of": "date", "value": "number"}
        sub = (db.session.query(
                PortfolioInvestmentValue.investment_id,
                db.func.max(PortfolioInvestmentValue.as_of_date).label("mx")
              )
              .group_by(PortfolioInvestmentValue.investment_id).subquery())
        pivs = (PortfolioInvestmentValue.query
                .join(sub, (sub.c.investment_id == PortfolioInvestmentValue.investment_id) &
                           (sub.c.mx == PortfolioInvestmentValue.as_of_date))
                .all())
        for r in pivs:
            invt = Investment.query.get(r.investment_id)
            if not invt: continue
            records.append({
                "table": "PortfolioInvestmentValue",
                "columns": cols,
                "row": {"investment": invt.name, "as_of": str(r.as_of_date), "value": _to_float(r.value)}
            })
    except Exception:
        pass

    ctx = {"ok": True, "investor": {"id": inv.id, "name": inv.name}, "records": records, "question": message}
    sys = (
        "You are Clarus. From CONTEXT.records (each has table, columns, row), identify exactly which metric the user asked for "
        "(beginning/ending/current balance, unrealized gain/loss, management fees, total investment value). "
        "Choose the most recent matching row and answer concisely with the number and date."
    )
    return {"answer": _ask_llm(sys, ctx, message), "context": ctx}

# =================== Intent 2: File Retrieval ===================
def _extract_file_query(message: str) -> str:
    low = (message or "").strip()
    m = re.search(r"[\"']([^\"']]{2,200})[\"']", low)
    if m:
        return re.sub(r"\bfile(s)?\b$", "", m.group(1).strip(), flags=re.IGNORECASE).strip()
    cues = ["called", "named", "which is", "titled", "name is"]
    for cue in cues:
        m = re.search(rf"{cue}\s+([A-Za-z0-9 _\-\.\(\)]+)", low, flags=re.IGNORECASE)
        if m:
            text = re.split(r"[\.!\?]", m.group(1))[0]
            return re.sub(r"\bfile(s)?\b$", "", text.strip(), flags=re.IGNORECASE).strip()
    m = re.search(r"([A-Za-z0-9 _\-\.]+)\s+file\b", low, flags=re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return low

def _find_on_disk(stored_name: str, original_name: Optional[str]) -> Optional[str]:
    candidates = [stored_name] + ([original_name] if original_name else [])
    for root in UPLOAD_ROOTS:
        try:
            direct = os.path.join(root, stored_name)
            if os.path.isfile(direct): return os.path.abspath(direct)
            for cand in candidates:
                if not cand: continue
                for dirpath, _dirnames, filenames in os.walk(root):
                    if cand in filenames:
                        return os.path.abspath(os.path.join(dirpath, cand))
        except Exception:
            continue
    return None

def _build_download_url(doc_id: int, original_name: Optional[str] = None) -> Optional[str]:
    try:
        base = url_for("documents.download_document", doc_id=doc_id, _external=True)
        if original_name:
            return f"{base}?filename={quote(original_name)}"
        return base
    except Exception:
        return None

def _match_by_keywords(query: str, docs: List[Document]) -> List[Tuple[Document,float]]:
    if re.search(r"\ball\b", query, flags=re.IGNORECASE):
        return [(d, 1.0) for d in docs]
    kws = _keywords(query)
    if not kws:
        return []
    matches: List[Tuple[Document,float]] = []
    for d in docs:
        title = d.title or ""
        orig  = d.original_name or ""
        hay   = f"{title} {orig}".lower()
        hits  = sum(1 for k in kws if k in hay)
        if hits > 0:
            fuzzy = max(_score(query, title), _score(query, orig))
            score = min(1.0, 0.30 + 0.12*hits + 0.58*fuzzy)
            matches.append((d, score))
    matches.sort(key=lambda x: (x[1], getattr(x[0], "uploaded_at", datetime.min)), reverse=True)
    return matches

def _fetch_shared_docs_for_user_id(uid: int, limit: int = 400) -> List[Document]:
    return (
        db.session.query(Document)
        .join(DocumentShare, DocumentShare.document_id == Document.id)
        .filter(DocumentShare.investor_user_id == uid)
        .order_by(Document.uploaded_at.desc())
        .limit(limit)
        .all()
    )

def handle_file_intent(user: Dict[str, Any], message: str, body: Dict[str, Any]) -> Dict[str, Any]:
    target_uid: Optional[int] = _resolve_user_id_from_profile(user)
    _dprint("resolved AppUser.id =", target_uid)

    if not target_uid:
        ctx = {"ok": False, "issue": "no_target_user_id"}
        sys = "Explain we couldn't identify the user account for file sharing. Suggest reloading the dashboard."
        return {"answer": _ask_llm(sys, ctx, message), "context": ctx}

    try:
        docs: List[Document] = _fetch_shared_docs_for_user_id(target_uid)
    except Exception:
        docs = []

    if not docs:
        inv = _strict_self_investor(user)
        if inv and inv.account_user_id and int(inv.account_user_id) != int(target_uid):
            docs = _fetch_shared_docs_for_user_id(int(inv.account_user_id))

    query = _extract_file_query(message)
    keyword_matches = _match_by_keywords(query, docs)

    chosen = None
    matches: List[Dict[str, Any]] = []
    if keyword_matches:
        for d, sc in keyword_matches[:8]:
            matches.append({
                "document_id": d.id,
                "title": d.title or "",
                "original_name": d.original_name or "",
                "score": round(sc, 3),
                "download_url": _build_download_url(d.id),
                "local_path": _find_on_disk(d.stored_name, d.original_name),
            })
        chosen = keyword_matches[0][0]
    else:
        best, best_score = None, 0.0
        for d in docs:
            title = d.title or ""
            orig  = d.original_name or ""
            s = max(_score(query, title), _score(query, orig))
            if s > best_score:
                best, best_score = d, s
        if best and best_score >= 0.65:
            chosen = best
            matches.append({
                "document_id": best.id,
                "title": best.title or "",
                "original_name": best.original_name or "",
                "score": round(best_score, 3),
                "download_url": _build_download_url(best.id),
                "local_path": _find_on_disk(best.stored_name, best.original_name),
            })

    out_ctx: Dict[str, Any] = {
        "query": query,
        "matches": matches,
        "selected": matches[0] if matches else None
    }

    sys = (
        "You are Clarus. If CONTEXT.matches has 2+ items, briefly list the files (title/original_name) "
        "with their download_url. If only one exists, present it directly. "
        "If no matches found, say you couldn't find a shared file that matches the request."
    )
    return {"answer": _ask_llm(sys, out_ctx, message), "context": out_ctx}

# =================== Intent 3: Calculation Data ===================
def handle_calc_intent(user: Dict[str, Any], message: str, body: Dict[str, Any]) -> Dict[str, Any]:
    inv: Optional[Investor] = _resolve_investor_for_request(user, body)
    if not inv:
        ctx = {"ok": False, "issue": "no_investor_identity"}
        sys = "Explain the investor couldn't be identified and suggest reloading the dashboard."
        return {"answer": _ask_llm(sys, ctx, message), "context": ctx}

    series_records: List[Dict[str, Any]] = []
    try:
        if InvestorBalance:
            cols = {"date": "date", "contributions": "number", "distributions": "number", "fees": "number", "ending_balance": "number"}
            rows = (InvestorBalance.query
                    .filter(InvestorBalance.investor_id == inv.id)
                    .order_by(InvestorBalance.as_of_date.asc())
                    .all())
            for r in rows:
                series_records.append({
                    "table": "InvestorBalance",
                    "columns": cols,
                    "row": {
                        "date": str(getattr(r, "as_of_date", "")),
                        "contributions": _to_float(getattr(r, "contributions", None)),
                        "distributions": _to_float(getattr(r, "distributions", None)),
                        "fees": _to_float(getattr(r, "fees", None)),
                        "ending_balance": _to_float(getattr(r, "ending_balance", None)),
                    }
                })
    except Exception:
        pass

    if not series_records and InvestorPeriodBalance:
        try:
            cols = {"date": "date", "contributions": "number", "distributions": "number", "fees": "number", "ending_balance": "number"}
            snaps = (InvestorPeriodBalance.query
                     .filter(InvestorPeriodBalance.investor.ilike(f"%{inv.name}%"))
                     .order_by(InvestorPeriodBalance.period_date.asc())
                     .all())
            for r in snaps:
                series_records.append({
                    "table": "InvestorPeriodBalance",
                    "columns": cols,
                    "row": {
                        "date": str(r.period_date),
                        "contributions": _to_float(getattr(r, "contributions", None)),
                        "distributions": _to_float(getattr(r, "distributions", None)),
                        "fees": _to_float(getattr(r, "fees", None)),
                        "ending_balance": _to_float(getattr(r, "ending_balance", None)),
                    }
                })
        except Exception:
            pass

    portfolio_records: List[Dict[str, Any]] = []
    try:
        cols = {"investment": "text", "as_of": "date", "value": "number"}
        sub = (db.session.query(
                PortfolioInvestmentValue.investment_id,
                db.func.max(PortfolioInvestmentValue.as_of_date).label("mx")
              )
              .group_by(PortfolioInvestmentValue.investment_id).subquery())
        pivs = (PortfolioInvestmentValue.query
                .join(sub, (sub.c.investment_id == PortfolioInvestmentValue.investment_id) &
                           (sub.c.mx == PortfolioInvestmentValue.as_of_date))
                .all())
        for r in pivs:
            invt = Investment.query.get(r.investment_id)
            if invt:
                portfolio_records.append({
                    "table": "PortfolioInvestmentValue",
                    "columns": cols,
                    "row": {"investment": invt.name, "as_of": str(r.as_of_date), "value": _to_float(r.value)}
                })
    except Exception:
        pass

    calc_ctx = {"ok": True, "investor": {"id": inv.id, "name": inv.name}, "series": series_records, "portfolio": portfolio_records}
    sys = ("You are Clarus. Using CONTEXT.series, compute requested metrics (ROI, MOIC, IRR/XIRR). Provide numbers with dates. Be concise.")
    return {"answer": _ask_llm(sys, calc_ctx, message), "context": calc_ctx}

# =================== Intent 4: General ===================
def handle_general_intent(message: str) -> Dict[str, Any]:
    sys = "You are Clarus, a helpful assistant. Answer naturally and concisely."
    return {"answer": _ask_llm(sys, {"flow":"general"}, message), "context": {"flow":"general"}}

# =================== Intent Detection ===================
def detect_intent(message: str) -> Dict[str, Any]:
    system = (
        "Classify the user's message into one of four intents: "
        "balance_data (balances/fees/unrealized/total value), "
        "file_retrieval (file/doc/pdf queries), "
        "calculation_data (ROI/MOIC/IRR), "
        "general (everything else). "
        'Respond ONLY with compact JSON like {"type":"balance_data","entities":{}}.'
    )
    raw = llm.chat(f"{system}\n\nMessage: {message}\n\nJSON:", model=GEN_MODEL)
    try:
        obj_m = re.search(r"\{.*\}", raw, flags=re.DOTALL)
        obj = json.loads(obj_m.group(0) if obj_m else raw)
        t = str(obj.get("type","general")).strip().lower()
        ents = obj.get("entities") or {}
    except Exception:
        t, ents = "general", {}
    if t not in {"balance_data","file_retrieval","calculation_data","general"}:
        t = "general"
    return {"type": t, "entities": ents}

# =================== Route ===================
@chat_bp.route("/chat", methods=["POST"])
@login_required
def chat():
    # Cookie session only; if not logged in, Flask-Login will 401 via your unauthorized handler
    data: Dict[str, Any] = request.get_json(silent=True) or {}
    message: str = (data.get("message") or "").strip()
    tenant = _safe_tenant(data.get("tenant") or "default")
    conversation_id = data.get("conversation_id") or uuid.uuid4().hex

    user = _get_user_safe()
    _append_turn(tenant, conversation_id, "user", message)

    intent = detect_intent(message)
    itype = intent["type"]

    if itype == "balance_data":
        result = handle_balance_intent(user, message, data)
    elif itype == "file_retrieval":
        result = handle_file_intent(user, message, data)
    elif itype == "calculation_data":
        result = handle_calc_intent(user, message, data)
    else:
        result = handle_general_intent(message)

    _append_turn(tenant, conversation_id, "assistant", result["answer"])
    return jsonify({
        "type": itype,
        "answer": result["answer"],
        "context": result.get("context"),
        "conversation_id": conversation_id,
        "tenant": tenant
    }), 200
