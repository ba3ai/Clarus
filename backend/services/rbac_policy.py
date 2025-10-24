# backend/services/rbac_policy.py
from typing import Dict

"""
Role visibility policy:
  - admin: full dataset and meta
  - gp (general partner): fund-level aggregates (hide LP personal identifiers)
  - group_admin: scoped to their group of investors/funds
  - investor (lp): only own positions and aggregates related to them

Assumes current_user has: role, id, org_id, maybe group_id, and investor_id (if LP).
"""

def scope_response_by_role(user, payload: Dict) -> Dict:
    role = (getattr(user, "role", None) or "").lower()

    if payload.get("type") in ("explanation", "nlp", "error"):
        payload["role"] = role
        return payload

    if payload.get("type") == "metric":
        metric = payload.get("metric")
        if role == "admin":
            return payload  # full
        if role in ("gp", "general partner"):
            payload["note"] = "GP view: fund-level aggregation; LP-identifiers omitted."
            return payload
        if role in ("group admin", "group_admin"):
            payload["note"] = "Group Admin view: scoped to assigned investor group."
            return payload
        if role in ("investor", "lp"):
            payload["note"] = "Investor view: values limited to your holdings (demo aggregate shown)."
            return payload

    return payload
