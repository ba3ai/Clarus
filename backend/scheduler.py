# backend/scheduler.py
from apscheduler.schedulers.background import BackgroundScheduler
from datetime import date
from services.statement_service import quarter_bounds, compute_statement_from_period_balances
from pdf.statement_renderer import render_statement_pdf
from models import Statement, Investor
from extensions import db

def run_quarterly_generation():
    today = date.today()
    start, end = quarter_bounds(today)
    # Only run on quarter end (or always check if missing for last quarter):
    # if (today.month, today.day) not in {(3,31),(6,30),(9,30),(12,31)}: return
    for inv in Investor.query.all():
        # upsert guard
        exists = Statement.query.filter_by(investor_id=inv.id, period_start=start, period_end=end).first()
        if exists: 
            continue
        stmt = compute_statement_from_period_balances(inv, start, end, entity_name="Elpis Opportunity Fund LP")
        db.session.add(stmt); db.session.flush()
        pdf_path = render_statement_pdf(stmt)
        stmt.pdf_path = pdf_path
    db.session.commit()

def init_scheduler(app):
    sched = BackgroundScheduler(timezone="UTC")
    # Every day at 02:00 UTC – compute if the current quarter’s statement is missing.
    sched.add_job(run_quarterly_generation, "cron", hour=2, minute=0)
    sched.start()
