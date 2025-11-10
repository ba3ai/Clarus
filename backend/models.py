from __future__ import annotations

import json
from datetime import datetime, timedelta, date

from sqlalchemy import UniqueConstraint
from sqlalchemy.sql import func
from backend.extensions import db

# ------------------ User Model ------------------
# models.py
from flask_login import UserMixin  # <-- add this import

# ------------------ User Model ------------------
class User(db.Model, UserMixin):  # <-- inherit UserMixin
    id = db.Column(db.Integer, primary_key=True)

    first_name = db.Column(db.String(100), nullable=False)
    last_name  = db.Column(db.String(100), nullable=False)

    email    = db.Column(db.String(120), unique=True, nullable=False)
    username = db.Column(db.String(120), unique=True, nullable=True)  # optional (legacy)

    password = db.Column(db.String(200), nullable=False)

    user_type         = db.Column(db.String(50), nullable=False)
    organization_name = db.Column(db.String(150), nullable=True)

    address = db.Column(db.String(255), nullable=True)
    phone   = db.Column(db.String(50),  nullable=True)

    bank       = db.Column(db.String(100), nullable=True)
    status     = db.Column(db.String(20),  nullable=False, default="Active")
    permission = db.Column(db.String(50),  nullable=False, default="Viewer")

    investors = db.relationship("Investor", backref="owner", lazy=True, foreign_keys="Investor.owner_id")
    settings  = db.relationship("AdminSettings", backref="admin", uselist=False, lazy=True)
    sp_connections = db.relationship("SharePointConnection", backref="user", lazy=True, cascade="all, delete-orphan")
    qbo_connections = db.relationship(
        "QuickBooksConnection",
        back_populates="user",
        lazy=True,
        cascade="all, delete-orphan",
    )

    # --- Flask-Login helpers ---
    @property
    def is_active(self) -> bool:
        # consider treating only explicit "Active" as active
        return (self.status or "").lower() == "active"

    def get_id(self) -> str:  # UserMixin already provides this, but keeping explicit is fine
        return str(self.id)

    def __repr__(self):
        return f"<User {self.id} {self.email}>"



# ------------------ Invitation Model ------------------
class Invitation(db.Model):
    __tablename__ = "invitations"

    id    = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), nullable=False, index=True)
    name  = db.Column(db.String(255), nullable=True)

    token  = db.Column(db.String(128), unique=True, index=True, nullable=False)
    status = db.Column(db.String(32), default="pending", nullable=False)  # pending|accepted|expired|revoked

    invited_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    inviter    = db.relationship("User", foreign_keys=[invited_by], lazy=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    used_at    = db.Column(db.DateTime, nullable=True)

    def is_valid(self) -> bool:
        return self.status == "pending" and (self.expires_at is None or self.expires_at >= datetime.utcnow())

    def to_dict(self):
        return {
            "id": self.id, "email": self.email, "name": self.name, "token": self.token, "status": self.status,
            "invited_by": self.invited_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "used_at": self.used_at.isoformat() if self.used_at else None,
        }


# ------------------ Investor Model ------------------
class Investor(db.Model):
    __tablename__ = "investor"

    id   = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)

    owner_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)

    # NEW: investor type (IRA | ROTH IRA | Retirement | Depends)
    investor_type = db.Column(db.String(20), nullable=False, default="IRA", index=True)

    # If this investor "Depends" on another investor, set the parent link below.
    # When you create a new "Depends" investor and select multiple existing investors
    # to fall under it, you will set *those* investors' parent_investor_id = this.id.
    parent_investor_id = db.Column(db.Integer, db.ForeignKey("investor.id"), nullable=True, index=True)

    # Self-referential relationship:
    # - .parent -> the single parent investor (if any)
    # - .dependents -> list of child investors that fall under this investor
    parent = db.relationship(
        "Investor",
        remote_side=[id],
        backref=db.backref("dependents", lazy=True),
        foreign_keys=[parent_investor_id],
        lazy=True,
    )

    # legacy composed fields
    company_name  = db.Column(db.String(150), nullable=True)
    address       = db.Column(db.String(255), nullable=True)
    contact_phone = db.Column(db.String(50),  nullable=True)
    email         = db.Column(db.String(120), nullable=True, index=True)

    account_user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    account_user    = db.relationship("User", foreign_keys=[account_user_id], lazy=True)

    invitation_id = db.Column(db.Integer, db.ForeignKey("invitations.id"), nullable=True)
    invitation    = db.relationship("Invitation", foreign_keys=[invitation_id], lazy=True)

    # new granular profile fields
    birthdate   = db.Column(db.String(20),  nullable=True)  # "MM/DD/YYYY"
    citizenship = db.Column(db.String(100), nullable=True)
    ssn_tax_id  = db.Column(db.String(64),  nullable=True)  # consider encrypting/masking later

    emergency_contact = db.Column(db.String(50), nullable=True)

    address1 = db.Column(db.String(200), nullable=True)
    address2 = db.Column(db.String(200), nullable=True)
    country  = db.Column(db.String(100), nullable=True)
    city     = db.Column(db.String(100), nullable=True)
    state    = db.Column(db.String(100), nullable=True)
    zip      = db.Column(db.String(20),  nullable=True)

    avatar_url = db.Column(db.String(300), nullable=True)

    records = db.relationship("Record", backref="investor", lazy=True)

    contacts = db.relationship("InvestorContact", backref="investor", lazy=True, cascade="all, delete-orphan")

    disbursement_preference = db.relationship(
        "DisbursementPreference",
        backref="investor",
        uselist=False,
        lazy=True,
        cascade="all, delete-orphan",
    )

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "company_name": self.company_name,
            "address": self.address,
            "contact_phone": self.contact_phone,
            "email": self.email,
            "owner_id": self.owner_id,
            "account_user_id": self.account_user_id,
            "invitation_id": self.invitation_id,

            # NEW fields in payload
            "investor_type": self.investor_type,
            "parent_investor_id": self.parent_investor_id,
            "dependents": [d.id for d in (self.dependents or [])],

            "birthdate": self.birthdate,
            "citizenship": self.citizenship,
            "ssn_tax_id": "***" if self.ssn_tax_id else None,
            "emergency_contact": self.emergency_contact,
            "address1": self.address1,
            "address2": self.address2,
            "country": self.country,
            "city": self.city,
            "state": self.state,
            "zip": self.zip,
            "avatar_url": self.avatar_url,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ------------------ Investor Contact ------------------
