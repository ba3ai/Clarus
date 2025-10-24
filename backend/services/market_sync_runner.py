# backend/services/market_sync_runner.py
import os, threading, time
from datetime import datetime
from flask import current_app
from backend.services.market_store import sync_symbol_incremental

_state = {"running": False, "last_started_at": None, "last_finished_at": None, "last_result": {}, "last_error": None}
_lock = threading.Lock()

def _symbols_from_env():
    s = os.getenv("MARKET_SYNC_SYMBOLS", "^GSPC")
    return [x.strip() for x in s.split(",") if x.strip()]

def _run(symbols, app):
    with _lock:
        if _state["running"]:
            return False
        _state["running"] = True
        _state["last_started_at"] = datetime.utcnow().isoformat() + "Z"
        _state["last_error"] = None
        _state["last_result"] = {}

    try:
        total = 0
        with app.app_context():
            for sym in symbols:
                n = sync_symbol_incremental(sym, months_overlap=2, interval="1mo")
                _state["last_result"][sym] = n
                total += n
                if current_app:
                    current_app.logger.info(f"[market_sync_runner] {sym}: upserted {n} monthly rows")
        return True
    except Exception as e:
        _state["last_error"] = str(e)
        if current_app:
            current_app.logger.exception(f"[market_sync_runner] failed: {e}")
        return False
    finally:
        _state["last_finished_at"] = datetime.utcnow().isoformat() + "Z"
        _state["running"] = False

def trigger_sync_async(symbols=None, delay_seconds=0, app=None):
    syms = symbols or _symbols_from_env()
    if app is None:
        try:
            app = current_app._get_current_object()
        except Exception:
            raise RuntimeError("No Flask app provided to trigger_sync_async and no current_app context is active.")

    def runner():
        if delay_seconds:
            time.sleep(delay_seconds)
        _run(syms, app)

    t = threading.Thread(target=runner, daemon=True)
    t.start()

def status():
    return dict(_state)
