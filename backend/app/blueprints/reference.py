from flask import Blueprint, jsonify, request

from app.cashflow import account_balances
from app.auth import owner_required
from app.extensions import db
from app.models import Account, Category

bp = Blueprint("reference", __name__, url_prefix="/api")


@bp.get("/accounts")
def list_accounts():
    return jsonify([a.to_dict() for a in Account.query.order_by(Account.id)])


@bp.get("/accounts/balances")
def list_account_balances():
    """Closing balance per account. Backed by the worked example in app/cashflow.py."""
    return jsonify(account_balances())


@bp.get("/categories")
def list_categories():
    rows = Category.query.filter_by(is_archived=False).order_by(Category.type, Category.name)
    return jsonify([c.to_dict() for c in rows])


@bp.post("/accounts")
@owner_required
def create_account():
    """US-02, FR-04. An opening balance may legitimately be negative (an overdraft)."""
    from app.money import MoneyError, to_minor

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify(error="name is required"), 422
    if data.get("type") not in {"cash", "bank"}:
        return jsonify(error="type must be either 'cash' or 'bank'"), 422

    raw = data.get("opening_balance", "0")
    try:
        # to_minor rejects zero and negatives, which is right for a payment but wrong
        # for an opening balance, so parse the magnitude and reapply the sign.
        text = str(raw).strip()
        negative = text.startswith("-")
        opening = 0 if text.lstrip("-") in ("", "0", "0.00") else to_minor(text.lstrip("-"))
        opening = -opening if negative else opening
    except MoneyError as exc:
        return jsonify(error=str(exc)), 422

    account = Account(name=name, type=data["type"], opening_balance_minor=opening)
    db.session.add(account)
    db.session.commit()
    return jsonify(account.to_dict()), 201


@bp.post("/categories")
@owner_required
def create_category():
    """US-03, FR-05. A category is income or expense, never both."""
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify(error="name is required"), 422
    if data.get("type") not in {"income", "expense"}:
        return jsonify(error="type must be either 'income' or 'expense'"), 422
    if Category.query.filter_by(name=name, type=data["type"]).first():
        return jsonify(error="That category already exists"), 409

    category = Category(name=name, type=data["type"])
    db.session.add(category)
    db.session.commit()
    return jsonify(category.to_dict()), 201


@bp.patch("/categories/<int:category_id>")
@owner_required
def update_category(category_id: int):
    """FR-05. Rename or archive a category.

    The type is deliberately not editable: flipping income to expense would silently
    invert every historical transaction filed under it.
    """
    category = db.session.get(Category, category_id)
    if category is None:
        return jsonify(error="Category not found"), 404

    data = request.get_json(silent=True) or {}
    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return jsonify(error="name cannot be empty"), 422
        clash = Category.query.filter(
            Category.name == name, Category.type == category.type, Category.id != category.id
        ).first()
        if clash:
            return jsonify(error="Another category already uses that name"), 409
        category.name = name
    if "is_archived" in data:
        category.is_archived = bool(data["is_archived"])
    if "type" in data and data["type"] != category.type:
        return jsonify(error="A category's type cannot be changed once it is in use"), 422

    db.session.commit()
    return jsonify(category.to_dict())