class InvestorContact(db.Model):
    __tablename__ = "investor_contacts"

    id = db.Column(db.Integer, primary_key=True)
    investor_id = db.Column(db.Integer, db.ForeignKey("investor.id"), nullable=False, index=True)

    name  = db.Column(db.String(150), nullable=False)
    email = db.Column(db.String(255), nullable=False, index=True)
    phone = db.Column(db.String(50),  nullable=True)
    notes = db.Column(db.String(500), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (db.UniqueConstraint("investor_id", "email", name="uq_contact_investor_email"),)

    def to_dict(self):
        return {
            "id": self.id, "investor_id": self.investor_id, "name": self.name, "email": self.email,
            "phone": self.phone, "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ------------------ Disbursement Preference ------------------
class DisbursementPreference(db.Model):
    __tablename__ = "disbursement_preferences"

    id = db.Column(db.Integer, primary_key=True)
    investor_id = db.Column(db.Integer, db.ForeignKey("investor.id"), nullable=False, unique=True, index=True)

    method   = db.Column(db.String(20), nullable=False, default="ACH")  # ACH|Wire|Check
    currency = db.Column(db.String(10), nullable=True, default="USD")

    bank_name            = db.Column(db.String(150), nullable=True)
    account_name         = db.Column(db.String(150), nullable=True)
    account_number_last4 = db.Column(db.String(10),  nullable=True)
    routing_number_last4 = db.Column(db.String(10),  nullable=True)
    iban_last4           = db.Column(db.String(10),  nullable=True)
    swift_bic            = db.Column(db.String(20),  nullable=True)

    payee_name   = db.Column(db.String(150), nullable=True)
    mail_address1= db.Column(db.String(200), nullable=True)
    mail_address2= db.Column(db.String(200), nullable=True)
    mail_city    = db.Column(db.String(100), nullable=True)
    mail_state   = db.Column(db.String(100), nullable=True)
    mail_zip     = db.Column(db.String(20),  nullable=True)
    mail_country = db.Column(db.String(100), nullable=True)

    preferred_day   = db.Column(db.Integer, nullable=True)
    minimum_amount  = db.Column(db.Float,   nullable=True)
    reinvest        = db.Column(db.Boolean, default=False, nullable=False)

    notes = db.Column(db.String(500), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id, "investor_id": self.investor_id, "method": self.method, "currency": self.currency,
            "bank_name": self.bank_name, "account_name": self.account_name,
            "account_number_last4": self.account_number_last4, "routing_number_last4": self.routing_number_last4,
            "iban_last4": self.iban_last4, "swift_bic": self.swift_bic,
            "payee_name": self.payee_name, "mail_address1": self.mail_address1, "mail_address2": self.mail_address2,
            "mail_city": self.mail_city, "mail_state": self.mail_state, "mail_zip": self.mail_zip,
            "mail_country": self.mail_country, "preferred_day": self.preferred_day,
            "minimum_amount": self.minimum_amount, "reinvest": self.reinvest, "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ------------------ Excel Upload History ------------------
class ExcelUploadHistory(db.Model):
    __tablename__ = "excel_upload_history"

    id = db.Column(db.Integer, primary_key=True)
    filename   = db.Column(db.String(255), nullable=False)
    uploaded_at= db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id, "filename": self.filename,
            "uploaded_at": self.uploaded_at.strftime("%Y-%m-%d %H:%M:%S"),
        }


# ------------------ Record Model ------------------
class Record(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    investor_id = db.Column(db.Integer, db.ForeignKey("investor.id"), nullable=False)
    type   = db.Column(db.String(50))   # investment, expense, profit
    amount = db.Column(db.Float)
    source = db.Column(db.String(50))   # manual, sheet
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


# ------------------ Admin Settings (QuickBooks; legacy/global) ------------------
class AdminSettings(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    admin_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, unique=True)

    qb_access_token   = db.Column(db.Text,    nullable=True)
    qb_refresh_token  = db.Column(db.Text,    nullable=True)
    qb_expires_in     = db.Column(db.Integer, nullable=True)
    qb_realm_id       = db.Column(db.String(100), nullable=True)
    qb_connection_note= db.Column(db.String(255), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id, "admin_id": self.admin_id,
            "quickbooks_token": bool(self.qb_access_token),
            "quickbooks_refresh_token": bool(self.qb_refresh_token),
            "realm_id": self.qb_realm_id,
            "updated_at": self.updated_at.strftime("%Y-%m-%d %H:%M:%S") if self.updated_at else None,
        }


# ------------------ Manual Investor Entry ------------------
class ManualInvestorEntry(db.Model):
    __tablename__ = "manual_investor_entries"

    id    = db.Column(db.Integer, primary_key=True)
    name  = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(50),  nullable=True)

    birthdate   = db.Column(db.String(20),  nullable=True)
    citizenship = db.Column(db.String(100), nullable=True)
    ssn_tax_id  = db.Column(db.String(64),  nullable=True)

    address1 = db.Column(db.String(200), nullable=True)
    address2 = db.Column(db.String(200), nullable=True)
    country  = db.Column(db.String(100), nullable=True)
    city     = db.Column(db.String(100), nullable=True)
    state    = db.Column(db.String(100), nullable=True)
    zip      = db.Column(db.String(20),  nullable=True)

    address = db.Column(db.String(255), nullable=True)  # composed optional

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "email": self.email, "phone": self.phone,
            "birthdate": self.birthdate, "citizenship": self.citizenship, "ssn_tax_id": "***" if self.ssn_tax_id else None,
            "address1": self.address1, "address2": self.address2, "country": self.country, "city": self.city,
            "state": self.state, "zip": self.zip, "address": self.address,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ------------------ SharePoint Connection ------------------
class SharePointConnection(db.Model):
    __tablename__ = "sp_connections"

    id      = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)

    url     = db.Column(db.Text, nullable=False)
    drive_id= db.Column(db.String(200), nullable=False)
    item_id = db.Column(db.String(200), nullable=False)

    added_at = db.Column(db.DateTime, default=datetime.utcnow)
    added_by = db.Column(db.String(200), nullable=True)

    # merged extras
    is_shared  = db.Column(db.Boolean, nullable=False, default=False, server_default="0")
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    updated_at = db.Column(db.DateTime, server_default=db.func.now(), onupdate=db.func.now())

    __table_args__ = (db.UniqueConstraint("user_id", "item_id", name="uq_spconn_user_item"),)

    def to_dict(self):
        return {
            "id": str(self.id), "user_id": self.user_id, "url": self.url,
            "drive_id": self.drive_id, "item_id": self.item_id,
            "added_at": self.added_at.isoformat() if self.added_at else None,
            "added_by": self.added_by,
        }


# ------------------ File uploads (Files section) ------------------
class FileNode(db.Model):
    __tablename__ = "file_nodes"

    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    scope    = db.Column(db.String(20),  nullable=False)  # 'direct' | 'shared'
    name     = db.Column(db.String(255), nullable=False)
    type     = db.Column(db.String(20),  nullable=False)  # 'folder' | 'file'
    parent_id= db.Column(db.Integer, db.ForeignKey("file_nodes.id"), nullable=True)
    path     = db.Column(db.Text, nullable=False)
    permission= db.Column(db.String(50), default="Investor")
    created_at= db.Column(db.DateTime, default=datetime.utcnow)
    updated_at= db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    parent = db.relationship("FileNode", remote_side=[id], backref="children")

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "type": self.type, "permission": self.permission,
            "dateUploaded": self.created_at.isoformat() if self.created_at else None,
            "children": [],
        }


