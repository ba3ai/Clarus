# extensions.py
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from cryptography.fernet import Fernet
from flask import Flask
from flask_migrate import Migrate
import os

# Extensions

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()

# Optional: encryption key
fernet = Fernet(os.getenv("ENCRYPTION_KEY", Fernet.generate_key()))

def init_extensions(app: Flask):
    db.init_app(app)
    migrate.init_app(app, db)  # ✅ Ensure Migrate is properly initialized
    jwt.init_app(app)
    CORS(app, resources={r"/*": {"origins": "http://localhost:5001"}}, supports_credentials=True)
