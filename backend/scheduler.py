from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, date
from .services.statement_service import (
    compute_statement_from_period_balances,
    ensure_statement_pdf,
)
from .models import Investor
from .extensions import db

def generate_statements_for_current_quarter(app):
    # IMPORTANT: always run inside app context in background thread
    with app.app_context():
        now = datetime.utcnow()
        year = now.year
        quarter = (now.month - 1) // 3 + 1

        # ✅ Use date(...) not datetime(...) to avoid time/colon in filenames downstream
        start_month = 3 * (quarter - 1) + 1
        end_month = start_month + 2
        start_date = date(year, start_month, 1)
        # use the 28th as a safe month-end fallback for aggregation
        end_date = date(year, end_month, 28)

        print(f"📦 Auto-generating statements for Q{quarter} {year}...")

        investors = Investor.query.all()

        # Investor model has no entity_name -> use configured or default
        entity_name = "Elpis Opportunity Fund LP"

        created_ids = []
        for investor in investors:
            # ✅ correct param names: start / end
            stmt = compute_statement_from_period_balances(
                investor=investor,
                start=start_date,
                end=end_date,
                entity_name=entity_name,
            )
            # Generate and persist PDF path (like /generate-quarter route does)
            pdf_path = ensure_statement_pdf(stmt)
            try:
                stmt.pdf_path = pdf_path
            except Exception:
                # old schema? just ignore; PDF still created
                pass
            created_ids.append(stmt.id)

        # One commit at end (fewer transactions)
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f"⚠️ commit failed for quarterly statements: {e}")

        print(f"✅ Generated {len(created_ids)} statements for Q{quarter} {year}")

def start_scheduler(app, dev_mode=False):
    scheduler = BackgroundScheduler()

    # prevent duplicate/stale jobs when reloading in dev
    try:
        scheduler.remove_all_jobs()
    except Exception:
        pass

    if dev_mode:
        # run every minute for testing
        scheduler.add_job(
            lambda: generate_statements_for_current_quarter(app),
            trigger="interval",
            minutes=1,
            id="quarterly_statements_dev",
            replace_existing=True,
        )
        print("⏱️ Dev mode scheduler running every minute.")
    else:
        # run quarterly at 00:00 on the first day of each quarter
        scheduler.add_job(
            lambda: generate_statements_for_current_quarter(app),
            trigger="cron",
            month="1,4,7,10",
            day=1,
            hour=0,
            minute=0,
            id="quarterly_statements",
            replace_existing=True,
        )
        print("📅 Scheduler started for quarterly statement generation.")

    scheduler.start()

def test_quarterly_generation(app):
    # manual one-shot trigger for testing
    generate_statements_for_current_quarter(app)
