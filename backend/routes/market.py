# backend/routes/market.py
from flask import Blueprint, request, jsonify
from backend.services.market_data_providers import get_history, get_quote, get_history_range
from backend.services.market_sync_runner import trigger_sync_async, status as sync_status
from backend.models import MarketPrice
from datetime import date
from sqlalchemy import and_

market_bp = Blueprint("market", __name__, url_prefix="/api/market")

@market_bp.get("/history")
def history():
    symbol = request.args.get("symbol", "^GSPC")
    period = request.args.get("period", "5y")
    interval = request.args.get("interval", "1mo")
    rows = get_history(symbol, period, interval)
    return jsonify({"symbol": symbol.upper(), "rows": rows})

@market_bp.get("/quote")
def quote():
    symbol = request.args.get("symbol", "^GSPC")
    return jsonify(get_quote(symbol))

@market_bp.get("/history_range")
def history_range():
    symbol = request.args.get("symbol", "^GSPC")
    start  = request.args.get("start")
    end    = request.args.get("end")
    interval = request.args.get("interval", "1mo")
    if not start or not end:
        return {"error": "start and end are required (YYYY-MM-DD)"}, 400
    rows = get_history_range(symbol, start, end, interval)
    return jsonify({"symbol": symbol.upper(), "rows": rows})

@market_bp.post("/refresh")
def market_refresh():
    syms = request.args.get("symbols")
    symbols = [s.strip() for s in syms.split(",")] if syms else None
    trigger_sync_async(symbols=symbols, delay_seconds=0)
    return jsonify({"ok": True, "message": "sync started"}), 202

@market_bp.get("/refresh_status")
def market_refresh_status():
    return jsonify(sync_status())

@market_bp.post("/store_history")
def store_history():
    from backend.services.market_store import upsert_history
    symbol = request.args.get("symbol")
    start  = request.args.get("start")
    end    = request.args.get("end")
    interval = request.args.get("interval", "1mo")
    if not symbol or not start or not end:
        return {"error": "symbol, start, end are required (YYYY-MM-DD)"}, 400
    n = upsert_history(symbol, start, end, interval)
    return {"symbol": symbol.upper(), "inserted_or_updated": n, "status": "ok"}

@market_bp.get("/history_db")
def history_db():
    symbol = request.args.get("symbol")
    start  = request.args.get("start")
    end    = request.args.get("end")
    if not symbol:
        return {"error": "symbol is required"}, 400

    q = MarketPrice.query.filter(MarketPrice.symbol == symbol.upper())
    if start: q = q.filter(MarketPrice.date >= start)
    if end:   q = q.filter(MarketPrice.date <= end)
    rows = q.order_by(MarketPrice.date.asc()).all()

    return {
        "symbol": symbol.upper(),
        "rows": [
            {
                "date": r.date.isoformat(),
                "open": r.open, "high": r.high, "low": r.low,
                "close": r.close, "adj_close": r.adj_close, "volume": r.volume
            }
            for r in rows
        ]
    }

# ---------- NEW: Monthly ROI API ----------
@market_bp.get("/roi_monthly")
def roi_monthly():
    symbols_param = request.args.get("symbols")
    start_s = request.args.get("start")
    end_s   = request.args.get("end")
    if not symbols_param:
        return {"error": "symbols is required (comma-separated)"}, 400

    # Parse to real dates for Postgres
    start_d = None
    end_d = None
    try:
        if start_s: start_d = date.fromisoformat(start_s)   # 'YYYY-MM-DD'
        if end_s:   end_d   = date.fromisoformat(end_s)
    except Exception:
        return {"error": "start/end must be YYYY-MM-DD"}, 400

    symbols = [s.strip().upper() for s in symbols_param.split(",") if s.strip()]
    out = {}

    for sym in symbols:
        q = MarketPrice.query.filter(MarketPrice.symbol == sym)
        if start_d: q = q.filter(MarketPrice.date >= start_d)
        if end_d:   q = q.filter(MarketPrice.date <= end_d)
        rows = q.order_by(MarketPrice.date.asc()).all()

        series = []
        for r in rows:
            o = (r.open or 0.0); c = (r.close or 0.0)
            roi = None if not o else ((c - o) / o) * 100.0
            series.append({
                "date": r.date.isoformat(),
                "open": r.open, "close": r.close,
                "roi_pct": None if roi is None else float(roi),
            })
        out[sym] = series

    return {"by_symbol": out}