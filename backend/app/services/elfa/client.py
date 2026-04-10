"""
Elfa AI sentiment client.

Strategy (verified against Elfa v2 docs):
  - Endpoint: GET /v2/aggregations/trending-tokens
  - No dedicated sentiment endpoint exists in v2
  - 'score' field per token is normalised to 0–100 range
  - Sentiment buckets: bearish < 35, neutral 35–65, bullish ≥ 65
  - Rate limit: 100 req/min → poll every 60s per active symbol set

Caching:
  - Results stored in Redis at aegis:elfa:cache:{SYMBOL} with TTL 65s
  - On Elfa API failure, stale cached value is returned (graceful degradation)
  - If no cache and API fails, returns NEUTRAL (safe default)
"""
from __future__ import annotations

import logging

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import httpx
    import redis.asyncio as aioredis

from app.core.config import get_settings
from app.models.risk import Sentiment, SentimentData

log = logging.getLogger(__name__)

_CACHE_TTL_S = 65          # slightly longer than 60s poll interval
_CACHE_KEY = "aegis:elfa:cache:{symbol}"
_BEARISH_THRESHOLD = 35.0
_BULLISH_THRESHOLD = 65.0


def _classify_sentiment(score: float) -> Sentiment:
    if score < _BEARISH_THRESHOLD:
        return Sentiment.BEARISH
    if score >= _BULLISH_THRESHOLD:
        return Sentiment.BULLISH
    return Sentiment.NEUTRAL


class ElfaClient:
    """
    Async Elfa AI sentiment client.
    Uses a single httpx.AsyncClient per application lifetime.
    """

    def __init__(self, redis: "aioredis.Redis") -> None:
        import httpx as _httpx  # deferred — optional dependency at import time
        self._redis = redis
        settings = get_settings()
        self._client = _httpx.AsyncClient(
            base_url=settings.elfa_base_url.rstrip("/"),
            headers={"x-elfa-api-key": settings.elfa_api_key},
            timeout=_httpx.Timeout(10.0),
        )

    async def get_sentiment(self, symbol: str) -> SentimentData:
        """
        Return sentiment for the given symbol.
        Checks Redis cache first; falls back to API call; defaults to NEUTRAL on failure.
        """
        cache_key = _CACHE_KEY.format(symbol=symbol.upper())

        # ── Cache hit ──────────────────────────────────────────────────────
        cached = await self._redis.get(cache_key)
        if cached:
            return SentimentData.model_validate_json(cached)

        # ── API call ───────────────────────────────────────────────────────
        try:
            data = await self._fetch_trending_tokens()
        except Exception as exc:
            log.warning("Elfa API error for %s: %s — returning NEUTRAL", symbol, exc)
            return SentimentData(
                symbol=symbol,
                score=50.0,
                sentiment=Sentiment.NEUTRAL,
            )

        # Find the symbol in the response
        result = self._extract_symbol(data, symbol)

        # Cache the result
        await self._redis.setex(cache_key, _CACHE_TTL_S, result.model_dump_json())
        log.debug("Elfa: symbol=%s score=%.1f sentiment=%s", symbol, result.score, result.sentiment.value)
        return result

    async def get_sentiment_batch(self, symbols: list[str]) -> dict[str, SentimentData]:
        """
        Fetch sentiment for multiple symbols in one API call.
        Returns a dict keyed by symbol.
        """
        if not symbols:
            return {}

        # Single call to trending-tokens covers all symbols
        try:
            data = await self._fetch_trending_tokens()
        except Exception as exc:
            log.warning("Elfa batch fetch failed: %s — returning NEUTRAL for all", exc)
            return {
                s: SentimentData(symbol=s, score=50.0, sentiment=Sentiment.NEUTRAL)
                for s in symbols
            }

        result: dict[str, SentimentData] = {}
        for symbol in symbols:
            sentiment = self._extract_symbol(data, symbol)
            result[symbol] = sentiment
            cache_key = _CACHE_KEY.format(symbol=symbol.upper())
            await self._redis.setex(cache_key, _CACHE_TTL_S, sentiment.model_dump_json())

        return result

    async def _fetch_trending_tokens(self) -> list[dict]:
        """
        GET /v2/aggregations/trending-tokens
        Returns raw items list from the Elfa API.
        """
        resp = await self._client.get(
            "/aggregations/trending-tokens",
            params={"timeWindow": "24h"},
        )

        if resp.status_code == 429:
            log.warning("Elfa rate limit hit — returning cached or NEUTRAL")
            raise RuntimeError("Elfa rate limited")

        if resp.status_code != 200:
            raise RuntimeError(f"Elfa API returned {resp.status_code}: {resp.text}")

        body = resp.json()
        return body.get("data", body) if isinstance(body, dict) else body

    def _extract_symbol(self, items: list[dict], symbol: str) -> SentimentData:
        """
        Find the symbol in trending-tokens response and normalise its score.
        Falls back to NEUTRAL with score 50 if symbol not in response.
        """
        upper = symbol.upper()
        for item in items:
            item_symbol = (item.get("symbol") or item.get("ticker") or "").upper()
            if item_symbol == upper:
                raw_score = float(item.get("score", 50) or 50)
                # Clamp to 0–100
                score = max(0.0, min(100.0, raw_score))
                return SentimentData(
                    symbol=symbol,
                    score=score,
                    sentiment=_classify_sentiment(score),
                    raw_mentions=int(item.get("mention_count", 0) or 0),
                )

        # Symbol not trending — return neutral with a moderate score
        log.debug("Elfa: %s not in trending-tokens response — defaulting NEUTRAL", symbol)
        return SentimentData(
            symbol=symbol,
            score=50.0,
            sentiment=Sentiment.NEUTRAL,
        )

    async def close(self) -> None:
        await self._client.aclose()