# ===== PortfolioPeriodMetric (SharePoint monthly rollups) =====
class PortfolioPeriodMetric(db.Model):
    __tablename__ = "portfolio_period_metrics"

    id    = db.Column(db.Integer, primary_key=True)
    sheet = db.Column(db.String(120), nullable=False, index=True)
    as_of_date = db.Column(db.Date, nullable=False, index=True)

    beginning_balance    = db.Column(db.Float, nullable=True)
    ending_balance       = db.Column(db.Float, nullable=True)
    unrealized_gain_loss = db.Column(db.Float, nullable=True)
    realized_gain_loss   = db.Column(db.Float, nullable=True)
    management_fees      = db.Column(db.Float, nullable=True)

    source     = db.Column(db.String(40), nullable=False, default="sharepoint-live")
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (UniqueConstraint("sheet", "as_of_date", name="uq_sheet_asof"),)

    def to_dict(self):
        return {
            "sheet": self.sheet, "as_of_date": self.as_of_date.isoformat(),
            "beginning_balance": self.beginning_balance, "ending_balance": self.ending_balance,
            "unrealized_gain_loss": self.unrealized_gain_loss, "realized_gain_loss": self.realized_gain_loss,
            "management_fees": self.management_fees, "source": self.source,
        }


# --- replace these three classes in models.py ---

