import os


class Config:
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URI", "mysql+pymysql://bizops:bizopspass@db:3306/businessops"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True, "pool_recycle": 280}
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")
    # Temporary password given to a newly created staff account. The owner passes it
    # on and the staff member changes it from their profile page on first sign-in.
    DEFAULT_STAFF_PASSWORD = os.environ.get("DEFAULT_STAFF_PASSWORD", "password123")
    CORS_ORIGINS = [
        o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5174").split(",") if o.strip()
    ]
