"""
Fernet-based symmetric encryption for secrets stored in Redis.
The master key is loaded from settings (env var) and never logged.
All encrypt/decrypt operations are synchronous — call from async context
using run_in_executor only if the payload is very large (it won't be here).
"""
from __future__ import annotations

import logging
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings

log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_fernet() -> Fernet:
    """Return cached Fernet instance. Called once per process lifetime."""
    settings = get_settings()
    key = settings.fernet_master_key
    if not key:
        raise RuntimeError(
            "FERNET_MASTER_KEY is not set. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode())


def encrypt(data: bytes) -> str:
    """
    Encrypt raw bytes and return a URL-safe base64 token string.
    Safe to store directly in Redis (decode_responses=True).
    """
    return _get_fernet().encrypt(data).decode("utf-8")


def decrypt(token: str) -> bytes:
    """
    Decrypt a Fernet token string back to raw bytes.
    Raises ValueError on tampered or expired token.
    """
    try:
        return _get_fernet().decrypt(token.encode("utf-8"))
    except InvalidToken as exc:
        log.error("Fernet decryption failed — token invalid or corrupted")
        raise ValueError("Decryption failed: invalid or corrupted token") from exc