class Investment(db.Model):
    __tablename__ = "investments"
    __table_args__ = {"sqlite_autoincrement": True}

    id         = db.Column(db.Integer, primary_key=True)  # <- Integer for SQLite
    name       = db.Column(db.String(255), nullable=False, unique=True, index=True)
    color_hex  = db.Column(db.String(7), nullable=True)
    industry   = db.Column(db.String(120), nullable=True)
    is_active  = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    values = db.relationship(
        "PortfolioInvestmentValue",
        backref="investment",
        lazy=True,
        cascade="all, delete-orphan",
        primaryjoin="Investment.id==PortfolioInvestmentValue.investment_id",
    )

    def to_dict(self) -> dict:
        return {
            "id": int(self.id) if self.id is not None else None,
            "name": self.name,
            "color_hex": self.color_hex,
            "industry": self.industry,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class DataSource(db.Model):
    __tablename__ = "data_sources"
    __table_args__ = {"sqlite_autoincrement": True}

    id         = db.Column(db.Integer, primary_key=True)  # <- Integer for SQLite
    kind       = db.Column(db.String(30), nullable=False)     # 'sharepoint' | 'upload'
    drive_id   = db.Column(db.String(200), nullable=True)
    item_id    = db.Column(db.String(200), nullable=True)
    file_name  = db.Column(db.String(255), nullable=True)
    sheet_name = db.Column(db.String(255), nullable=True)
    added_by   = db.Column(db.String(200), nullable=True)
    added_at   = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": int(self.id) if self.id is not None else None,
            "kind": self.kind, "drive_id": self.drive_id, "item_id": self.item_id,
            "file_name": self.file_name, "sheet_name": self.sheet_name,
            "added_by": self.added_by, "added_at": self.added_at.isoformat() if self.added_at else None,
        }


