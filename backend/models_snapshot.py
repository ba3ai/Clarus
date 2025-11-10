from datetime import datetime, date
from backend.extensions import db


class WorkbookSnapshot(db.Model):
    """
    One snapshot of a workbook/sheet at a point in time.
    For SharePoint-backed snapshots, drive_id/item_id may be populated.
    """
    __tablename__ = "workbook_snapshots"

    id = db.Column(db.Integer, primary_key=True)

    # Source of the snapshot: e.g., 'sharepoint-live' or 'upload'
    source = db.Column(db.String(32), nullable=False)

    # For SharePoint-backed snapshots; may be null for uploads
    drive_id = db.Column(db.String(128))
    item_id  = db.Column(db.String(128))

    # Worksheet name
    sheet = db.Column(db.String(256), index=True)

    # Effective date of the data (parsed/inferred from the sheet when available)
    as_of = db.Column(db.DateTime, index=True, nullable=False, default=datetime.utcnow)

    # When the snapshot record was created
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<WorkbookSnapshot id={self.id} sheet={self.sheet!r} as_of={self.as_of:%Y-%m-%d} source={self.source!r}>"


class InvestorBalance(db.Model):
    """
    A single investor’s balance line for a given snapshot.
    Stores starting/ending values, derived ratios, and (now) IRR%.
    """
    __tablename__ = "investor_balances"

    id = db.Column(db.Integer, primary_key=True)

    # FK to the snapshot this row belongs to
    snapshot_id = db.Column(
        db.Integer,
        db.ForeignKey("workbook_snapshots.id"),
        index=True,
        nullable=False,
    )

    # IMPORTANT: store the INVESTOR NAME here (not an ID)
    investor = db.Column(db.String(256), index=True, nullable=False)

    # Values derived from the sheet (first/last "Ending Balance" per investor)
    initial_value = db.Column(db.Float)
    current_value = db.Column(db.Float)

    # NEW: dates corresponding to the first and last "Ending Balance" columns
    initial_date = db.Column(db.Date, index=True)   # earliest EB column date
    current_date = db.Column(db.Date, index=True)   # latest   EB column date

    # Ratios/metrics
    moic   = db.Column(db.Float)   # Multiple on invested capital (e.g., 1.23)
    roi_pct = db.Column(db.Float)  # Return on investment in percentage (e.g., 12.34)

    unrealized_to_date    = db.Column(db.Float)
    management_fees_to_date = db.Column(db.Float)
    # NEW: Annualized IRR percentage for this investor (CAGR-style unless flows available)
    irr_pct = db.Column(db.Float)  # e.g., 9.87

    # Optional extras (debug/provenance/columns used/etc.)
    extra = db.Column(db.JSON)

    # Relationship back to the parent snapshot
    snapshot = db.relationship("WorkbookSnapshot", backref="investor_rows")

    def __repr__(self) -> str:
        return (
            f"<InvestorBalance id={self.id} investor={self.investor!r} "
            f"initial={self.initial_value} current={self.current_value} "
            f"initial_date={self.initial_date} current_date={self.current_date} "
            f"moic={self.moic} roi_pct={self.roi_pct} irr_pct={self.irr_pct}>"
        )


class InvestorPeriodBalance(db.Model):
    __tablename__ = "investor_period_balance"

    id = db.Column(db.Integer, primary_key=True)
    investor_balance_id = db.Column(
        db.Integer,
        db.ForeignKey("investor_balances.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    investor = db.Column(db.String(256), index=True, nullable=False)
    period_date = db.Column(db.Date, nullable=False, index=True)

    beginning_balance = db.Column(db.Float)
    ending_balance    = db.Column(db.Float)

    unrealized_gain_loss = db.Column(db.Float)
    management_fees      = db.Column(db.Float)

    # NEW: month-level operating expenses for this investor
    operating_expenses   = db.Column(db.Float)

    source     = db.Column(db.String(32), nullable=False, default="manual")
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (db.UniqueConstraint("investor", "period_date", name="uq_investor_period"),)

    investor_balance = db.relationship("InvestorBalance", backref="period_rows")

    def to_dict(self):
        return {
            "id": self.id,
            "investor": self.investor,
            "period_date": self.period_date.isoformat(),
            "beginning_balance": self.beginning_balance,
            "ending_balance": self.ending_balance,
            "unrealized_gain_loss": self.unrealized_gain_loss,
            "management_fees": self.management_fees,
            "operating_expenses": self.operating_expenses,  # NEW
            "investor_balance_id": self.investor_balance_id,
            "source": self.source,
        }
