# backend/models_settings.py  (new file or add to your existing models.py)
from backend.extensions import db

class AppSetting(db.Model):
    __tablename__ = "app_settings"
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), unique=True, nullable=False)
    value = db.Column(db.Text, nullable=True)

    @staticmethod
    def get(key, default=None):
        row = AppSetting.query.filter_by(key=key).first()
        return row.value if row else default

    @staticmethod
    def set(key, value):
        row = AppSetting.query.filter_by(key=key).first()
        if not row:
            row = AppSetting(key=key, value=value)
            db.session.add(row)
        else:
            row.value = value
        db.session.commit()

    @staticmethod
    def delete(key):
        row = AppSetting.query.filter_by(key=key).first()
        if row:
            db.session.delete(row)
            db.session.commit()
