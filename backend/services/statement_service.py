# backend/services/statement_service.py
from __future__ import annotations

import os
from datetime import date
from decimal import Decimal
from calendar import monthrange
from typing import Tuple, Optional
from sqlalchemy import func
from backend.extensions import db
from backend.models import Statement, Investor
from backend.models_snapshot import InvestorPeriodBalance
from backend.pdf.statement_renderer import render_investor_statement_pdf

# Try to import an optional AppSetting model for admin-managed settings.
# If it's not present, logo resolution will gracefully fall back to env/static.
try:
    from backend.models_settings import AppSetting  # type: ignore
except Exception:  # pragma: no cover
    AppSetting = None  # type: ignore


# ----------------------------- Quarter helpers ----------------------------- #
def quarter_bounds(d: date) -> Tuple[date, date]:
    """
    Return (start, end) dates for the quarter that contains date d.
    Q1: Jan–Mar, Q2: Apr–Jun, Q3: Jul–Sep, Q4: Oct–Dec.
    """
    q = (d.month - 1) // 3 + 1
    start_month = 3 * (q - 1) + 1
    start = date(d.year, start_month, 1)
    end = date(d.year, start_month + 2, monthrange(d.year, start_month + 2)[1])
    return start, end


# --------------------------- Aggregation helpers --------------------------- #
def _sum_months(investor_name: str, start: date, end: date) -> Optional[dict]:
    """
    Aggregate monthly InvestorPeriodBalance rows within [start, end] inclusive
    for a given investor (by name).

    Returns a dict containing:
      beginning_balance, ending_balance, unrealized_gl, management_fees,
      operating_expenses, contributions, distributions
    """
    rows = (
        db.session.query(InvestorPeriodBalance)
        .filter(
            InvestorPeriodBalance.investor == investor_name,
            InvestorPeriodBalance.period_date >= start,
            InvestorPeriodBalance.period_date <= end,
        )
        .order_by(InvestorPeriodBalance.period_date.asc())
        .all()
    )
    if not rows:
        return None

    beg = Decimal(str(rows[0].beginning_balance or 0.0))
    ending = Decimal(str(rows[-1].ending_balance or 0.0))

    unreal = Decimal("0")
    mgmt = Decimal("0")
    opex = Decimal("0")
    for r in rows:
        unreal += Decimal(str(r.unrealized_gain_loss or 0.0))
        mgmt   += Decimal(str(r.management_fees or 0.0))
        opex   += Decimal(str(getattr(r, "operating_expenses", 0.0) or 0.0))

    # Identity uses: end = beg + (contrib - distr) + (unreal + carry - mgmt - opex + adj)
    # We don't track carry/adj here, so cash_net backs out the known P&L parts:
    cash_net = ending - beg - unreal + mgmt + opex

    return {
        "beginning_balance": beg,
        "ending_balance": ending,
        "unrealized_gl": unreal,
        "management_fees": mgmt,
        "operating_expenses": opex,
        "contributions": Decimal("0"),   # <- explicit only (or parsed columns)
        "distributions": Decimal("0"),   # <- explicit only (or parsed columns)
    }


def compute_statement_from_period_balances(
    investor: Investor,
    start: date,
    end: date,
    entity_name: str,
) -> Statement:
    """
    Build (or refresh) a Statement by aggregating InvestorPeriodBalance rows
    between start and end (inclusive). Also compute ownership_percent at period end.
    """
    stmt = (
        Statement.query.filter_by(investor_id=investor.id, period_start=start, period_end=end)
        .first()
    )

    sums = _sum_months(investor.name, start, end) or {
        "beginning_balance": Decimal("0"),
        "ending_balance": Decimal("0"),
        "unrealized_gl": Decimal("0"),
        "management_fees": Decimal("0"),
        "operating_expenses": Decimal("0"),
        "contributions": Decimal("0"),
        "distributions": Decimal("0"),
    }

    beg     = Decimal(sums["beginning_balance"])
    ending  = Decimal(sums["ending_balance"])
    unreal  = Decimal(sums["unrealized_gl"])
    mgmt    = Decimal(sums["management_fees"])
    opex    = Decimal(sums["operating_expenses"])
    contrib = Decimal(sums["contributions"])
    distr   = Decimal(sums["distributions"])

    carry = Decimal("0.00")
    adj   = Decimal("0.00")
    net   = unreal + carry + mgmt + opex + adj

    calc_end = beg + (contrib - distr) + net
    end_bal  = ending if ending != 0 else calc_end
    roi      = ((end_bal - beg) / beg * 100) if beg else None

    # NEW: compute ownership percent at period end
    # fund NAV = sum of all investors' ending_balance for this period end
    fund_nav = db.session.query(
        func.coalesce(func.sum(InvestorPeriodBalance.ending_balance), 0.0)
    ).filter(InvestorPeriodBalance.period_date == end).scalar() or 0.0
    ownership_pct = float(end_bal) / float(fund_nav) * 100.0 if fund_nav else None

    if stmt is None:
        stmt = Statement(
            investor_id=investor.id,
            investor_name=investor.name,
            entity_name=entity_name,
            period_start=start,
            period_end=end,
            beginning_balance=beg,
            contributions=contrib,
            distributions=distr,
            unrealized_gl=unreal,
            incentive_fees=carry,
            management_fees=mgmt,
            operating_expenses=opex,
            adjustment=adj,
            net_income_loss=net,
            ending_balance=end_bal,
            ownership_percent=ownership_pct,  # <-- set percent
            roi_pct=roi,
        )
        db.session.add(stmt)
        db.session.flush()
        return stmt

    # Update existing statement in-place
    stmt.investor_name      = investor.name
    stmt.entity_name        = entity_name
    stmt.beginning_balance  = beg
    stmt.contributions      = contrib
    stmt.distributions      = distr
    stmt.unrealized_gl      = unreal
    stmt.incentive_fees     = carry
    stmt.management_fees    = mgmt
    stmt.operating_expenses = opex
    stmt.adjustment         = adj
    stmt.net_income_loss    = net
    stmt.ending_balance     = end_bal
    stmt.ownership_percent  = ownership_pct  # <-- refresh percent
    stmt.roi_pct            = roi
    db.session.flush()
    return stmt

