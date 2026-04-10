"""
Integration test fixtures.
All external calls (Pacifica, Elfa, Redis) are mocked so tests run offline.

Deps note: redis and httpx are not imported at module level because they may
not be installed in all environments. Tests that need them are collected only
when the packages are available via pytest.importorskip inside each test.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.pacifica import AccountInfo, Position
from app.models.risk import SentimentData, Sentiment


# ── Pacifica mock data ────────────────────────────────────────────────────────

MOCK_ACCOUNT_SAFE = AccountInfo(
    balance="10000.0",
    fee_level=1,
    maker_fee="0.0002",
    taker_fee="0.0005",
    account_equity="12000.0",
    available_to_spend="8000.0",
    available_to_withdraw="5000.0",
    pending_balance="0",
    total_margin_used="2000.0",
    cross_mmr="0.45",
    positions_count=1,
    orders_count=0,
    stop_orders_count=0,
    updated_at=1_700_000_000_000,
)

MOCK_ACCOUNT_HEDGE = AccountInfo(
    **{**MOCK_ACCOUNT_SAFE.model_dump(), "cross_mmr": "0.88"}
)

MOCK_ACCOUNT_RECOVERING = AccountInfo(
    **{**MOCK_ACCOUNT_SAFE.model_dump(), "cross_mmr": "0.60"}
)

MOCK_POSITION_SOL_LONG = Position(
    symbol="SOL",
    side="long",
    amount="0.1",
    entry_price="150.0",
    margin="0",
    funding="0",
    isolated=False,
    created_at=1_700_000_000_000,
    updated_at=1_700_000_000_000,
)

MOCK_SENTIMENT_BEARISH = SentimentData(
    symbol="SOL", score=18.0, sentiment=Sentiment.BEARISH
)

MOCK_SENTIMENT_NEUTRAL = SentimentData(
    symbol="SOL", score=50.0, sentiment=Sentiment.NEUTRAL
)


@pytest.fixture
def mock_redis():
    """
    In-memory mock Redis client using AsyncMock.
    Does not require the redis package — no external dependency.
    """
    store: dict[str, str] = {}
    sets: dict[str, set] = {}

    redis = AsyncMock()
    redis.get = AsyncMock(side_effect=lambda k: store.get(k))
    redis.set = AsyncMock(side_effect=lambda k, v: store.__setitem__(k, v) or None)
    redis.setex = AsyncMock(
        side_effect=lambda k, ttl, v: store.__setitem__(k, v) or None
    )
    redis.delete = AsyncMock(side_effect=lambda k: store.pop(k, None))
    redis.sadd = AsyncMock(
        side_effect=lambda k, v: sets.setdefault(k, set()).add(v) or 1
    )
    redis.srem = AsyncMock(
        side_effect=lambda k, v: sets.get(k, set()).discard(v) or 0
    )
    redis.smembers = AsyncMock(side_effect=lambda k: sets.get(k, set()))
    redis.sismember = AsyncMock(
        side_effect=lambda k, v: v in sets.get(k, set())
    )
    redis.scard = AsyncMock(side_effect=lambda k: len(sets.get(k, set())))
    redis.keys = AsyncMock(return_value=[])
    pipe = AsyncMock()
    pipe.execute = AsyncMock(return_value=[])
    redis.pipeline = MagicMock(return_value=pipe)
    redis.aclose = AsyncMock()
    # Expose internals for test assertions
    redis._store = store
    redis._sets = sets
    return redis


@pytest.fixture
def mock_pacifica():
    """Mock PacificaClient — no httpx dependency."""
    client = AsyncMock()
    client.get_account_info = AsyncMock(return_value=MOCK_ACCOUNT_SAFE)
    client.get_positions = AsyncMock(return_value=[MOCK_POSITION_SOL_LONG])
    client.create_market_order = AsyncMock(
        return_value=MagicMock(order_id=99001)
    )
    client.cancel_order = AsyncMock(return_value=MagicMock(success=True))
    client.create_stop_order = AsyncMock(
        return_value=MagicMock(order_id=99002)
    )
    client.get_builder_trades = AsyncMock(return_value=[])
    client.get_builder_leaderboard = AsyncMock(return_value=[])
    client.approve_builder_code = AsyncMock(return_value={"status": "approved"})
    client.close = AsyncMock()
    return client
