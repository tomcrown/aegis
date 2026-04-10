"""
Unit tests for the Elfa AI sentiment client.
HTTP responses are mocked — no real Elfa API calls.
Redis cache is a mock — no real Redis dependency.
"""
from __future__ import annotations

import importlib.util
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.risk import Sentiment, SentimentData

_HTTPX_AVAILABLE = importlib.util.find_spec("httpx") is not None


# ── Sentiment classification ───────────────────────────────────────────────────

class TestSentimentClassification:
    """Test the _classify_sentiment pure function directly."""

    def _classify(self, score: float) -> Sentiment:
        from app.services.elfa.client import _classify_sentiment
        return _classify_sentiment(score)

    def test_score_0_is_bearish(self):
        assert self._classify(0.0) == Sentiment.BEARISH

    def test_score_34_is_bearish(self):
        assert self._classify(34.9) == Sentiment.BEARISH

    def test_score_35_is_neutral(self):
        assert self._classify(35.0) == Sentiment.NEUTRAL

    def test_score_50_is_neutral(self):
        assert self._classify(50.0) == Sentiment.NEUTRAL

    def test_score_64_is_neutral(self):
        assert self._classify(64.9) == Sentiment.NEUTRAL

    def test_score_65_is_bullish(self):
        assert self._classify(65.0) == Sentiment.BULLISH

    def test_score_100_is_bullish(self):
        assert self._classify(100.0) == Sentiment.BULLISH


# ── ElfaClient behaviour ───────────────────────────────────────────────────────

def _make_mock_redis(cached_value: str | None = None) -> AsyncMock:
    redis = AsyncMock()
    redis.get = AsyncMock(return_value=cached_value)
    redis.setex = AsyncMock()
    return redis


def _make_mock_response(items: list[dict], status: int = 200) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status
    resp.json = MagicMock(return_value={"data": items})
    resp.text = ""
    return resp