def _compute_ytd(investor_name: str, period_end: date) -> dict:
    """
    Year-to-date aggregation: Jan 1 of period_end.year .. period_end.
    Keys match the renderer's expectations.
    """
    start_of_year = date(period_end.year, 1, 1)
    sums = _sum_months(investor_name, start_of_year, period_end) or {
        "beginning_balance": Decimal("0"),
        "ending_balance": Decimal("0"),
        "unrealized_gl": Decimal("0"),
        "management_fees": Decimal("0"),
        "operating_expenses": Decimal("0"),
        "contributions": Decimal("0"),
        "distributions": Decimal("0"),
    }

    net = (Decimal(sums["unrealized_gl"]) + Decimal(sums["management_fees"]) + Decimal(sums["operating_expenses"]))

    return {
        "label_range": f"(Jan. 1, {period_end.year} – {period_end:%b}. {period_end.day}, {period_end.year})",
        "beginning_balance": sums["beginning_balance"],
        "contributions": sums["contributions"],
        "distributions": sums["distributions"],
        "unrealized_gl": sums["unrealized_gl"],
        "incentive_fees": Decimal("0"),
        "management_fees": sums["management_fees"],
        "operating_expenses": sums["operating_expenses"],  # <-- new
        "adjustment": Decimal("0"),
        "net_income_loss": net,
        "ending_balance": sums["ending_balance"],
    }


# ------------------------------ Branding / Logo ----------------------------- #
def _resolve_logo_path() -> str | None:
    """
    Resolve a logo path in this priority:
      1) AppSetting 'brand_logo_path' (admin-uploaded)
      2) ELOP_LOGO_PATH environment variable
      3) backend/static/elpis_logo.png (repo default)
    Returns an absolute filesystem path, or None if not found.
    """
    # 1) DB setting from admin panel (if the model exists)
    if AppSetting is not None:
        try:
            path = AppSetting.get("brand_logo_path")  # type: ignore[attr-defined]
            if path and os.path.exists(path):
                return os.path.abspath(path)
        except Exception:
            pass

    # 2) Environment override
    env_path = os.environ.get("ELOP_LOGO_PATH")
    if env_path and os.path.exists(env_path):
        return os.path.abspath(env_path)

    # 3) Project static fallback
    this_dir = os.path.dirname(__file__)                   # backend/services
    repo_root = os.path.abspath(os.path.join(this_dir, ".."))
    static_path = os.path.join(repo_root, "static", "elpis_logo.png")
    if os.path.exists(static_path):
        return static_path

    return None


# --------------------------------- PDF output -------------------------------- #
def ensure_statement_pdf(stmt: Statement) -> str:
    """
    Render the two-column (Current Period vs YTD) investor statement PDF
    in the exact layout used by the ReportLab renderer.
    """
    cur_label = (
        f"({stmt.period_start:%b}. {stmt.period_start.day}, {stmt.period_start.year} – "
        f"{stmt.period_end:%b}. {stmt.period_end.day}, {stmt.period_end.year})"
    )
    ytd = _compute_ytd(stmt.investor_name, stmt.period_end)

    brand = {
        "logo_path": _resolve_logo_path(),  # may be None; renderer handles that gracefully
        "entity_address_lines": [
            stmt.entity_name or "Elpis Opportunity Fund LP",
            "7190 E. 106th Street",
            "Fishers, IN 46038",
        ],
    }

    return render_investor_statement_pdf(
        stmt=stmt,
        current_period_label=cur_label,
        ytd=ytd,
        brand=brand,
    )
