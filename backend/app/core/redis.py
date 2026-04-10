"""
Async Redis connection factory.
Single connection pool shared across the application.
Only imported at runtime when the app actually starts.
Tests mock this at the fixture level.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import redis.asyncio as aioredis

from app.core.config import get_settings

_redis_client: Any = None


async def get_redis() -> "aioredis.Redis":
    global _redis_client
    if _redis_client is None:
        import redis.asyncio as _aioredis  # deferred — not needed until startup
        settings = get_settings()
        _redis_client = await _aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            max_connections=20,
        )
    return _redis_client