@pytest.mark.skipif(not _HTTPX_AVAILABLE, reason="httpx not installed")
class TestElfaClientGetSentiment:
    """Tests for ElfaClient.get_sentiment() with mocked HTTP and Redis."""

    @pytest.fixture(autouse=True)
    def _patch_settings(self):
        with patch("app.services.elfa.client.get_settings") as mock_settings:
            mock_settings.return_value.elfa_api_key = "test_key"
            mock_settings.return_value.elfa_base_url = "https://api.elfa.ai/v2"
            yield

    @pytest.mark.asyncio
    async def test_cache_hit_returns_without_api_call(self):
        """When Redis has a cached value, no HTTP call should be made."""
        cached_data = SentimentData(
            symbol="SOL", score=25.0, sentiment=Sentiment.BEARISH
        )
        redis = _make_mock_redis(cached_value=cached_data.model_dump_json())

        from app.services.elfa.client import ElfaClient
        client = ElfaClient(redis=redis)
        client._client = AsyncMock()  # should not be called

        result = await client.get_sentiment("SOL")
        assert result.symbol == "SOL"
        assert result.sentiment == Sentiment.BEARISH
        client._client.get.assert_not_called()
        await client.close()

    @pytest.mark.asyncio
    async def test_api_call_on_cache_miss(self):
        """On cache miss, client calls Elfa API and caches the result."""
        redis = _make_mock_redis(cached_value=None)
        items = [{"symbol": "SOL", "score": 72.0, "mention_count": 500}]

        from app.services.elfa.client import ElfaClient
        client = ElfaClient(redis=redis)
        client._client = AsyncMock()
        client._client.get = AsyncMock(return_value=_make_mock_response(items))

        result = await client.get_sentiment("SOL")
        assert result.symbol == "SOL"
        assert result.score == 72.0
        assert result.sentiment == Sentiment.BULLISH
        redis.setex.assert_awaited_once()
        await client.close()

    @pytest.mark.asyncio
    async def test_api_failure_returns_neutral(self):
        """On Elfa API failure, gracefully return NEUTRAL (safe default)."""
        redis = _make_mock_redis(cached_value=None)

        from app.services.elfa.client import ElfaClient
        client = ElfaClient(redis=redis)
        client._client = AsyncMock()
        client._client.get = AsyncMock(side_effect=RuntimeError("Connection failed"))

        result = await client.get_sentiment("SOL")
        assert result.sentiment == Sentiment.NEUTRAL
        assert result.score == 50.0
        await client.close()

    @pytest.mark.asyncio
    async def test_rate_limit_429_returns_neutral(self):
        """429 from Elfa → raise RuntimeError → caller gets NEUTRAL."""
        redis = _make_mock_redis(cached_value=None)
        rate_limited_response = _make_mock_response([], status=429)

        from app.services.elfa.client import ElfaClient
        client = ElfaClient(redis=redis)
        client._client = AsyncMock()
        client._client.get = AsyncMock(return_value=rate_limited_response)

        result = await client.get_sentiment("SOL")
        assert result.sentiment == Sentiment.NEUTRAL
        await client.close()

    @pytest.mark.asyncio
    async def test_symbol_not_in_response_defaults_neutral(self):
        """Symbol absent from trending-tokens list → NEUTRAL with score 50."""
        redis = _make_mock_redis(cached_value=None)
        # Response has BTC but not SOL
        items = [{"symbol": "BTC", "score": 80.0, "mention_count": 1000}]

        from app.services.elfa.client import ElfaClient
        client = ElfaClient(redis=redis)
        client._client = AsyncMock()
        client._client.get = AsyncMock(return_value=_make_mock_response(items))

        result = await client.get_sentiment("SOL")
        assert result.symbol == "SOL"
        assert result.sentiment == Sentiment.NEUTRAL
        assert result.score == 50.0
        await client.close()

    @pytest.mark.asyncio
    async def test_score_clamped_to_0_100(self):
        """Scores outside 0–100 are clamped."""
        redis = _make_mock_redis(cached_value=None)
        items = [{"symbol": "SOL", "score": 150.0, "mention_count": 100}]

        from app.services.elfa.client import ElfaClient
        client = ElfaClient(redis=redis)
        client._client = AsyncMock()
        client._client.get = AsyncMock(return_value=_make_mock_response(items))

        result = await client.get_sentiment("SOL")
        assert result.score == 100.0
        await client.close()

    @pytest.mark.asyncio
    async def test_case_insensitive_symbol_matching(self):
        """'sol' in response should match query for 'SOL'."""
        redis = _make_mock_redis(cached_value=None)
        items = [{"symbol": "sol", "score": 20.0, "mention_count": 50}]

        from app.services.elfa.client import ElfaClient
        client = ElfaClient(redis=redis)
        client._client = AsyncMock()
        client._client.get = AsyncMock(return_value=_make_mock_response(items))

        result = await client.get_sentiment("SOL")
        assert result.score == 20.0
        assert result.sentiment == Sentiment.BEARISH
        await client.close()

    @pytest.mark.asyncio
    async def test_batch_fetch_all_symbols(self):
        """get_sentiment_batch fetches all symbols in one API call."""
        redis = _make_mock_redis(cached_value=None)
        items = [
            {"symbol": "SOL", "score": 20.0, "mention_count": 100},
            {"symbol": "BTC", "score": 80.0, "mention_count": 500},
        ]

        from app.services.elfa.client import ElfaClient
        client = ElfaClient(redis=redis)
        client._client = AsyncMock()
        client._client.get = AsyncMock(return_value=_make_mock_response(items))

        result = await client.get_sentiment_batch(["SOL", "BTC"])
        assert result["SOL"].sentiment == Sentiment.BEARISH
        assert result["BTC"].sentiment == Sentiment.BULLISH
        # Should have made exactly ONE API call (single batch)
        assert client._client.get.call_count == 1
        await client.close()
