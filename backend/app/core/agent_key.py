"""
Agent Key lifecycle management.

Bootstrap sequence (first run):
  1. Read AGENT_KEY_PRIVATE_KEY_B58 from env
  2. Decode base58 → raw 64-byte Ed25519 private key
  3. Encrypt with Fernet → store in Redis at REDIS_KEY
  4. After storing, the env var is no longer needed (can be cleared)

Subsequent runs:
  - Load encrypted bytes from Redis
  - Decrypt → reconstruct solders Keypair in memory

The Keypair object is cached in-process. It is NEVER serialised or logged.
"""
from __future__ import annotations

import logging

from typing import TYPE_CHECKING

import base58
from solders.keypair import Keypair

if TYPE_CHECKING:
    import redis.asyncio as aioredis

from app.core.config import get_settings
from app.core.encryption import decrypt, encrypt

log = logging.getLogger(__name__)

REDIS_KEY = "aegis:agent_key:encrypted"

# In-process cache — populated once during app startup
_keypair_cache: Keypair | None = None


async def bootstrap_agent_key(redis: "aioredis.Redis") -> None:
    """
    Called once during app lifespan startup.
    Ensures the Agent Key is stored encrypted in Redis and loads it
    into the in-process cache.
    """
    global _keypair_cache

    settings = get_settings()
    existing = await redis.get(REDIS_KEY)

    if existing:
        # Key already stored — decrypt and cache
        raw_bytes = decrypt(existing)
        _keypair_cache = Keypair.from_bytes(raw_bytes)
        log.info(
            "Agent Key loaded from Redis — pubkey=%s",
            str(_keypair_cache.pubkey()),
        )
        return

    # First run: must have the private key in env
    b58_key = settings.agent_key_private_key_b58
    if not b58_key:
        raise RuntimeError(
            "No Agent Key found in Redis and AGENT_KEY_PRIVATE_KEY_B58 is not set. "
            "Generate an Ed25519 keypair and set the env var for first-time bootstrap."
        )

    raw_bytes = base58.b58decode(b58_key)
    if len(raw_bytes) != 64:
        raise ValueError(
            f"AGENT_KEY_PRIVATE_KEY_B58 decoded to {len(raw_bytes)} bytes; expected 64."
        )

    # Store encrypted — never store raw bytes in Redis
    token = encrypt(raw_bytes)
    await redis.set(REDIS_KEY, token)

    _keypair_cache = Keypair.from_bytes(raw_bytes)
    log.info(
        "Agent Key bootstrapped and encrypted in Redis — pubkey=%s",
        str(_keypair_cache.pubkey()),
    )


def get_agent_keypair() -> Keypair:
    """
    Return the in-memory Agent Key.
    Raises RuntimeError if bootstrap_agent_key() was not called first.
    """
    if _keypair_cache is None:
        raise RuntimeError(
            "Agent Key not initialised. "
            "Ensure bootstrap_agent_key() is called during app startup."
        )
    return _keypair_cache


def get_agent_pubkey() -> str:
    """Return the Agent Key public key as a base58 string."""
    return str(get_agent_keypair().pubkey())
