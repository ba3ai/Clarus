# backend/init_sqlite.py

from app import create_app
from extensions import db
from models import *
from werkzeug.security import generate_password_hash

# Configuration
ADMIN_EMAIL = "shafiq.ba3s@gmail.com"
ADMIN_PASSWORD = "admin123"

# Initialize app and database
app = create_app()

with app.app_context():
    # Create all tables
    db.create_all()
    print("✅ Database tables created.")

    # Delete existing user (optional, for clean testing)
    existing = User.query.filter_by(email=ADMIN_EMAIL).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
        print("⚠️ Existing user deleted for reset.")

    # Create new admin user with all required fields (excluding is_admin)
    admin = User(
        first_name="Shafiq",
        last_name="Islam",
        email=ADMIN_EMAIL,
        password=generate_password_hash(ADMIN_PASSWORD),
        user_type="admin",  # ✅ Make sure this is lowercase
        status="Active",
        permission="Viewer"
    )

    db.session.add(admin)
    db.session.commit()
    print(f"✅ Admin user '{ADMIN_EMAIL}' created with password: '{ADMIN_PASSWORD}'")

 # Create AdminSettings entry for the new admin
    admin_settings = AdminSettings(admin_id=admin.id)
    db.session.add(admin_settings)
    db.session.commit()
    print("✅ AdminSettings initialized for the admin user.")