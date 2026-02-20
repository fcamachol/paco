"""
PACO Secrets Utility

Masking helpers for sensitive environment variable values,
plus Fernet symmetric encryption for webhook secrets.
"""

import base64
import hashlib
from typing import Any, Dict

from cryptography.fernet import Fernet

SENSITIVE_KEY_PATTERNS = {"API_KEY", "SECRET", "TOKEN", "PASSWORD", "CREDENTIAL"}


def is_sensitive_key(key: str) -> bool:
    """Check if a key name matches any sensitive pattern."""
    upper = key.upper()
    return any(pattern in upper for pattern in SENSITIVE_KEY_PATTERNS)


def mask_value(value: str) -> str:
    """Mask a sensitive value, showing only the last 4 characters."""
    if len(value) <= 4:
        return "****"
    return "****" + value[-4:]


def mask_env_vars(env_vars: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy of env_vars with sensitive values masked."""
    masked = {}
    for key, value in env_vars.items():
        if is_sensitive_key(key) and isinstance(value, str) and value:
            masked[key] = mask_value(value)
        else:
            masked[key] = value
    return masked


# =============================================================================
# Fernet Encryption for Webhook Secrets
# =============================================================================


def _get_fernet() -> Fernet:
    """Derive a Fernet key from settings.secret_key."""
    from app.core.config import settings
    key_bytes = hashlib.sha256(settings.secret_key.encode()).digest()
    fernet_key = base64.urlsafe_b64encode(key_bytes)
    return Fernet(fernet_key)


def encrypt_webhook_secret(plaintext: str) -> str:
    """Encrypt a webhook signing secret using Fernet symmetric encryption."""
    f = _get_fernet()
    return f.encrypt(plaintext.encode()).decode()


def decrypt_webhook_secret(ciphertext: str) -> str:
    """Decrypt a webhook signing secret."""
    f = _get_fernet()
    return f.decrypt(ciphertext.encode()).decode()
