# backend/services/market_data_providers.py
import os, math
from datetime import datetime
from typing import Dict, List, Any, Optional

import pandas as pd
import zoneinfo

PROVIDER = os.getenv("YF_PROVIDER", "yfinance").lower()

SYMBOL_TZ_OVERRIDES: Dict[str, str] = {
    "ES=F": "America/Chicago",
    "NQ=F": "America/Chicago",
    "YM=F": "America/Chicago",
    "RTY=F": "America/Chicago",
    "^GSPC": "America/New_York",
    "^DJI":  "America/New_York",
    "^IXIC": "America/New_York",
    "^RUT":  "America/New_York",
    "^VIX":  "America/New_York",
    "GC=F":  "America/New_York",
}

_TZ_CACHE: Dict[str, str] = {}

def _num(x):
    try:
        if x is None or (isinstance(x, float) and math.isnan(x)):
            return None
        return float(x)
    except Exception:
        return None

def _int(x):
    try:
        if x is None or (isinstance(x, float) and math.isnan(x)):
            return None
        return int(x)
    except Exception:
        return None

def _tz_from_yfinance(sym: str) -> Optional[str]:
    try:
        import yfinance as yf
        t = yf.Ticker(sym)
        fi = getattr(t, "fast_info", None)
        if isinstance(fi, dict):
            tz = fi.get("timezone")
            if tz: return tz
        elif fi is not None:
            tz = getattr(fi, "timezone", None)
            if tz: return tz
        info = t.info or {}
        tz = info.get("exchangeTimezoneName") or info.get("timeZoneFullName") or info.get("timezone")
        if tz: return tz
    except Exception:
        pass
    return None

def _tz_from_yahooquery(sym: str) -> Optional[str]:
    try:
        from yahooquery import Ticker
        tq = Ticker(sym)
        p = getattr(tq, "price", {}) or {}
        meta = p.get(sym, {})
        tz = meta.get("exchangeTimezoneName") or meta.get("timeZoneFullName") or meta.get("timezone")
        if tz: return tz
    except Exception:
        pass
    return None

def _exchange_tz_for_symbol(symbol: str) -> str:
    sym = (symbol or "").upper()
    if sym in _TZ_CACHE:
        return _TZ_CACHE[sym]
    if sym in SYMBOL_TZ_OVERRIDES:
        _TZ_CACHE[sym] = SYMBOL_TZ_OVERRIDES[sym]
        return _TZ_CACHE[sym]
    tz = _tz_from_yfinance(sym) or _tz_from_yahooquery(sym) or "America/New_York"
    _TZ_CACHE[sym] = tz
    return tz

def _date_in_exchange_day(d, exchange_tz: str, source: str) -> str:
    tz_exch = zoneinfo.ZoneInfo(exchange_tz or "America/New_York")
    source = (source or "").lower()
    def finish(ts: pd.Timestamp) -> str:
        return ts.tz_convert(tz_exch).date().isoformat()
    if isinstance(d, pd.Timestamp):
        ts = d
        if ts.tzinfo is None:
            ts = ts.tz_localize("UTC" if source == "yahooquery" else tz_exch)
        return finish(ts)
    if isinstance(d, datetime):
        ts = pd.Timestamp(d)
        if ts.tzinfo is None:
            ts = ts.tz_localize("UTC" if source == "yahooquery" else tz_exch)
        return finish(ts)
    ts = pd.to_datetime(d, errors="coerce")
    if pd.isna(ts):
        return str(d)[:10]
    if ts.tzinfo is None:
        ts = ts.tz_localize("UTC" if source == "yahooquery" else tz_exch)
    return finish(ts)

def _normalize_df_to_rows(df: pd.DataFrame, exchange_tz: str, source: str) -> List[Dict[str, Any]]:
    if df is None or len(df) == 0:
        return []
    if "Date" in df.columns:
        df = df.reset_index()
        date_col = "Date"
    elif "date" in df.columns:
        date_col = "date"
    else:
        df = df.reset_index(names="Date")
        date_col = "Date"

    cols = {c.lower(): c for c in df.columns}
    def col(name): return cols.get(name)

    out: List[Dict[str, Any]] = []
    for _, r in df.iterrows():
        date_iso = _date_in_exchange_day(r.get(date_col), exchange_tz, source)
        out.append({
            "date": date_iso,
            "open": _num(r.get(col("open")) or r.get("Open")),
            "high": _num(r.get(col("high")) or r.get("High")),
            "low":  _num(r.get(col("low"))  or r.get("Low")),
            "close": _num(r.get(col("close")) or r.get("Close")),
            "adj_close": _num(r.get("Adj Close") or r.get("adj_close") or r.get("AdjClose")),
            "volume": _int(r.get(col("volume")) or r.get("Volume")),
        })
    return out

def get_history(symbol: str, period: str = "1y", interval: str = "1mo") -> List[Dict[str, Any]]:
    exchange_tz = _exchange_tz_for_symbol(symbol)
    if PROVIDER == "yfinance":
        import yfinance as yf
        df = yf.Ticker(symbol).history(period=period, interval=interval, auto_adjust=False)
        return _normalize_df_to_rows(df, exchange_tz, "yfinance")
    if PROVIDER == "yahooquery":
        from yahooquery import Ticker
        df = Ticker(symbol).history(period=period, interval=interval)
        try:
            df = df.reset_index()
        except Exception:
            pass
        return _normalize_df_to_rows(df, exchange_tz, "yahooquery")
    raise ValueError("Unknown YF_PROVIDER (use 'yfinance' or 'yahooquery').")

def get_history_range(symbol: str, start: str, end: str, interval: str = "1mo") -> List[Dict[str, Any]]:
    exchange_tz = _exchange_tz_for_symbol(symbol)
    if PROVIDER == "yfinance":
        import yfinance as yf
        # For daily, we add 1 day because yfinance end is exclusive; monthly doesn't need it.
        end_inclusive = pd.to_datetime(end) + pd.Timedelta(days=1) if interval == "1d" else end
        df = yf.Ticker(symbol).history(start=start, end=end_inclusive, interval=interval, auto_adjust=False)
        return _normalize_df_to_rows(df, exchange_tz, "yfinance")
    if PROVIDER == "yahooquery":
        from yahooquery import Ticker
        df = Ticker(symbol).history(start=start, end=end, interval=interval)
        try:
            df = df.reset_index()
        except Exception:
            pass
        return _normalize_df_to_rows(df, exchange_tz, "yahooquery")
    raise ValueError("Unknown YF_PROVIDER (use 'yfinance' or 'yahooquery').")

def get_quote(symbol: str) -> Dict[str, Any]:
    _ = _exchange_tz_for_symbol(symbol)
    if PROVIDER == "yfinance":
        import yfinance as yf
        t = yf.Ticker(symbol)
        fi = getattr(t, "fast_info", {}) or {}
        return {
            "symbol": symbol.upper(),
            "last": _num(fi.get("last_price")),
            "currency": fi.get("currency"),
            "exchange": fi.get("exchange"),
        }
    if PROVIDER == "yahooquery":
        from yahooquery import Ticker
        d = Ticker(symbol).price.get(symbol.upper(), {}) or {}
        return {
            "symbol": symbol.upper(),
            "last": d.get("regularMarketPrice"),
            "currency": d.get("currency"),
            "exchange": d.get("exchangeName") or d.get("fullExchangeName"),
        }
    raise ValueError("Unknown YF_PROVIDER.")
