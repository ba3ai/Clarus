import re
from datetime import datetime
from typing import Dict, Any, Optional

# Keywords
BALANCE_WORDS   = r"(ending\s*balance|beginning\s*balance|balance|nav|value|valuation)"
GROWTH_WORDS    = r"(growth|increase|decrease|change|return|performance)"
GAIN_LOSS_WORDS = r"(gain|loss|p&l|profit|unrealized|realized)"
INVEST_WORDS    = r"(investment|invested|capital|contribution|where.*invest(ed|ments?)|allocation|exposure)"

FINANCE_WORDS = re.compile(
    rf"\b({BALANCE_WORDS}|{GROWTH_WORDS}|{GAIN_LOSS_WORDS}|{INVEST_WORDS}|roi|irr|moic|fees?)\b",
    re.I,
)

MONTH_RE = re.compile(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\b", re.I)
YEAR_RE  = re.compile(r"\b(20\d{2}|19\d{2})\b")

def _parse_date(msg: str) -> Optional[str]:
    m = MONTH_RE.search(msg or "")
    if not m: 
        return None
    try:
        parts = m.group(0).split()
        month = parts[0][:3].title()
        year = int(parts[1])
        dt = datetime.strptime(f"{month} {year}", "%b %Y")
        # month-end day
        if month == "Feb":
            day = 29 if (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)) else 28
        else:
            # index of month in short list
            idx = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split().index(month)
            day = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][idx]
        return dt.replace(day=day).date().isoformat()
    except Exception:
        return None

def _kind(msg: str) -> Optional[str]:
    txt = (msg or "").lower()
    if re.search(BALANCE_WORDS, txt, re.I):
        return "balance"
    if re.search(GROWTH_WORDS, txt, re.I):
        return "growth"
    if re.search(GAIN_LOSS_WORDS, txt, re.I):
        return "gain_loss"
    if re.search(INVEST_WORDS, txt, re.I):
        return "investments"
    return None

def parse_intent(msg: str) -> Dict[str, Any]:
    """Return {domain, kind?, date?}. Domain=financial if any finance hints present (or a month/year is present)."""
    if not msg or not msg.strip():
        return {"domain": "general"}
    is_fin = bool(FINANCE_WORDS.search(msg) or YEAR_RE.search(msg) or MONTH_RE.search(msg))
    if not is_fin:
        return {"domain": "unknown"}
    iso = _parse_date(msg)
    out: Dict[str, Any] = {"domain": "financial"}
    k = _kind(msg)
    if k:
        out["kind"] = k
    if iso:
        out["date"] = iso
    return out
