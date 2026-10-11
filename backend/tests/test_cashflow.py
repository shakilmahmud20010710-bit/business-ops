"""Cash flow tests.

NFR-04 requires an automated test asserting that cash on hand equals the sum of the
transaction list for the same period. That is the single most important guarantee in
this system: if the headline figure and the ledger behind it can disagree, no other
number on the dashboard can be trusted either.
"""
from datetime import date, timedelta

import pytest

from app import create_app
from app.cashflow import (
    account_balances,
    cash_on_hand,
    due_next_30_days,
    monthly_series,
    period_totals,
    spending_by_category,
)
from app.extensions import db
from app.models import Account, Transaction


@pytest.fixture(scope="module")
def app():
    application = create_app()
    with application.app_context():
        yield application


def test_cash_on_hand_equals_the_ledger(app):
    """NFR-04. The headline figure must be reproducible by hand from the rows."""
    opening = sum(a.opening_balance_minor for a in Account.query.all())
    movement = sum(t.signed_minor for t in Transaction.query.all())
    assert cash_on_hand() == opening + movement


def test_cash_on_hand_is_the_sum_of_account_balances(app):
    assert cash_on_hand() == sum(a["balance_minor"] for a in account_balances())


def test_cash_on_hand_is_an_integer(app):
    """NFR-03. A float here means rounding errors compound across every view."""
    assert isinstance(cash_on_hand(), int)


def test_period_totals_match_the_rows_in_that_period(app):
    start, end = date(2026, 9, 1), date(2026, 9, 30)
    rows = Transaction.query.filter(
        Transaction.occurred_on >= start, Transaction.occurred_on <= end
    ).all()
    expected_in = sum(t.amount_minor for t in rows if t.type == "income")
    expected_out = sum(t.amount_minor for t in rows if t.type == "expense")

    totals = period_totals(start, end)
    assert totals["money_in_minor"] == expected_in
    assert totals["money_out_minor"] == expected_out
    assert totals["net_minor"] == expected_in - expected_out


def test_period_totals_include_both_boundary_days(app):
    """An owner picking 1-30 September expects the 30th counted."""
    day = db.session.query(db.func.max(Transaction.occurred_on)).scalar()
    single = period_totals(day, day)
    same_day = Transaction.query.filter(Transaction.occurred_on == day).all()
    assert single["money_in_minor"] + single["money_out_minor"] == sum(
        t.amount_minor for t in same_day
    )


def test_period_totals_of_an_empty_range_are_zero_not_missing(app):
    future = date.today() + timedelta(days=365)
    assert period_totals(future, future + timedelta(days=30)) == {
        "money_in_minor": 0,
        "money_out_minor": 0,
        "net_minor": 0,
    }


def test_monthly_series_always_returns_the_months_asked_for(app):
    """A GROUP BY silently drops months with no rows, which makes the chart lie."""
    for months in (1, 6, 18):
        assert len(monthly_series(months)) == months


def test_monthly_series_is_oldest_first(app):
    keys = [m["month"] for m in monthly_series(6)]
    assert keys == sorted(keys)


def test_spending_by_category_excludes_income(app):
    income_names = {"Counter sales", "Print jobs", "Design services"}
    rows = spending_by_category(date(2026, 4, 1), date(2026, 9, 30), limit=20)
    assert not income_names & {r["category"] for r in rows}


def test_spending_by_category_is_ranked_and_limited(app):
    rows = spending_by_category(date(2026, 4, 1), date(2026, 9, 30), limit=3)
    assert len(rows) <= 3
    assert rows == sorted(rows, key=lambda r: r["total_minor"], reverse=True)


def test_overdue_items_are_sorted_most_overdue_first(app):
    overdue = due_next_30_days()["overdue"]
    days = [o["days_overdue"] for o in overdue]
    assert days == sorted(days, reverse=True)
    assert all(d > 0 for d in days)
