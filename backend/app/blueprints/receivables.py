from datetime import date, datetime

from flask import Blueprint, g, jsonify, request

from app.auth import login_required, owner_required
from app.extensions import db
from app.models import Account, Bill, BusinessProfile, Category, Invoice, Transaction

bp = Blueprint("receivables", __name__, url_prefix="/api")


@bp.get("/invoices")
def list_invoices():
    """Customer invoices — money owed to the business (FR-15).

    Plain read with an optional status filter. The 30-day totals and the overdue
    summary on the dashboard are a separate job; see cashflow.due_next_30_days().
    """
    q = Invoice.query
    status = request.args.get("status")
    if status in {"unpaid", "paid", "cancelled"}:
        q = q.filter(Invoice.status == status)
    rows = q.order_by(Invoice.due_date).all()
    return jsonify([i.to_dict() for i in rows])


@bp.get("/bills")
def list_bills():
    """Supplier bills — money the business owes (FR-15)."""
    q = Bill.query
    status = request.args.get("status")
    if status in {"unpaid", "paid", "cancelled"}:
        q = q.filter(Bill.status == status)
    rows = q.order_by(Bill.due_date).all()
    return jsonify([b.to_dict() for b in rows])


def _mark_paid(record, *, income: bool, counterparty: str, label: str):
    """FR-17: marking a document paid creates the transaction that settles it.

    The two stay linked, so the money appears in the ledger exactly once and the
    document can be traced to the payment that cleared it.
    """
    if record.status == "paid":
        return jsonify(error=f"That {label} is already marked paid"), 409
    if record.status == "cancelled":
        return jsonify(error=f"A cancelled {label} cannot be paid"), 409

    data = request.get_json(silent=True) or {}

    account = db.session.get(Account, data.get("account_id"))
    if account is None:
        return jsonify(error="account_id is required and must exist"), 422

    category = db.session.get(Category, data.get("category_id"))
    wanted = "income" if income else "expense"
    if category is None or category.type != wanted:
        return jsonify(error=f"category_id is required and must be an {wanted} category"), 422

    paid_on = data.get("paid_on")
    try:
        occurred = datetime.strptime(paid_on, "%Y-%m-%d").date() if paid_on else date.today()
    except ValueError:
        return jsonify(error="paid_on must be in YYYY-MM-DD format"), 422
    if occurred > date.today():
        return jsonify(error="paid_on cannot be in the future"), 422

    txn = Transaction(
        type=wanted,
        amount_minor=record.amount_minor,
        occurred_on=occurred,
        description=f"{label.title()} settled — {counterparty}",
        method=data.get("method") if data.get("method") in {"cash", "card", "transfer", "other"} else "transfer",
        account_id=account.id,
        category_id=category.id,
        recorded_by=g.current_user.id,
    )
    if isinstance(record, Invoice):
        txn.invoice_id = record.id
    else:
        txn.bill_id = record.id

    record.status = "paid"
    db.session.add(txn)
    db.session.commit()

    return jsonify(document=record.to_dict(), transaction=txn.to_dict()), 201


@bp.post("/invoices/<int:invoice_id>/pay")
@login_required
def pay_invoice(invoice_id: int):
    """US-11, FR-17. Money in — the customer has paid."""
    inv = db.session.get(Invoice, invoice_id)
    if inv is None:
        return jsonify(error="Invoice not found"), 404
    return _mark_paid(inv, income=True, counterparty=inv.customer_name, label="invoice")


@bp.post("/bills/<int:bill_id>/pay")
@login_required
def pay_bill(bill_id: int):
    """US-11, FR-17. Money out — the supplier has been paid."""
    bill = db.session.get(Bill, bill_id)
    if bill is None:
        return jsonify(error="Bill not found"), 404
    return _mark_paid(bill, income=False, counterparty=bill.supplier_name, label="bill")


@bp.post("/invoices")
@owner_required
def create_invoice():
    """US-11, FR-15. Record money a customer owes."""
    from app.money import MoneyError, to_minor

    data = request.get_json(silent=True) or {}
    number = (data.get("number") or "").strip()
    customer = (data.get("customer_name") or "").strip()
    if not number or not customer:
        return jsonify(error="number and customer_name are required"), 422
    if Invoice.query.filter_by(number=number).first():
        return jsonify(error="An invoice with that number already exists"), 409
    try:
        amount = to_minor(data.get("amount"))
    except MoneyError as exc:
        return jsonify(error=str(exc)), 422
    try:
        issue = datetime.strptime(data["issue_date"], "%Y-%m-%d").date()
        due = datetime.strptime(data["due_date"], "%Y-%m-%d").date()
    except (KeyError, TypeError, ValueError):
        return jsonify(error="issue_date and due_date are required, in YYYY-MM-DD format"), 422
    if due < issue:
        return jsonify(error="due_date cannot be before issue_date"), 422

    inv = Invoice(number=number, customer_name=customer, amount_minor=amount,
                  issue_date=issue, due_date=due, status="unpaid")
    db.session.add(inv)
    db.session.commit()
    return jsonify(inv.to_dict()), 201


@bp.post("/bills")
@owner_required
def create_bill():
    """US-11, FR-15. Record money owed to a supplier."""
    from app.money import MoneyError, to_minor

    data = request.get_json(silent=True) or {}
    supplier = (data.get("supplier_name") or "").strip()
    if not supplier:
        return jsonify(error="supplier_name is required"), 422
    try:
        amount = to_minor(data.get("amount"))
    except MoneyError as exc:
        return jsonify(error=str(exc)), 422
    try:
        due = datetime.strptime(data["due_date"], "%Y-%m-%d").date()
    except (KeyError, TypeError, ValueError):
        return jsonify(error="due_date is required, in YYYY-MM-DD format"), 422

    bill = Bill(supplier_name=supplier, amount_minor=amount, due_date=due, status="unpaid")
    db.session.add(bill)
    db.session.commit()
    return jsonify(bill.to_dict()), 201


@bp.get("/business")
def business_profile():
    """The details printed at the top of an invoice."""
    profile = db.session.get(BusinessProfile, 1)
    return jsonify(profile.to_dict() if profile else {})


@bp.patch("/business")
@owner_required
def update_business_profile():
    profile = db.session.get(BusinessProfile, 1)
    if profile is None:
        return jsonify(error="Business profile not set up"), 404

    data = request.get_json(silent=True) or {}
    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return jsonify(error="name cannot be empty"), 422
        profile.name = name
    for field in ("address", "email", "phone"):
        if field in data:
            setattr(profile, field, (data[field] or "").strip() or None)

    db.session.commit()
    return jsonify(profile.to_dict())


@bp.get("/invoices/<int:invoice_id>")
def get_invoice(invoice_id: int):
    """One invoice, with the business details needed to render it as a document."""
    inv = db.session.get(Invoice, invoice_id)
    if inv is None:
        return jsonify(error="Invoice not found"), 404

    profile = db.session.get(BusinessProfile, 1)
    settled = Transaction.query.filter_by(invoice_id=inv.id).first()
    return jsonify(
        invoice=inv.to_dict(),
        business=profile.to_dict() if profile else {},
        settled_by=settled.to_dict() if settled else None,
    )
