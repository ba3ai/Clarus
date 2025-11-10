# backend/services/chat_history.py
import os, json, re
from typing import List, Dict

ROOT = os.getenv("CHAT_HISTORY_DIR", "./chat_history")


ROOT = os.getenv("CHAT_HISTORY_DIR", "./chat_history")

def _safe(tenant: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", tenant or "anon")

def _path(tenant: str, conv_id: str) -> str:
    safe_tenant = _safe(tenant)
    os.makedirs(os.path.join(ROOT, safe_tenant), exist_ok=True)
    return os.path.join(ROOT, safe_tenant, f"{conv_id}.jsonl")


def _path(tenant: str, conv_id: str) -> str:
    safe_tenant = tenant.replace("/", "_")
    os.makedirs(os.path.join(ROOT, safe_tenant), exist_ok=True)
    return os.path.join(ROOT, safe_tenant, f"{conv_id}.jsonl")

def append_turn(tenant: str, conv_id: str, role: str, content: str) -> None:
    p = _path(tenant, conv_id)
    with open(p, "a", encoding="utf-8") as f:
        f.write(json.dumps({"role": role, "content": content}) + "\n")

def load_history(tenant: str, conv_id: str, limit: int = 20) -> List[Dict[str, str]]:
    p = _path(tenant, conv_id)
    if not os.path.exists(p): return []
    with open(p, "r", encoding="utf-8") as f:
        lines = [json.loads(x) for x in f.readlines()]
    return lines[-limit:]