class PortfolioInvestmentValue(db.Model):
    __tablename__ = "portfolio_investment_values"
    __table_args__ = (
        db.UniqueConstraint("investment_id", "as_of_date", name="uq_investment_asof"),
        {"sqlite_autoincrement": True},
    )

    id             = db.Column(db.Integer, primary_key=True)  # <- Integer for SQLite
    investment_id  = db.Column(db.Integer, db.ForeignKey("investments.id", ondelete="CASCADE"), nullable=False, index=True)
    as_of_date     = db.Column(db.Date, nullable=False, index=True)
    value          = db.Column(db.Numeric(18, 2), nullable=False)
    source         = db.Column(db.String(50), default="valuation_sheet")
    source_id      = db.Column(db.Integer, db.ForeignKey("data_sources.id"), nullable=True)  # <- Integer FK
    row_hash       = db.Column(db.String(40), nullable=True)
    created_at     = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": int(self.id) if self.id is not None else None,
            "investment_id": int(self.investment_id) if self.investment_id is not None else None,
            "as_of_date": self.as_of_date.isoformat() if self.as_of_date else None,
            "value": float(self.value) if self.value is not None else None,
            "source": self.source,
            "source_id": int(self.source_id) if self.source_id is not None else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }



# ===== QuickBooks connection (per user/company) =====
class QuickBooksConnection(db.Model):
    __tablename__ = "quickbooks_connections"

    id      = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    realm_id= db.Column(db.String(32), nullable=False, index=True)
    environment = db.Column(db.String(16), nullable=False, default="sandbox")

    token_type    = db.Column(db.String(16), default="bearer")
    access_token  = db.Column(db.Text, nullable=False)
    refresh_token = db.Column(db.Text, nullable=False)
    expires_at    = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = db.relationship("User", back_populates="qbo_connections")


# ===== QBO monthly rollups (optional) =====
class QboPeriodMetric(db.Model):
    __tablename__ = "qbo_period_metrics"

    id         = db.Column(db.Integer, primary_key=True)
    realm_id   = db.Column(db.String(32), nullable=False, index=True)
    sheet      = db.Column(db.String(64), default="QBO (BS+PL)")
    as_of_date = db.Column(db.Date, nullable=False, index=True)

    beginning_balance    = db.Column(db.Float, nullable=True)
    ending_balance       = db.Column(db.Float, nullable=True)
    unrealized_gain_loss = db.Column(db.Float, nullable=True)
    realized_gain_loss   = db.Column(db.Float, nullable=True)
    management_fees      = db.Column(db.Float, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (db.UniqueConstraint("realm_id", "sheet", "as_of_date", name="uq_qbo_period_metrics_unique"),)


# ===== QBO raw entities dump =====
class QboEntity(db.Model):
    __tablename__ = "qbo_entities"

    id          = db.Column(db.Integer, primary_key=True)
    realm_id    = db.Column(db.String(32), nullable=False, index=True)
    entity_type = db.Column(db.String(64), nullable=False, index=True)  # "Invoice", "Customer", etc.
    qbo_id      = db.Column(db.String(64), nullable=False)

    txn_date    = db.Column(db.Date, nullable=True, index=True)
    doc_number  = db.Column(db.String(64), nullable=True, index=True)
    name        = db.Column(db.String(255), nullable=True, index=True)
    total_amount= db.Column(db.Float, nullable=True)

    raw_json    = db.Column(db.Text, nullable=False)

    created_at  = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at  = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (db.UniqueConstraint("realm_id", "entity_type", "qbo_id", name="uq_qbo_entity_unique"),)

    def to_dict(self) -> dict:
        return {
            "realm_id": self.realm_id, "entity_type": self.entity_type, "qbo_id": self.qbo_id,
            "txn_date": self.txn_date.isoformat() if self.txn_date else None,
            "doc_number": self.doc_number, "name": self.name, "total_amount": self.total_amount,
        }


# ===== QBO sync run logs =====
class QboSyncLog(db.Model):
    __tablename__ = "qbo_sync_logs"

    id       = db.Column(db.Integer, primary_key=True)
    realm_id = db.Column(db.String(32), nullable=False, index=True)
    ran_at   = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    from_date= db.Column(db.Date, nullable=True)
    to_date  = db.Column(db.Date, nullable=True)
    entities = db.Column(db.Text, nullable=False)   # comma-separated list
    stats_json = db.Column(db.Text, nullable=True)  # {"Invoice": 120, ...}

    def to_dict(self) -> dict:
        return {
            "realm_id": self.realm_id, "ran_at": self.ran_at.isoformat(),
            "from_date": self.from_date.isoformat() if self.from_date else None,
            "to_date": self.to_date.isoformat() if self.to_date else None,
            "entities": self.entities.split(","), "stats": json.loads(self.stats_json) if self.stats_json else {},
        }


# ===== Market data (kept) =====
class MarketPrice(db.Model):
    __tablename__ = "market_prices"

    id     = db.Column(db.Integer, primary_key=True)
    symbol = db.Column(db.String(32), nullable=False, index=True)
    date   = db.Column(db.Date, nullable=False, index=True)

    open  = db.Column(db.Float)
    high  = db.Column(db.Float)
    low   = db.Column(db.Float)
    close = db.Column(db.Float)
    adj_close = db.Column(db.Float)
    volume    = db.Column(db.BigInteger)

    source     = db.Column(db.String(32), nullable=False, default="yfinance")
    created_at = db.Column(db.DateTime, server_default=db.func.now(), nullable=False)
    updated_at = db.Column(db.DateTime, server_default=db.func.now(), onupdate=db.func.now(), nullable=False)

    __table_args__ = (db.UniqueConstraint("symbol", "date", name="uq_market_prices_symbol_date"),)

    def to_dict(self):
        return {
            "symbol": self.symbol, "date": self.date.isoformat(),
            "open": self.open, "high": self.high, "low": self.low,
            "close": self.close, "adj_close": self.ad_close if hasattr(self, "ad_close") else self.adj_close,
            "volume": self.volume, "source": self.source,
        }


# --- Documents (admin uploads shared to investors) ---
class Document(db.Model):
    __tablename__ = "documents"
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255))
    original_name = db.Column(db.String(255), nullable=False)
    stored_name = db.Column(db.String(255), nullable=False, unique=True)
    mime_type = db.Column(db.String(128))
    size_bytes = db.Column(db.Integer)
    # NOTE: FK points to 'user.id' (singular), matching the User table name
    uploaded_by_user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)

    shares = db.relationship("DocumentShare", backref="document", cascade="all,delete-orphan")

