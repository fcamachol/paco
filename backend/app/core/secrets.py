"""
PACO Secrets Utility

Masking helpers for sensitive environment variable values.
"""

from typing import Any, Dict

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
