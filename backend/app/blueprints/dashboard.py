from datetime import date, datetime, timedelta

from flask import Blueprint, jsonify, request

from app import cashflow

bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")


def _not_implemented(name: str):
    return jsonify(
        error=f"cashflow.{name}() is not implemented yet",
        hint="See backend/app/cashflow.py",
    ), 501


@bp.get("/summary")
def summary():
    """The four headline tiles: cash on hand, money in, money out, net (FR-11, FR-12)."""
    today = date.today()
    start = today.replace(day=1)
    try:
        totals = cashflow.period_totals(start, today)
        cash = cashflow.cash_on_hand()
    except NotImplementedError:
        return _not_implemented("period_totals / cash_on_hand")
    return jsonify(period_start=start.isoformat(), period_end=today.isoformat(),
                   cash_on_hand_minor=cash, **totals)


@bp.get("/monthly")
def monthly():
    """Money in vs money out for the last N months (FR-13)."""
    months = min(int(request.args.get("months", 6)), 24)
    try:
        return jsonify(months=cashflow.monthly_series(months))
    except NotImplementedError:
        return _not_implemented("monthly_series")


@bp.get("/categories")
def by_category():
    """Spending by category for the current month (FR-14)."""
    today = date.today()
    try:
        return jsonify(categories=cashflow.spending_by_category(today.replace(day=1), today))
    except NotImplementedError:
        return _not_implemented("spending_by_category")


@bp.get("/upcoming")
def upcoming():
    """Due in the next 30 days, plus the overdue list (FR-15, FR-16)."""
    try:
        return jsonify(cashflow.due_next_30_days())
    except NotImplementedError:
        return _not_implemented("due_next_30_days")


@bp.get("/report")
def report_endpoint():
    """A cash flow statement (FR-18, US-13).

    ?mode=monthly&year=&month=   a calendar month, the default
    ?mode=daily&date=YYYY-MM-DD  one day, with that day's entries included
    """
    today = date.today()
    mode = request.args.get("mode", "monthly")

    if mode == "daily":
        raw = request.args.get("date")
        try:
            day = datetime.strptime(raw, "%Y-%m-%d").date() if raw else today
        except ValueError:
            return jsonify(error="date must be in YYYY-MM-DD format"), 422
        try:
            return jsonify(cashflow.daily_report(day))
        except NotImplementedError:
            return _not_implemented("daily_report")

    if mode != "monthly":
        return jsonify(error="mode must be 'monthly' or 'daily'"), 422

    try:
        year = int(request.args.get("year", today.year))
        month = int(request.args.get("month", today.month))
    except ValueError:
        return jsonify(error="year and month must be numbers"), 422
    if not 1 <= month <= 12:
        return jsonify(error="month must be between 1 and 12"), 422

    try:
        return jsonify(cashflow.monthly_report(year, month))
    except NotImplementedError:
        return _not_implemented("monthly_report")


@bp.get("/busiest-days")
def busiest_days_endpoint():
    """Top days by money in, for context beside a daily statement."""
    today = date.today()
    try:
        year = int(request.args.get("year", today.year))
        month = int(request.args.get("month", today.month))
    except ValueError:
        return jsonify(error="year and month must be numbers"), 422

    start = date(year, month, 1)
    end = date(year + (month == 12), (month % 12) + 1, 1) - timedelta(days=1)
    return jsonify(days=cashflow.busiest_days(start, end))
