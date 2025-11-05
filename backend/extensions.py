# extensions.py
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from cryptography.fernet import Fernet
from flask import Flask
from flask_migrate import Migrate
import os
# backend/extensions.py
from flask_login import LoginManager
# backend/extensions.py
from flask_login import LoginManager

# Extensions

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()

# Optional: encryption key
fernet = Fernet(os.getenv("ENCRYPTION_KEY", Fernet.generate_key()))


login_manager = LoginManager()
login_manager.session_protection = "strong"
login_manager.login_view = None

def init_extensions(app: Flask):
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    CORS(app, resources={r"/*": {"origins": "http://localhost:5001"}}, supports_credentials=True)

    # 🔐 attach Flask-Login to this app (this was missing)
    login_manager.init_app(app)

