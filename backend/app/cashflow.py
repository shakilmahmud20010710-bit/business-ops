"""Cash flow calculations — the module BusinessOps exists for.

Design decision 5 in the proposal: every figure the dashboard shows is computed here,
in the backend, so the dashboard, the monthly report and the CSV export can never
disagree. NFR-04 requires an automated test asserting cash on hand equals the sum of
the transaction list for the same period.

`account_balances` below is written as a worked example of the shape these functions
take — one aggregate query, integers throughout, no Python loop over rows. The four
that carry the dashboard are yours.
"""
from datetime import date, timedelta, timedelta
from sqlalchemy import func, select

from app.extensions import db
from app.models import Account, Category, Transaction, Category, Invoice, Bill

def account_balances() -> list[dict]:
    """Closing balance per account: opening balance plus every transaction against it.

    Worked example — use this as the pattern for the functions below.
    """
    signed = func.sum(
        func.if_(Transaction.type == "income", Transaction.amount_minor, -Transaction.amount_minor)
    )
    stmt = (
        select(Account.id, Account.name, Account.type, Account.opening_balance_minor,
               func.coalesce(signed, 0))
        .select_from(Account)
        .outerjoin(Transaction, Transaction.account_id == Account.id)
        .group_by(Account.id, Account.name, Account.type, Account.opening_balance_minor)
        .order_by(Account.id)
    )
    return [
        {
            "account_id": aid,
            "name": name,
            "type": acct_type,
            "opening_balance_minor": int(opening),
            "balance_minor": int(opening) + int(movement),
        }
        for aid, name, acct_type, opening, movement in db.session.execute(stmt)
    ]


def cash_on_hand() -> int:
    """Total cash across all accounts, in minor units (FR-11)."""

    return sum(account["balance_minor"] for account in account_balances())


def period_totals(start: date, end: date) -> dict:
    """Money in, money out and net for a date range (FR-12).

    Returns:
        {
            "money_in_minor": int,
            "money_out_minor": int,
            "net_minor": int
        }
    """
    stmt = (
        select(
            Transaction.type,
            func.sum(Transaction.amount_minor),
        )
        .where(
            Transaction.occurred_on >= start,
            Transaction.occurred_on <= end,
        )
        .group_by(Transaction.type)
    )

    money_in = 0
    money_out = 0

    for transaction_type, total in db.session.execute(stmt):
        if transaction_type == "income":
            money_in = int(total)
        elif transaction_type == "expense":
            money_out = int(total)

    return {
        "money_in_minor": money_in,
        "money_out_minor": money_out,
        "net_minor": money_in - money_out,
    }


def monthly_series(months: int = 6) -> list[dict]:
    """Money in against money out for each of the last `months` months (FR-13)."""
    today = date.today()

    # Start at the first day of the current month.
    year = today.year
    month = today.month

    month_keys = []

    for _ in range(months):
        month_keys.append(f"{year:04d}-{month:02d}")

        month -= 1
        if month == 0:
            month = 12
            year -= 1

    month_keys.reverse()

    totals = {
        month_key: {
            "month": month_key,
            "money_in_minor": 0,
            "money_out_minor": 0,
        }
        for month_key in month_keys
    }

    stmt = (
        select(
            func.date_format(Transaction.occurred_on, "%Y-%m"),
            Transaction.type,
            func.sum(Transaction.amount_minor),
        )
        .where(
            Transaction.occurred_on >= date(
                int(month_keys[0][:4]),
                int(month_keys[0][5:7]),
                1,
            )
        )
        .group_by(
            func.date_format(Transaction.occurred_on, "%Y-%m"),
            Transaction.type,
        )
    )

    for month_key, transaction_type, total in db.session.execute(stmt):
        if month_key not in totals:
            continue

        if transaction_type == "income":
            totals[month_key]["money_in_minor"] = int(total)
        elif transaction_type == "expense":
            totals[month_key]["money_out_minor"] = int(total)

    return list(totals.values())


def spending_by_category(start: date, end: date, limit: int = 5) -> list[dict]:
    """Expense totals per category, biggest first (FR-14)."""
    stmt = (
        select(
            Category.name,
            func.sum(Transaction.amount_minor),
        )
        .select_from(Transaction)
        .join(Category, Transaction.category_id == Category.id)
        .where(
            Transaction.type == "expense",
            Transaction.occurred_on >= start,
            Transaction.occurred_on <= end,
        )
        .group_by(Category.id, Category.name)
        .order_by(func.sum(Transaction.amount_minor).desc())
        .limit(limit)
    )

    return [
        {
            "category": name,
            "total_minor": int(total),
        }
        for name, total in db.session.execute(stmt)
    ]


