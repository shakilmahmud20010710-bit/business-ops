"""Authentication helpers (US-01, US-14).

Mirrors the approach already proven in On-Watch: bcrypt for storage, a short-lived
signed token for sessions, and a single generic failure response so the endpoint cannot
be used to discover which e-mail addresses have accounts.
"""
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import current_app, g, jsonify, request
from passlib.context import CryptContext

from app.models import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Burned on the "no such user" branch so it costs the same as a real verification.
# Without it the timing difference leaks exactly what the generic message hides.
_DUMMY_HASH = pwd_context.hash("not-a-real-password-4f7b21")

TOKEN_HOURS = 24


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def burn_dummy_hash(plain: str) -> None:
    verify_password(plain, _DUMMY_HASH)


def create_access_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS),
    }
    return jwt.encode(payload, current_app.config["SECRET_KEY"], algorithm="HS256")


def _user_from_request() -> User | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    try:
        payload = jwt.decode(
            header[7:], current_app.config["SECRET_KEY"], algorithms=["HS256"]
        )
    except jwt.PyJWTError:
        return None
    user = User.query.get(int(payload.get("sub", 0)))
    return user if user and user.is_active else None


def login_required(fn):
    """Attach the caller to flask.g, or reject with 401."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = _user_from_request()
        if user is None:
            return jsonify(error="Authentication required"), 401
        g.current_user = user
        return fn(*args, **kwargs)

    return wrapper


def owner_required(fn):
    """FR-20: staff may record transactions; only the owner sees totals and reports."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = _user_from_request()
        if user is None:
            return jsonify(error="Authentication required"), 401
        if user.role != "owner":
            return jsonify(error="This area is restricted to the business owner"), 403
        g.current_user = user
        return fn(*args, **kwargs)

    return wrapper
