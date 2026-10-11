from datetime import date, datetime

import csv
import io

from flask import g, Blueprint, Response, jsonify, request

from app.auth import login_required, owner_required
from app.cashflow import running_balances
from app.money import MoneyError, to_major, to_minor
from app.models import Account, Category, Transaction, TransactionAudit, snapshot
from app.extensions import db

bp = Blueprint("transactions", __name__, url_prefix="/api/transactions")

PAGE_SIZE_MAX = 200


def _parse_date(raw: str | None) -> date | None:
    if not raw:
        return None
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError:
        return None


@bp.get("")
def list_transactions():
    """Filterable transaction list (US-06, FR-09).

    Query params: from, to (YYYY-MM-DD), type, category_id, account_id, limit, offset.
    """
    q = Transaction.query

    start = _parse_date(request.args.get("from"))
    end = _parse_date(request.args.get("to"))
    if start:
        q = q.filter(Transaction.occurred_on >= start)
    if end:
        q = q.filter(Transaction.occurred_on <= end)

    txn_type = request.args.get("type")
    if txn_type in {"income", "expense"}:
        q = q.filter(Transaction.type == txn_type)

    for param, column in (("category_id", Transaction.category_id), ("account_id", Transaction.account_id)):
        raw = request.args.get(param)
        if raw and raw.isdigit():
            q = q.filter(column == int(raw))

    total = q.count()
    limit = min(int(request.args.get("limit", 50)), PAGE_SIZE_MAX)
    offset = int(request.args.get("offset", 0))
    rows = q.order_by(Transaction.occurred_on.desc(), Transaction.id.desc()).limit(limit).offset(offset)

    items = [t.to_dict() for t in rows]

    # FR-10: the cash balance after each entry, so any figure on the dashboard can be
    # traced down to the row that produced it.
    balances = running_balances([i["id"] for i in items])
    for item in items:
        item["balance_after_minor"] = balances.get(item["id"])

    return jsonify(total=total, limit=limit, offset=offset, items=items)


@bp.post("")
def create_transaction():
    """Record income or an expense (US-04, US-05, FR-06, FR-07)."""
    data = request.get_json(silent=True) or {}

    txn_type = data.get("type")
    if txn_type not in {"income", "expense"}:
        return jsonify(error="type must be either 'income' or 'expense'"), 422

    raw_amount = data.get("amount")
    if raw_amount is None:
        return jsonify(error="amount is required"), 422

    try:
        amount_minor = to_minor(raw_amount)
    except MoneyError as exc:
        return jsonify(error=str(exc)), 422

    if amount_minor <= 0:
        return jsonify(error="amount must be greater than zero"), 422

    raw_date = data.get("occurred_on")
    if not raw_date:
        return jsonify(error="occurred_on is required"), 422

    occurred_on = _parse_date(raw_date)
    if occurred_on is None:
        return jsonify(error="occurred_on must be in YYYY-MM-DD format"), 422

    if occurred_on > date.today():
        return jsonify(error="occurred_on cannot be in the future"), 422

    account_id = data.get("account_id")
    if account_id is None:
        return jsonify(error="account_id is required"), 422

    account = Account.query.get(account_id)
    if account is None:
        return jsonify(error="account does not exist"), 422

    category_id = data.get("category_id")
    if category_id is None:
        return jsonify(error="category_id is required"), 422

    category = Category.query.get(category_id)
    if category is None:
        return jsonify(error="category does not exist"), 422

    if category.type != txn_type:
        return jsonify(
            error=f"category type '{category.type}' does not match transaction type '{txn_type}'"
        ), 422

    description = (data.get("description") or "").strip()
    if not description:
        return jsonify(error="description is required"), 422

    transaction = Transaction(
        type=txn_type,
        amount_minor=amount_minor,
        occurred_on=occurred_on,
        description=description,
        category_id=category_id,
        account_id=account_id,
        method=data.get("method"),
        recorded_by=1,  # TODO: use the authenticated user once auth lands
    )

    db.session.add(transaction)
    db.session.commit()

    return jsonify(transaction.to_dict()), 201

