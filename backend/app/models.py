"""SQLAlchemy models mirroring db/init/01-schema.sql.

Every *_minor column is an integer number of cents. See app/money.py.
"""
from datetime import date, datetime

from sqlalchemy import (
    JSON, BigInteger, Boolean, Date, DateTime, Enum, ForeignKey, Integer, String, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db


class User(db.Model):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(190), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(Enum("owner", "staff"), default="owner")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Account(db.Model):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    type: Mapped[str] = mapped_column(Enum("cash", "bank"), default="cash")
    opening_balance_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "opening_balance_minor": self.opening_balance_minor,
        }


class Category(db.Model):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    type: Mapped[str] = mapped_column(Enum("income", "expense"))
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)

    def to_dict(self) -> dict:
        return {"id": self.id, "name": self.name, "type": self.type}


class Invoice(db.Model):
    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    number: Mapped[str] = mapped_column(String(40), unique=True)
    customer_name: Mapped[str] = mapped_column(String(160))
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    issue_date: Mapped[date] = mapped_column(Date)
    due_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(Enum("unpaid", "paid", "cancelled"), default="unpaid")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    def days_overdue(self, today: date | None = None) -> int:
        """Positive when past due. Calculated on read, never stored — FR-16."""
        today = today or date.today()
        return max(0, (today - self.due_date).days) if self.status == "unpaid" else 0

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "number": self.number,
            "customer_name": self.customer_name,
            "amount_minor": self.amount_minor,
            "issue_date": self.issue_date.isoformat(),
            "due_date": self.due_date.isoformat(),
            "status": self.status,
            "days_overdue": self.days_overdue(),
        }


class Bill(db.Model):
    __tablename__ = "bills"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    supplier_name: Mapped[str] = mapped_column(String(160))
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    due_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(Enum("unpaid", "paid", "cancelled"), default="unpaid")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    def days_overdue(self, today: date | None = None) -> int:
        today = today or date.today()
        return max(0, (today - self.due_date).days) if self.status == "unpaid" else 0

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "supplier_name": self.supplier_name,
            "amount_minor": self.amount_minor,
            "due_date": self.due_date.isoformat(),
            "status": self.status,
            "days_overdue": self.days_overdue(),
        }


class Transaction(db.Model):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[str] = mapped_column(Enum("income", "expense"))
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    occurred_on: Mapped[date] = mapped_column(Date)
    description: Mapped[str] = mapped_column(String(255))
    method: Mapped[str] = mapped_column(Enum("cash", "card", "transfer", "other"), default="cash")
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    invoice_id: Mapped[int | None] = mapped_column(ForeignKey("invoices.id"))
    bill_id: Mapped[int | None] = mapped_column(ForeignKey("bills.id"))
    recorded_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    account: Mapped["Account"] = relationship(lazy="joined")
    category: Mapped["Category"] = relationship(lazy="joined")

    @property
    def signed_minor(self) -> int:
        """Income is positive, expense negative. The only place the sign is decided."""
        return self.amount_minor if self.type == "income" else -self.amount_minor

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "type": self.type,
            "amount_minor": self.amount_minor,
            "signed_minor": self.signed_minor,
            "occurred_on": self.occurred_on.isoformat(),
            "description": self.description,
            "method": self.method,
            "account": self.account.name if self.account else None,
            "category": self.category.name if self.category else None,
        }


class TransactionAudit(db.Model):
    """The prior state of a transaction, written before it is changed (FR-08)."""

    __tablename__ = "transaction_audit"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transaction_id: Mapped[int] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(Enum("update", "delete"))
    changed_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    previous: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "transaction_id": self.transaction_id,
            "action": self.action,
            "changed_by": self.changed_by,
            "previous": self.previous,
            "created_at": self.created_at.isoformat(),
        }


def snapshot(txn) -> dict:
    """The fields worth preserving — enough to reconstruct the row as it was."""
    return {
        "type": txn.type,
        "amount_minor": txn.amount_minor,
        "occurred_on": txn.occurred_on.isoformat(),
        "description": txn.description,
        "method": txn.method,
        "account_id": txn.account_id,
        "category_id": txn.category_id,
    }


class BusinessProfile(db.Model):
    """The business's own details, shown at the top of a printed invoice."""

    __tablename__ = "business_profile"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    name: Mapped[str] = mapped_column(String(160))
    address: Mapped[str | None] = mapped_column(String(400))
    email: Mapped[str | None] = mapped_column(String(190))
    phone: Mapped[str | None] = mapped_column(String(60))
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    def to_dict(self) -> dict:
        return {"name": self.name, "address": self.address,
                "email": self.email, "phone": self.phone}
