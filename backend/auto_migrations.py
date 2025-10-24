# backend/auto_migrations.py
"""
Auto-migrations helper for Flask/SQLAlchemy projects using Flask-Migrate.

What it does on startup (idempotent):
  1) If 'migrations/' does not exist, run 'flask db init' (programmatically).
  2) Autogenerate a new revision if there are model/schema diffs (compare_type=True).
  3) Upgrade the database to 'head'.

Works with the shared SQLAlchemy 'db' from extensions.py and whatever models
you import before calling run_auto_migrations(app).

Safe to call on every boot in dev/staging. In production, you may prefer to
gate this behind an env var like AUTO_MIGRATE=true.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from flask import Flask
from flask_migrate import init as mg_init, migrate as mg_migrate, upgrade as mg_upgrade
from sqlalchemy.exc import SQLAlchemyError


def _bool(env_name: str, default: str = "true") -> bool:
    return (os.getenv(env_name, default) or "").strip().lower() in ("1", "true", "yes", "y")


def run_auto_migrations(app: Flask,
                        migrations_dir: Optional[str] = None,
                        message: str = "auto",
                        render_as_batch: bool = True) -> None:
    """
    Initialize Alembic if needed, autogenerate a revision, and upgrade to head.

    Set AUTO_MIGRATE=false to skip in certain environments.
    """
    if not _bool("AUTO_MIGRATE", "true"):
        app.logger.info("AUTO_MIGRATE disabled by env; skipping.")
        return

    # Resolve migrations directory (default: <project_root>/migrations)
    here = Path(__file__).resolve().parent
    if not migrations_dir:
        migrations_dir = str(here.parent / "migrations")

    try:
        with app.app_context():
            # 1) Ensure migrations/ exists
            mig_path = Path(migrations_dir)
            if not mig_path.exists():
                app.logger.info("Initializing Alembic at %s", migrations_dir)
                mg_init(directory=migrations_dir)

            # 2) Autogenerate a revision (no-op if nothing changed)
            #    - compare_type=True catches column type/nullable changes
            #    - render_as_batch helps SQLite ALTER TABLE compat
            try:
                app.logger.info("Autogenerating migration (message=%r)...", message)
                mg_migrate(
                    directory=migrations_dir,
                    message=message,
                    compare_type=True,
                    render_as_batch=render_as_batch,
                )
            except Exception as e:
                # Flask-Migrate raises when no changes are detected; treat as benign.
                app.logger.info("No schema changes detected to migrate: %s", e)

            # 3) Upgrade to head
            app.logger.info("Upgrading database schema to head...")
            mg_upgrade(directory=migrations_dir)
            app.logger.info("Database schema is up-to-date.")
    except SQLAlchemyError as db_err:
        app.logger.error("Auto-migrations failed (DB error): %s", db_err, exc_info=True)
        raise
    except Exception as e:
        app.logger.error("Auto-migrations failed: %s", e, exc_info=True)
        raise
