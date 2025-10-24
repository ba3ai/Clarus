from datetime import date
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import and_
from backend.extensions import db
from backend.models import PortfolioPeriodMetric

portfolio_bp = Blueprint("portfolio", __name__)

def _first_of_month(d: date) -> date:
    return date(d.year, d.month, 1)

@portfolio_bp.get("/api/portfolio/roi_monthly")
@jwt_required(optional=True)
def portfolio_roi_monthly():
    """
    Returns monthly ROI (percent) for the selected sheet between start and end.
    If beginning or ending balance is NULL for a month, ROI is returned as 0.0
    and the row includes missing: true so the UI can show a 'missing data' message.
    """
    try:
        start_str = (request.args.get("start") or "").strip()
        end_str   = (request.args.get("end") or "").strip()
        sheet     = (request.args.get("sheet") or "").strip()

        if not start_str or not end_str:
            return jsonify(error="start and end are required (YYYY-MM-DD)."), 400

        start = _first_of_month(date.fromisoformat(start_str))
        end   = _first_of_month(date.fromisoformat(end_str))

        # Default to latest sheet if none is provided
        if not sheet:
            latest = (
                db.session.query(PortfolioPeriodMetric.sheet)
                .order_by(PortfolioPeriodMetric.as_of_date.desc())
                .first()
            )
            sheet = latest[0] if latest else "bCAS (Q4 Adj)"

        rows = (
            PortfolioPeriodMetric.query
            .filter(
                and_(
                    PortfolioPeriodMetric.sheet == sheet,
                    PortfolioPeriodMetric.as_of_date >= start,
                    PortfolioPeriodMetric.as_of_date <= end,
                )
            )
            .order_by(PortfolioPeriodMetric.as_of_date.asc())
            .all()
        )

        out = []
        for r in rows:
            missing = False
            if r.beginning_balance is None or r.ending_balance is None:
                roi = 0.0
                missing = True
            else:
                bb = float(r.beginning_balance or 0)
                eb = float(r.ending_balance or 0)
                roi = ((eb - bb) / bb * 100.0) if bb else 0.0

            out.append({
                "date": _first_of_month(r.as_of_date).isoformat(),
                "roi_pct": roi,
                "missing": missing,   # <= tell the UI this was a fallback
            })

        return jsonify(ok=True, sheet=sheet, rows=out)
    except Exception as e:
        return jsonify(error=str(e)), 500
