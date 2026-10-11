from flask import Blueprint, jsonify
from sqlalchemy import text

from app.extensions import db

bp = Blueprint("health", __name__)


@bp.get("/health")
def health():
    """Liveness plus a real round trip to MySQL."""
    db.session.execute(text("SELECT 1"))
    return jsonify(status="ok", database="reachable")