class DocumentShare(db.Model):
    __tablename__ = "document_shares"
    id = db.Column(db.Integer, primary_key=True)
    document_id = db.Column(db.Integer, db.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    # NOTE: also singular 'user.id'
    investor_user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    shared_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("document_id", "investor_user_id", name="uq_doc_investor"),
    )


class Statement(db.Model):
    __tablename__ = "statements"
    id = db.Column(db.Integer, primary_key=True)
    investor_id = db.Column(db.Integer, db.ForeignKey("investor.id"), nullable=False)
    investor_name = db.Column(db.String(255), nullable=False)        # denormalized for faster list views
    entity_name = db.Column(db.String(255), nullable=False)          # e.g., "Elpis Opportunity Fund LP"
    period_start = db.Column(db.Date, nullable=False)
    period_end   = db.Column(db.Date, nullable=False)
    beginning_balance = db.Column(db.Numeric(18,2), nullable=False)
    contributions     = db.Column(db.Numeric(18,2), nullable=False, default=0)
    distributions     = db.Column(db.Numeric(18,2), nullable=False, default=0)
    unrealized_gl     = db.Column(db.Numeric(18,2), nullable=False, default=0)
    incentive_fees    = db.Column(db.Numeric(18,2), nullable=False, default=0)
    management_fees   = db.Column(db.Numeric(18,2), nullable=False, default=0)
    operating_expenses= db.Column(db.Numeric(18,2), nullable=False, default=0)
    adjustment        = db.Column(db.Numeric(18,2), nullable=False, default=0)
    net_income_loss   = db.Column(db.Numeric(18,2), nullable=False)
    ending_balance    = db.Column(db.Numeric(18,2), nullable=False)
    ownership_percent = db.Column(db.Numeric(9,6), nullable=True)   # e.g., 2.3484%
    roi_pct           = db.Column(db.Numeric(9,4), nullable=True)   # e.g., -0.709%
    pdf_path          = db.Column(db.String(512), nullable=True)     # saved PDF
    created_at        = db.Column(db.DateTime, server_default=db.func.now())
    __table_args__ = (db.UniqueConstraint('investor_id','period_start','period_end', name='uix_statement_quarter'),)




class InvestorAccreditation(db.Model):
    __tablename__ = "investor_accreditation"

    id = db.Column(db.Integer, primary_key=True)
    investor_id = db.Column(
        db.Integer,
        db.ForeignKey("investor.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,  # one record per investor
    )
    selection = db.Column(db.String(64), nullable=False)          # e.g. "inv_5m", "not_yet", ...
    accredited = db.Column(db.Boolean, nullable=False, server_default=db.text("false"))
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = db.Column(db.DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    investor = db.relationship("Investor", backref=db.backref("accreditation", uselist=False, cascade="all, delete"))
