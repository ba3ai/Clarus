# backend/services/market_store.py
from datetime import date
from backend.extensions import db
from backend.models import MarketPrice
from backend.services.market_data_providers import get_history_range, PROVIDER as YF_PROVIDER

def _to_date(d):
    return d if isinstance(d, date) else date.fromisoformat(str(d))

def _month_start(d: date) -> date:
    return d.replace(day=1)

def upsert_history(symbol: str, start: str, end: str, interval: str = "1mo") -> int:
    """
    Pull history (monthly by default) and upsert into market_prices,
    collapsing each bar to the FIRST day of the month so each month
    is a unique row (idempotent refreshes).
    """
    rows = get_history_range(symbol, start, end, interval) or []
    n = 0
    sym = symbol.upper()
    for r in rows:
        dt = _month_start(_to_date(r["date"]))  # normalize to month start
        rec = MarketPrice.query.filter_by(symbol=sym, date=dt).one_or_none()
        if rec is None:
            rec = MarketPrice(symbol=sym, date=dt, source=YF_PROVIDER)
        rec.open = r["open"];   rec.high = r["high"];   rec.low = r["low"]
        rec.close = r["close"]; rec.adj_close = r["adj_close"]; rec.volume = r["volume"]
        db.session.add(rec); n += 1
    db.session.commit()
    return n

def _months_ago(d: date, k: int) -> date:
    y, m = d.year, d.month
    m -= k
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1)

def sync_symbol_incremental(symbol: str, months_overlap: int = 2, interval: str = "1mo") -> int:
    """
    Incremental monthly sync. We back up a couple months to safely catch late
    adjustments and ensure idempotence with month-start keys.
    """
    from datetime import date as _date
    today = _date.today()
    last = (MarketPrice.query
            .filter(MarketPrice.symbol == symbol.upper())
            .order_by(MarketPrice.date.desc())
            .first())
    if last and last.date:
        start = _months_ago(last.date.replace(day=1), months_overlap)
    else:
        start = date(1990, 1, 1)
    end = today
    return upsert_history(symbol, start.isoformat(), end.isoformat(), interval)
