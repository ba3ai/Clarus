import os
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from flask import current_app
from backend.services.market_store import sync_symbol_incremental


def get_symbols_from_env() -> list:
    s = os.getenv("MARKET_SYNC_SYMBOLS", "^GSPC")
    return [x.strip() for x in s.split(",") if x.strip()]

def run_market_sync():
    """Runs inside app context."""
    from app import app  # ensure app exists
    with app.app_context():
        symbols = get_symbols_from_env()
        total = 0
        for sym in symbols:
            try:
                n = sync_symbol_incremental(sym, days_overlap=10, interval="1d")
                current_app.logger.info(f"[market_sync] {sym} upserted {n} rows")
                total += n
            except Exception as e:
                current_app.logger.exception(f"[market_sync] {sym} failed: {e}")
        return total

def start_scheduler(app):
    """
    Start a daily background scheduler.
    Customize timing via env:
      MARKET_SYNC_CRON = '0 3 * * *'  (every day 03:00)
    """
    cron_expr = os.getenv("MARKET_SYNC_CRON", "0 3 * * *")  # minute hour dom month dow
    minute, hour, dom, month, dow = cron_expr.split()

    sched = BackgroundScheduler(timezone=os.getenv("TZ", "UTC"))
    sched.add_job(
        func=run_market_sync,
        trigger=CronTrigger(minute=minute, hour=hour, day=dom, month=month, day_of_week=dow),
        id="market_sync_job",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=3600,
    )
    sched.start()
    current_app.logger.info(f"[scheduler] Market sync scheduled with CRON '{cron_expr}'")
    return sched
