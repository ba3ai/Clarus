import os
from sqlalchemy import create_engine, MetaData

# Make sure the folder exists
os.makedirs("instance", exist_ok=True)

# Define the SQLite database for Excel data
EXCEL_DB_PATH = "instance/excel_data.db"

# Create SQLAlchemy engine
excel_engine = create_engine(f"sqlite:///{EXCEL_DB_PATH}")

# Create metadata
excel_metadata = MetaData()
