"""Money helpers.

Design decision 3 in the proposal: every amount is a whole number of minor units
(cents), never a float and never a DECIMAL that Python will hand back as a float.
Everything crossing the API boundary goes through here so the rule is enforced in one
place rather than remembered in twenty.
"""
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation


class MoneyError(ValueError):
    """Raised when user input cannot be read as a money amount."""


def to_minor(value: str | int | float | Decimal) -> int:
    """Parse a user-entered amount like '1,240.00' into 124000 minor units."""
    if isinstance(value, int):
        return value * 100
    text = str(value).replace(",", "").replace("$", "").strip()
    if not text:
        raise MoneyError("Amount is required")
    try:
        dec = Decimal(text)
    except InvalidOperation as exc:
        raise MoneyError(f"{value!r} is not a valid amount") from exc
    if dec <= 0:
        raise MoneyError("Amount must be greater than zero")
    return int((dec * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def to_major(minor: int) -> str:
    """Render minor units for display: 124000 -> '1240.00'."""
    sign = "-" if minor < 0 else ""
    whole, cents = divmod(abs(int(minor)), 100)
    return f"{sign}{whole}.{cents:02d}"


def format_currency(minor: int, symbol: str = "$") -> str:
    """Display form with thousands separators: 124000 -> '$1,240.00'."""
    sign = "-" if minor < 0 else ""
    whole, cents = divmod(abs(int(minor)), 100)
    return f"{sign}{symbol}{whole:,}.{cents:02d}"
