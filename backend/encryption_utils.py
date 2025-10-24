# Field-level encryption helpers
# backend/encryption_utils.py
from cryptography.fernet import Fernet
import os

# You should store this key securely
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", Fernet.generate_key())
fernet = Fernet(ENCRYPTION_KEY)

def encrypt_field(data: str) -> str:
    return fernet.encrypt(data.encode()).decode()

def decrypt_field(data: str) -> str:
    return fernet.decrypt(data.encode()).decode()
