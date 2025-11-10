# run_market_sync.py  (monthly sync runner)
import os
from datetime import datetime
from app import app
from services.market_store import sync_symbol_incremental

def symbols():
    s = os.getenv("MARKET_SYNC_SYMBOLS", "^GSPC")
    return [x.strip() for x in s.split(",") if x.strip()]

if __name__ == "__main__":
    with app.app_context():
        total_rows = 0
        for sym in symbols():
            # MONTHLY sync, with a small overlap to catch revisions
            n = sync_symbol_incremental(sym, months_overlap=2, interval="1mo")
            print(f"[{datetime.utcnow().isoformat()}Z] {sym}: upserted {n} monthly rows")
            total_rows += n
        print(f"Total upserted monthly rows: {total_rows}")
