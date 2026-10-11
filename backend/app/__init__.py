from flask import Flask, jsonify
from flask_cors import CORS

from app.config import Config
from app.extensions import db


def create_app(config_class: type[Config] = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    CORS(app, origins=app.config["CORS_ORIGINS"], supports_credentials=True)

    from app.blueprints import auth, dashboard, health, receivables, reference, transactions

    app.register_blueprint(health.bp)
    app.register_blueprint(auth.bp)
    app.register_blueprint(reference.bp)
    app.register_blueprint(transactions.bp)
    app.register_blueprint(receivables.bp)
    app.register_blueprint(dashboard.bp)

    @app.get("/")
    def index():
        return jsonify(service="businessops-api", health="/health")

    return app
