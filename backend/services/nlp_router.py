import re
from typing import Dict, Optional
from datetime import datetime

# ---- Specific KPI / calc intents (optional hooks if you add KPIs again) ----
ROI_RE = re.compile(r"\b(roi|return\s+on\s+investment)\b", re.I)
ENDING_BALANCE_LATEST_RE = re.compile(
    r"\b(latest|current|this\s*(month|q(uarter)?|period))\b.*ending\s+balance|\bending\s+balance\b.*\b(latest|current)\b",
    re.I,
)
ENDING_BALANCE_TOTAL_RE = re.compile(r"\b(total|sum)\b.*\bending\s+balance\b|\bending\s+balance\s+total\b", re.I)

# Aliases
CURRENT_VALUE_RE = re.compile(r"\b(current\s+value|nav|net\s+asset\s+value)\b", re.I)
INITIAL_VALUE_RE = re.compile(r"\b(initial|starting|beginning)\s+value\b", re.I)

# Explain
EXPLAIN_RE = re.compile(r"^\s*explain\s+(.+)", re.I)

# Numbers / currency
NUM_RE = re.compile(r"(-?\d+(?:\.\d+)?)")
CURRENCY_RE = re.compile(r"[$€£₹]|usd|eur|gbp|inr", re.I)

# Dates like 6/30/2025, 06-30-25, 2025-06-30
DATE_RE = re.compile(
    r"\b(?:(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})|(\d{4})-(\d{1,2})-(\d{1,2}))\b"
)

# Broad “financial topic” lexicon for domain tagging
FIN_TOKENS = re.compile(
    r"\b(ending\s+balance|beginning\s+balance|nav|irr|roi|multiple|moic|tvpi|dpi|commit(ed|ment)|"
    r"capital\s+call|distribution|cash\s+(in|out|flow)|contribution|valuation|fair\s+value|"
    r"aum|as\s+of|q\d|quarter|year[-\s]*to[-\s]*date|since\s+inception|fund|invest(or|ment)|"
    r"security|returns?|gain|loss|unrealized|realized|preferred\s+return|carried\s+interest|fee[s]?)\b",
    re.I,
)

def _domain_tag(msg: str) -> str:
    if not msg:
        return "general"
    if FIN_TOKENS.search(msg) or CURRENCY_RE.search(msg):
        return "financial"
    nums = NUM_RE.findall(msg)
    if len(nums) >= 2:
        return "financial"
    return "general"

def _parse_date(msg: str) -> Optional[str]:
    m = DATE_RE.search(msg or "")
    if not m:
        return None
    if m.group(1):  # mm/dd/yyyy or mm-dd-yy
        mm, dd, yy = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if yy < 100:
            yy += 2000 if yy < 70 else 1900
        try:
            return datetime(yy, mm, dd).date().isoformat()
        except Exception:
            return None
    else:  # yyyy-mm-dd
        yy, mm, dd = int(m.group(4)), int(m.group(5)), int(m.group(6))
        try:
            return datetime(yy, mm, dd).date().isoformat()
        except Exception:
            return None

def parse_intent(msg: str) -> Dict:
    # example: "explain preferred return"
    m = EXPLAIN_RE.search(msg or "")
    if m:
        return {"action": "explain_formula", "topic": m.group(1), "domain": _domain_tag(msg)}

    # example: "6/30/2025 ending balance"
    iso = _parse_date(msg or "")
    if iso and re.search(r"\bending\s+balance\b", msg or "", re.I):
        return {"action": "ending_balance_on_date_total", "date": iso, "domain": "financial"}

    # common KPI phrasings (only used if you re-enable KPI calculators)
    if CURRENT_VALUE_RE.search(msg or "") or ENDING_BALANCE_LATEST_RE.search(msg or ""):
        return {"action": "ending_balance_latest_total", "domain": "financial"}

    if ENDING_BALANCE_TOTAL_RE.search(msg or ""):
        return {"action": "ending_balance_total", "domain": "financial"}

    if ROI_RE.search(msg or ""):
        nums = [float(x) for x in NUM_RE.findall(msg or "")]
        initial, current = (nums[0], nums[1]) if len(nums) >= 2 else (None, None)
        return {"action": "roi", "initial": initial, "current": current, "domain": "financial"}

    if INITIAL_VALUE_RE.search(msg or ""):
        return {"action": "initial_value", "domain": "financial"}

    return {
        "action": "nlp",
        "domain": _domain_tag(msg),
        "explanation": "Ask for Current Value (latest Ending Balance), Ending Balance total, ROI, or any value in your workbook.",
    }