def _validate(data: dict, *, partial: bool = False) -> tuple[dict | None, tuple | None]:
    """Shared validation for create and edit. Returns (values, error_response)."""
    out: dict = {}

    if "type" in data or not partial:
        if data.get("type") not in {"income", "expense"}:
            return None, (jsonify(error="type must be either 'income' or 'expense'"), 422)
        out["type"] = data["type"]

    if "amount" in data or not partial:
        try:
            out["amount_minor"] = to_minor(data.get("amount"))
        except MoneyError as exc:
            return None, (jsonify(error=str(exc)), 422)

    if "occurred_on" in data or not partial:
        occurred = _parse_date(data.get("occurred_on"))
        if occurred is None:
            return None, (jsonify(error="occurred_on must be in YYYY-MM-DD format"), 422)
        if occurred > date.today():
            return None, (jsonify(error="occurred_on cannot be in the future"), 422)
        out["occurred_on"] = occurred

    if "description" in data or not partial:
        description = (data.get("description") or "").strip()
        if not description:
            return None, (jsonify(error="description is required"), 422)
        out["description"] = description

    if "account_id" in data or not partial:
        if db.session.get(Account, data.get("account_id")) is None:
            return None, (jsonify(error="account does not exist"), 422)
        out["account_id"] = data["account_id"]

    if "category_id" in data or not partial:
        category = db.session.get(Category, data.get("category_id"))
        if category is None:
            return None, (jsonify(error="category does not exist"), 422)
        out["category_id"] = data["category_id"]
        out["_category"] = category

    if "method" in data and data["method"] in {"cash", "card", "transfer", "other"}:
        out["method"] = data["method"]

    return out, None


@bp.patch("/<int:txn_id>")
@login_required
def update_transaction(txn_id: int):
    """Correct a transaction (US-07, FR-08).

    Staff may only edit entries they created themselves; the owner may edit any.
    """
    txn = db.session.get(Transaction, txn_id)
    if txn is None:
        return jsonify(error="Transaction not found"), 404
    if g.current_user.role != "owner" and txn.recorded_by != g.current_user.id:
        return jsonify(error="You can only edit entries you recorded"), 403

    values, err = _validate(request.get_json(silent=True) or {}, partial=True)
    if err:
        return err

    category = values.pop("_category", None)
    effective_type = values.get("type", txn.type)
    if category is not None and category.type != effective_type:
        return jsonify(
            error=f"category type '{category.type}' does not match transaction type '{effective_type}'"
        ), 422

    # FR-08: record what it was before touching it.
    db.session.add(TransactionAudit(
        transaction_id=txn.id, action="update",
        changed_by=g.current_user.id, previous=snapshot(txn),
    ))
    for field, value in values.items():
        setattr(txn, field, value)
    db.session.commit()
    return jsonify(txn.to_dict())


@bp.delete("/<int:txn_id>")
@login_required
def delete_transaction(txn_id: int):
    """Delete a transaction (US-07). Owner only — deleting money is not a staff action."""
    if g.current_user.role != "owner":
        return jsonify(error="Only the business owner can delete a transaction"), 403

    txn = db.session.get(Transaction, txn_id)
    if txn is None:
        return jsonify(error="Transaction not found"), 404

    db.session.add(TransactionAudit(
        transaction_id=txn.id, action="delete",
        changed_by=g.current_user.id, previous=snapshot(txn),
    ))
    db.session.delete(txn)
    db.session.commit()
    return "", 204


@bp.get("/export.csv")
@owner_required
def export_csv():
    """US-13, FR-19. Amounts are rendered in major units for the accountant."""
    q = Transaction.query
    start = _parse_date(request.args.get("from"))
    end = _parse_date(request.args.get("to"))
    if start:
        q = q.filter(Transaction.occurred_on >= start)
    if end:
        q = q.filter(Transaction.occurred_on <= end)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Date", "Description", "Category", "Account", "Type", "Amount", "Method"])
    for t in q.order_by(Transaction.occurred_on, Transaction.id):
        writer.writerow([
            t.occurred_on.isoformat(), t.description,
            t.category.name if t.category else "",
            t.account.name if t.account else "",
            t.type, to_major(t.amount_minor), t.method,
        ])

    stamp = f"{start or 'all'}_{end or 'all'}"
    return Response(
        buf.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f'attachment; filename="transactions_{stamp}.csv"'},
    )


@bp.get("/<int:txn_id>/history")
@login_required
def transaction_history(txn_id: int):
    """FR-08. What this transaction used to say, and who changed it."""
    rows = (
        TransactionAudit.query.filter_by(transaction_id=txn_id)
        .order_by(TransactionAudit.created_at.desc())
        .all()
    )
    return jsonify([r.to_dict() for r in rows])
