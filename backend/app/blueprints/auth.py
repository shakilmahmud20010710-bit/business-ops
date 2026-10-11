from flask import Blueprint, current_app, g, jsonify, request

from app.auth import (
    burn_dummy_hash,
    owner_required,
    create_access_token,
    hash_password,
    login_required,
    verify_password,
)
from app.extensions import db
from app.models import User

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

MIN_PASSWORD = 8
MAX_PASSWORD = 72  # bcrypt truncates beyond this


@bp.post("/register")
def register():
    """US-01, FR-01. Password hashed before storage; the hash is never returned."""
    data = request.get_json(silent=True) or {}

    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not name:
        return jsonify(error="name is required"), 422
    if "@" not in email or "." not in email.split("@")[-1]:
        return jsonify(error="a valid email address is required"), 422
    if not MIN_PASSWORD <= len(password) <= MAX_PASSWORD:
        return jsonify(
            error=f"password must be between {MIN_PASSWORD} and {MAX_PASSWORD} characters"
        ), 422

    if User.query.filter_by(email=email).first() is not None:
        return jsonify(error="An account with that email already exists"), 409

    user = User(
        name=name,
        email=email,
        password_hash=hash_password(password),
        role=data.get("role") if data.get("role") in {"owner", "staff"} else "owner",
    )
    db.session.add(user)
    db.session.commit()

    return jsonify(id=user.id, name=user.name, email=user.email, role=user.role), 201


@bp.post("/login")
def login():
    """US-01, FR-03. One response for every failure — message and timing alike."""
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter_by(email=email).first()
    if user is None:
        burn_dummy_hash(password)
        return jsonify(error="Email or password is incorrect"), 401
    if not user.is_active or not verify_password(password, user.password_hash):
        return jsonify(error="Email or password is incorrect"), 401

    return jsonify(
        access_token=create_access_token(user.id),
        token_type="bearer",
        user={"id": user.id, "name": user.name, "email": user.email, "role": user.role},
    )


@bp.get("/me")
@login_required
def me():
    u = g.current_user
    return jsonify(id=u.id, name=u.name, email=u.email, role=u.role)


# ---------------------------------------------------------------- staff management

def _user_json(u: User) -> dict:
    return {"id": u.id, "name": u.name, "email": u.email,
            "role": u.role, "is_active": bool(u.is_active)}


@bp.get("/staff")
@owner_required
def list_staff():
    """Everyone with access to this business (FR-20 support)."""
    rows = User.query.order_by(User.role.desc(), User.name).all()
    return jsonify([_user_json(u) for u in rows])


@bp.post("/staff")
@owner_required
def create_staff():
    """Add a staff member by name and email.

    The account is created with a temporary password which the owner passes on. It is
    returned once, here, and never again — there is no endpoint that will tell you an
    existing account's password, because the hash is one-way.
    """
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()

    if not name:
        return jsonify(error="name is required"), 422
    if "@" not in email or "." not in email.split("@")[-1]:
        return jsonify(error="a valid email address is required"), 422
    if User.query.filter_by(email=email).first() is not None:
        return jsonify(error="An account with that email already exists"), 409

    role = data.get("role") if data.get("role") in {"owner", "staff"} else "staff"
    temporary = current_app.config["DEFAULT_STAFF_PASSWORD"]

    user = User(name=name, email=email, password_hash=hash_password(temporary), role=role)
    db.session.add(user)
    db.session.commit()

    return jsonify(**_user_json(user), temporary_password=temporary), 201


@bp.post("/staff/<int:user_id>/deactivate")
@owner_required
def deactivate_staff(user_id: int):
    """Revoke access without deleting the person.

    Their recorded transactions stay attributed to them — removing the account would
    orphan rows in the ledger, which is the one place history must not change.
    """
    user = db.session.get(User, user_id)
    if user is None:
        return jsonify(error="User not found"), 404
    if user.id == g.current_user.id:
        return jsonify(error="You cannot deactivate your own account"), 422
    user.is_active = False
    db.session.commit()
    return jsonify(_user_json(user))


@bp.post("/staff/<int:user_id>/reactivate")
@owner_required
def reactivate_staff(user_id: int):
    user = db.session.get(User, user_id)
    if user is None:
        return jsonify(error="User not found"), 404
    user.is_active = True
    db.session.commit()
    return jsonify(_user_json(user))


@bp.post("/staff/<int:user_id>/reset-password")
@owner_required
def reset_staff_password(user_id: int):
    """Put an account back to the temporary password, for someone who is locked out."""
    user = db.session.get(User, user_id)
    if user is None:
        return jsonify(error="User not found"), 404
    temporary = current_app.config["DEFAULT_STAFF_PASSWORD"]
    user.password_hash = hash_password(temporary)
    db.session.commit()
    return jsonify(**_user_json(user), temporary_password=temporary)


# ---------------------------------------------------------------- own profile

@bp.patch("/me")
@login_required
def update_me():
    """Change your own name or email."""
    user = g.current_user
    data = request.get_json(silent=True) or {}

    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return jsonify(error="name cannot be empty"), 422
        user.name = name

    if "email" in data:
        email = (data["email"] or "").strip().lower()
        if "@" not in email or "." not in email.split("@")[-1]:
            return jsonify(error="a valid email address is required"), 422
        clash = User.query.filter(User.email == email, User.id != user.id).first()
        if clash:
            return jsonify(error="Another account already uses that email"), 409
        user.email = email

    db.session.commit()
    return jsonify(_user_json(user))


@bp.post("/me/password")
@login_required
def change_password():
    """Change your own password.

    The current password is required even though the caller is already authenticated:
    it stops someone who walks up to an unlocked screen from locking the real owner out.
    """
    user = g.current_user
    data = request.get_json(silent=True) or {}
    current = data.get("current_password") or ""
    new = data.get("new_password") or ""

    if not verify_password(current, user.password_hash):
        return jsonify(error="Your current password is incorrect"), 403
    if not MIN_PASSWORD <= len(new) <= MAX_PASSWORD:
        return jsonify(
            error=f"password must be between {MIN_PASSWORD} and {MAX_PASSWORD} characters"
        ), 422
    if new == current:
        return jsonify(error="The new password must be different"), 422

    user.password_hash = hash_password(new)
    db.session.commit()
    return jsonify(ok=True)