def due_next_30_days(today: date | None = None) -> dict:
    """Unpaid invoices and bills falling due in the next 30 days, plus overdue items."""
    if today is None:
        today = date.today()

    end_date = today + timedelta(days=30)

    invoices = (
        db.session.execute(
            select(Invoice)
            .where(
                Invoice.status == "unpaid",
                Invoice.due_date <= end_date,
            )
            .order_by(Invoice.due_date)
        )
        .scalars()
        .all()
    )

    bills = (
        db.session.execute(
            select(Bill)
            .where(
                Bill.status == "unpaid",
                Bill.due_date <= end_date,
            )
            .order_by(Bill.due_date)
        )
        .scalars()
        .all()
    )

    money_in = sum(int(invoice.amount_minor) for invoice in invoices)
    money_out = sum(int(bill.amount_minor) for bill in bills)

    overdue = []

    for invoice in invoices:
        days_overdue = invoice.days_overdue(today)

        if days_overdue > 0:
            data = invoice.to_dict()
            data["days_overdue"] = days_overdue
            data["type"] = "invoice"
            overdue.append(data)

    for bill in bills:
        days_overdue = bill.days_overdue(today)

        if days_overdue > 0:
            data = bill.to_dict()
            data["days_overdue"] = days_overdue
            data["type"] = "bill"
            overdue.append(data)

    overdue.sort(
        key=lambda item: item["days_overdue"],
        reverse=True,
    )

    return {
        "money_in_minor": money_in,
        "invoice_count": len(invoices),
        "money_out_minor": money_out,
        "bill_count": len(bills),
        "overdue": overdue,
    }

def running_balances(txn_ids: list[int]) -> dict[int, int]:
    """Cash balance after each of the given transactions (FR-10).

    The running total is computed over *every* transaction in date order, not just the
    rows currently on screen — a balance that only counted the filtered subset would be
    a different number every time someone changed a filter, which is worse than no
    column at all.

    One window function does it; the alternative is a running sum in Python over the
    whole table on every page load.
    """
    if not txn_ids:
        return {}

    opening = db.session.scalar(select(func.coalesce(func.sum(Account.opening_balance_minor), 0)))

    signed = func.if_(
        Transaction.type == "income", Transaction.amount_minor, -Transaction.amount_minor
    )
    window = func.sum(signed).over(order_by=[Transaction.occurred_on, Transaction.id])

    sub = select(Transaction.id.label("tid"), window.label("cum")).subquery()
    rows = db.session.execute(
        select(sub.c.tid, sub.c.cum).where(sub.c.tid.in_(txn_ids))
    ).all()
    return {tid: int(opening) + int(cum) for tid, cum in rows}


def period_report(start: date, end: date, label: str) -> dict:
    """A cash flow statement for any date range (FR-18).

    Opening balance, money in and out broken down by category, and the closing balance.
    Opening plus net always equals closing, because all three are derived from the same
    ledger rather than stored separately.
    """
    totals = period_totals(start, end)

    opening_static = db.session.scalar(
        select(func.coalesce(func.sum(Account.opening_balance_minor), 0))
    )
    signed = func.if_(
        Transaction.type == "income", Transaction.amount_minor, -Transaction.amount_minor
    )
    before = db.session.scalar(
        select(func.coalesce(func.sum(signed), 0)).where(Transaction.occurred_on < start)
    )
    opening = int(opening_static) + int(before)

    def by_cat(kind: str) -> list[dict]:
        stmt = (
            select(Category.name, func.sum(Transaction.amount_minor))
            .select_from(Transaction)
            .join(Category, Transaction.category_id == Category.id)
            .where(
                Transaction.type == kind,
                Transaction.occurred_on >= start,
                Transaction.occurred_on <= end,
            )
            .group_by(Category.id, Category.name)
            .order_by(func.sum(Transaction.amount_minor).desc())
        )
        return [
            {"category": name, "total_minor": int(total)}
            for name, total in db.session.execute(stmt)
        ]

    return {
        "period": label,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "opening_balance_minor": opening,
        "money_in_minor": totals["money_in_minor"],
        "money_out_minor": totals["money_out_minor"],
        "net_minor": totals["net_minor"],
        "closing_balance_minor": opening + totals["net_minor"],
        "income_by_category": by_cat("income"),
        "expense_by_category": by_cat("expense"),
    }


def monthly_report(year: int, month: int) -> dict:
    """A calendar month's statement (FR-18, US-13)."""
    start = date(year, month, 1)
    end = date(year + (month == 12), (month % 12) + 1, 1) - timedelta(days=1)
    return period_report(start, end, f"{year:04d}-{month:02d}")


def daily_report(day: date) -> dict:
    """A single day's statement, plus the entries behind it.

    The owner's end-of-day question is "how did today go, and what made it up", so the
    day's transactions are returned with the totals rather than requiring a second trip
    to the ledger.
    """
    report = period_report(day, day, day.isoformat())
    rows = (
        Transaction.query.filter(Transaction.occurred_on == day)
        .order_by(Transaction.id)
        .all()
    )
    report["transactions"] = [t.to_dict() for t in rows]
    report["transaction_count"] = len(rows)
    return report


def busiest_days(start: date, end: date, limit: int = 5) -> list[dict]:
    """Days with the most money coming in, for the daily view's context panel."""
    stmt = (
        select(
            Transaction.occurred_on,
            func.sum(func.if_(Transaction.type == "income", Transaction.amount_minor, 0)),
            func.sum(func.if_(Transaction.type == "expense", Transaction.amount_minor, 0)),
        )
        .where(Transaction.occurred_on >= start, Transaction.occurred_on <= end)
        .group_by(Transaction.occurred_on)
        .order_by(func.sum(func.if_(Transaction.type == "income", Transaction.amount_minor, 0)).desc())
        .limit(limit)
    )
    return [
        {"date": d.isoformat(), "money_in_minor": int(i), "money_out_minor": int(o)}
        for d, i, o in db.session.execute(stmt)
    ]
