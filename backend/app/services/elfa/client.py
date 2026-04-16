"""
Elfa AI intelligence client — full v2 API coverage.

Endpoints used:
  1. /v2/aggregations/trending-tokens     — per-symbol sentiment (existing)
  2. /v2/data/keyword-mentions            — crash/exploit keyword detection
  3. /v2/data/trending-narratives         — macro bear narrative detection
  4. /v2/aggregations/trending-cas/twitter — viral tokens not in portfolio
  5. /v2/aggregations/trending-cas/telegram
  6. /v2/data/token-news                  — breaking news per symbol
  7. /v2/chat (tokenAnalysis)             — AI narrative on hedge open
  8. /v2/chat (macro)                     — market climate summary
  9. /v2/account/smart-stats              — smart money account metrics

Caching strategy (all via Redis TTL):
  - Sentiment: 65s  (refreshed every 60s in orchestrator)
  - Keywords: 10min (per symbol)
  - Narratives: 30min (global)
  - Trending CAs: 30min (global)
  - Token news: 10min (per symbol)
  - Macro chat: 30min (global)
  - Smart stats: 1h (per username, on-demand)
  - AI narrative: 5min (per hedge event)
"""
from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import httpx
    import redis.asyncio as aioredis

from app.core.config import get_settings
from app.models.risk import Sentiment, SentimentData

log = logging.getLogger(__name__)

# ── Sentiment ──────────────────────────────────────────────────────────────────
_SENTIMENT_TTL = 65
_SENTIMENT_KEY = "aegis:elfa:cache:{symbol}"
_BEARISH_THRESHOLD = 35.0
_BULLISH_THRESHOLD = 65.0

# ── Keywords ───────────────────────────────────────────────────────────────────
_KEYWORDS_TTL = 600      # 10 min
_KEYWORDS_KEY = "aegis:elfa:keywords:{symbol}"
CRASH_KEYWORDS = ["exploit", "hack", "rug", "depeg", "bankrupt", "liquidation cascade", "emergency", "drained"]

# ── Narratives ─────────────────────────────────────────────────────────────────
_NARRATIVES_TTL = 1800   # 30 min
_NARRATIVES_KEY = "aegis:elfa:narratives"

# ── Trending CAs ───────────────────────────────────────────────────────────────
_TRENDING_CAS_TTL = 1800  # 30 min
_TRENDING_CAS_KEY = "aegis:elfa:trending_cas:{platform}"

# ── Token news ─────────────────────────────────────────────────────────────────
_NEWS_TTL = 600           # 10 min
_NEWS_KEY = "aegis:elfa:news:{symbol}"

# ── Macro chat ─────────────────────────────────────────────────────────────────
_MACRO_TTL = 1800         # 30 min
_MACRO_KEY = "aegis:elfa:macro"

# ── Smart stats ────────────────────────────────────────────────────────────────
_SMART_STATS_TTL = 3600   # 1 hour
_SMART_STATS_KEY = "aegis:elfa:smart_stats:{username}"

# ── Sentiment history ──────────────────────────────────────────────────────────
_SENTIMENT_HIST_KEY = "aegis:elfa:score_history:{symbol}"
_SENTIMENT_HIST_LEN = 60  # keep last 60 readings


def _classify_sentiment(score: float) -> Sentiment:
    if score < _BEARISH_THRESHOLD:
        return Sentiment.BEARISH
    if score >= _BULLISH_THRESHOLD:
        return Sentiment.BULLISH
    return Sentiment.NEUTRAL


class ElfaClient:
    """
    Async Elfa AI client.
    One instance per application lifetime, shared via app.state.elfa.
    """

    def __init__(self, redis: "aioredis.Redis") -> None:
        import httpx as _httpx
        self._redis = redis
        settings = get_settings()
        self._client = _httpx.AsyncClient(
            base_url=settings.elfa_base_url.rstrip("/"),
            headers={"x-elfa-api-key": settings.elfa_api_key},
            timeout=_httpx.Timeout(15.0),
        )

    # ── 1. Per-symbol sentiment ────────────────────────────────────────────────

    async def get_sentiment(self, symbol: str) -> SentimentData:
        """Return sentiment for a single symbol (cache-first)."""
        cache_key = _SENTIMENT_KEY.format(symbol=symbol.upper())
        cached = await self._redis.get(cache_key)
        if cached:
            return SentimentData.model_validate_json(cached)
        try:
            data = await self._fetch_trending_tokens()
        except Exception as exc:
            log.warning("Elfa API error for %s: %s — returning NEUTRAL", symbol, exc)
            return SentimentData(symbol=symbol, score=50.0, sentiment=Sentiment.NEUTRAL)
        result = self._extract_symbol(data, symbol)
        await self._redis.setex(cache_key, _SENTIMENT_TTL, result.model_dump_json())
        return result

    async def get_sentiment_batch(self, symbols: list[str]) -> dict[str, SentimentData]:
        """Fetch sentiment for multiple symbols in one API call."""
        if not symbols:
            return {}
        try:
            data = await self._fetch_trending_tokens()
        except Exception as exc:
            log.warning("Elfa batch fetch failed: %s — NEUTRAL for all", exc)
            return {s: SentimentData(symbol=s, score=50.0, sentiment=Sentiment.NEUTRAL) for s in symbols}

        result: dict[str, SentimentData] = {}
        for symbol in symbols:
            sentiment = self._extract_symbol(data, symbol)
            result[symbol] = sentiment
            cache_key = _SENTIMENT_KEY.format(symbol=symbol.upper())
            await self._redis.setex(cache_key, _SENTIMENT_TTL, sentiment.model_dump_json())
            # Record sentiment history
            await self._record_sentiment_history(symbol, sentiment.score)
        return result

    async def _record_sentiment_history(self, symbol: str, score: float) -> None:
        """Maintain a rolling 60-reading sentiment score history per symbol."""
        key = _SENTIMENT_HIST_KEY.format(symbol=symbol.upper())
        pipe = self._redis.pipeline()
        pipe.lpush(key, score)
        pipe.ltrim(key, 0, _SENTIMENT_HIST_LEN - 1)
        pipe.expire(key, 7200)  # 2h TTL
        await pipe.execute()

    async def get_sentiment_history(self, symbol: str) -> list[float]:
        """Return last N sentiment scores for sparkline rendering."""
        key = _SENTIMENT_HIST_KEY.format(symbol=symbol.upper())
        raw = await self._redis.lrange(key, 0, -1)
        return [float(v) for v in raw]

    # ── 2. Keyword crash detection ─────────────────────────────────────────────

    async def check_crash_keywords(self, symbol: str) -> dict[str, Any]:
        """
        Check for crash/exploit keywords in recent mentions for a symbol.
        Returns: {symbol, alert: bool, keywords_hit: [...], mention_count: N}
        Cached 10 min — only needed for WATCH/HEDGE tier.
        """
        cache_key = _KEYWORDS_KEY.format(symbol=symbol.upper())
        cached = await self._redis.get(cache_key)
        if cached:
            import json
            return json.loads(cached)

        result = {"symbol": symbol, "alert": False, "keywords_hit": [], "mention_count": 0}
        try:
            # Search for the symbol + crash keywords
            keywords_str = ",".join(CRASH_KEYWORDS[:5])  # max 5
            resp = await self._client.get(
                "/data/keyword-mentions",
                params={
                    "keywords": f"{symbol.upper()},{keywords_str}",
                    "timeWindow": "1h",
                    "limit": 20,
                    "searchType": "and",
                },
            )
            if resp.status_code == 200:
                body = resp.json()
                items = self._unwrap_list(body)
                if items:
                    # Count how many crash keywords appear
                    hit_keywords = set()
                    for item in items:
                        content = str(item.get("content", "") or item.get("text", "")).lower()
                        for kw in CRASH_KEYWORDS:
                            if kw in content:
                                hit_keywords.add(kw)
                    result["alert"] = len(hit_keywords) > 0
                    result["keywords_hit"] = list(hit_keywords)
                    result["mention_count"] = len(items)
                    if result["alert"]:
                        log.warning(
                            "CRASH ALERT: %s — keywords detected: %s (%d mentions)",
                            symbol, hit_keywords, len(items)
                        )
        except Exception as exc:
            log.debug("Keyword check failed for %s: %s", symbol, exc)

        import json
        await self._redis.setex(cache_key, _KEYWORDS_TTL, json.dumps(result))
        return result

    # ── 3. Trending narratives ─────────────────────────────────────────────────

    async def get_trending_narratives(self) -> list[dict[str, Any]]:
        """
        Fetch macro narratives forming across X. Global — not per-symbol.
        Cached 30 min. Cost: 5 credits per call → ~240/day with 30min cache.
        Response: {success, data: {trending_narratives: [...], metadata: {...}}}
        """
        cached = await self._redis.get(_NARRATIVES_KEY)
        if cached:
            import json
            return json.loads(cached)

        narratives: list[dict[str, Any]] = []
        try:
            resp = await self._client.get(
                "/data/trending-narratives",
                params={"timeFrame": "day", "maxNarratives": 5, "maxTweetsPerNarrative": 3},
            )
            if resp.status_code == 200:
                body = resp.json()
                # Response shape: {success, data: {trending_narratives: [...], metadata: {...}}}
                data = body.get("data", {}) if isinstance(body, dict) else {}
                if isinstance(data, dict):
                    narratives = data.get("trending_narratives", [])
                elif isinstance(data, list):
                    narratives = data
                log.info("Elfa narratives: %d narratives fetched", len(narratives))
            else:
                log.warning("Elfa narratives returned %s: %s", resp.status_code, resp.text[:200])
        except Exception as exc:
            log.debug("Trending narratives fetch failed: %s", exc)

        import json
        await self._redis.setex(_NARRATIVES_KEY, _NARRATIVES_TTL, json.dumps(narratives))
        return narratives

    # ── 4 + 5. Trending CAs (Twitter + Telegram) ──────────────────────────────

    async def get_trending_cas(self, platform: str = "twitter") -> list[dict[str, Any]]:
        """
        Fetch trending contract addresses on Twitter or Telegram.
        platform: "twitter" or "telegram"
        Cached 30 min. Good for opportunity watchlist feature.
        """
        cache_key = _TRENDING_CAS_KEY.format(platform=platform)
        cached = await self._redis.get(cache_key)
        if cached:
            import json
            return json.loads(cached)

        cas: list[dict[str, Any]] = []
        try:
            resp = await self._client.get(
                f"/aggregations/trending-cas/{platform}",
                params={"timeWindow": "24h", "pageSize": 20, "minMentions": 3},
            )
            if resp.status_code == 200:
                body = resp.json()
                # Response: {success, data: {data: [...], total, page, pageSize}}
                outer = body.get("data", {}) if isinstance(body, dict) else {}
                if isinstance(outer, dict):
                    cas = outer.get("data", [])
                elif isinstance(outer, list):
                    cas = outer
                log.info("Elfa trending CAs (%s): %d tokens", platform, len(cas))
            else:
                log.warning("Elfa trending CAs (%s) returned %s: %s", platform, resp.status_code, resp.text[:200])
        except Exception as exc:
            log.debug("Trending CAs fetch failed (%s): %s", platform, exc)

        import json
        await self._redis.setex(cache_key, _TRENDING_CAS_TTL, json.dumps(cas))
        return cas

    # ── 6. Token news ──────────────────────────────────────────────────────────

    async def get_token_news(self, symbol: str) -> list[dict[str, Any]]:
        """
        Fetch recent news mentions for a specific token.
        Returns list of news items with content, author, timestamp.
        Cached 10 min per symbol.
        """
        cache_key = _NEWS_KEY.format(symbol=symbol.upper())
        cached = await self._redis.get(cache_key)
        if cached:
            import json
            return json.loads(cached)

        news: list[dict[str, Any]] = []
        try:
            resp = await self._client.get(
                "/data/top-mentions",
                params={
                    "ticker": symbol.upper(),
                    "timeWindow": "24h",
                    "limit": 10,
                },
            )
            if resp.status_code == 200:
                body = resp.json()
                # Response: {success, data: [...]} — flat list under data
                raw = body.get("data", []) if isinstance(body, dict) else body
                items = raw if isinstance(raw, list) else []
                # Normalise fields for frontend display
                news = [
                    {
                        "link": item.get("link", ""),
                        "tweet_id": item.get("tweetId", ""),
                        "author": item.get("link", "").split("/")[3] if item.get("link") else "unknown",
                        "timestamp": item.get("mentionedAt", ""),
                        "like_count": item.get("likeCount", 0),
                        "repost_count": item.get("repostCount", 0),
                        "view_count": item.get("viewCount", 0),
                        "type": item.get("type", "post"),
                        "smart_score": item.get("repostBreakdown", {}).get("smart", 0),
                    }
                    for item in items
                    if isinstance(item, dict)
                ]
                log.debug("Elfa top mentions for %s: %d items", symbol, len(news))
            else:
                log.warning("Elfa top-mentions (%s) returned %s", symbol, resp.status_code)
        except Exception as exc:
            log.debug("Token news fetch failed for %s: %s", symbol, exc)

        import json
        await self._redis.setex(cache_key, _NEWS_TTL, json.dumps(news))
        return news

    # ── 7. AI hedge narrative (tokenAnalysis) ─────────────────────────────────

    async def get_hedge_narrative(self, symbol: str, action: str, sentiment: str) -> str:
        """
        Generate a 2-sentence AI explanation of a hedge action.
        Fired ONLY when a hedge opens — not on a timer.
        action: "opened" or "closed"
        Returns plain text narrative.
        """
        cache_key = f"aegis:elfa:narrative:{symbol.upper()}:{action}"
        cached = await self._redis.get(cache_key)
        if cached:
            return cached.decode() if isinstance(cached, bytes) else str(cached)

        narrative = f"{symbol} position hedged — {sentiment} sentiment detected."
        try:
            message = (
                f"In exactly 2 sentences, explain why a {sentiment} sentiment on {symbol} "
                f"would cause an autonomous risk engine to {action} a protective hedge. "
                f"Be specific about social signals and market mechanics. No fluff."
            )
            resp = await self._client.post(
                "/chat",
                json={
                    "message": message,
                    "analysisType": "tokenAnalysis",
                    "speed": "fast",
                    "assetMetadata": {"symbol": symbol.upper()},
                },
            )
            if resp.status_code == 200:
                body = resp.json()
                data = body.get("data", body)
                narrative = str(data.get("message", narrative))
                log.info("Elfa AI narrative for %s: %s", symbol, narrative[:80])
        except Exception as exc:
            log.debug("AI narrative failed for %s: %s", symbol, exc)

        await self._redis.setex(cache_key, 300, narrative)  # 5 min cache
        return narrative

    # ── 8. Macro market context ────────────────────────────────────────────────

    async def get_macro_context(self) -> str:
        """
        Get AI-synthesized market overview. Global — refreshed every 30 min.
        Used as the live "Market Climate" indicator on the Intelligence page.
        """
        cached = await self._redis.get(_MACRO_KEY)
        if cached:
            return cached.decode() if isinstance(cached, bytes) else str(cached)

        context = "Market conditions normal — no significant macro stress signals detected."
        try:
            resp = await self._client.post(
                "/chat",
                json={
                    "message": (
                        "In 3 sentences or less, summarize the current crypto market macro sentiment. "
                        "Focus on risk factors for leveraged perpetuals traders. Be direct and factual."
                    ),
                    "analysisType": "macro",
                    "speed": "fast",
                },
            )
            if resp.status_code == 200:
                body = resp.json()
                data = body.get("data", body)
                context = str(data.get("message", context))
                log.info("Elfa macro context updated: %s", context[:80])
        except Exception as exc:
            log.debug("Macro context fetch failed: %s", exc)

        await self._redis.setex(_MACRO_KEY, _MACRO_TTL, context)
        return context

    # ── 9. Smart money / account stats ────────────────────────────────────────

    async def get_smart_stats(self, username: str) -> dict[str, Any]:
        """
        Fetch smart money metrics for a Twitter account.
        On-demand only (user opens Intelligence tab).
        """
        cache_key = _SMART_STATS_KEY.format(username=username.lower())
        cached = await self._redis.get(cache_key)
        if cached:
            import json
            return json.loads(cached)

        stats: dict[str, Any] = {"username": username, "error": "unavailable"}
        try:
            resp = await self._client.get(
                "/account/smart-stats",
                params={"username": username},
            )
            if resp.status_code == 200:
                body = resp.json()
                stats = body.get("data", body)
        except Exception as exc:
            log.debug("Smart stats failed for %s: %s", username, exc)

        import json
        await self._redis.setex(cache_key, _SMART_STATS_TTL, json.dumps(stats))
        return stats

    # ── Bulk intelligence snapshot ─────────────────────────────────────────────

    async def get_intelligence_snapshot(self, symbols: list[str]) -> dict[str, Any]:
        """
        Aggregate all intelligence data for the Intelligence page.
        Returns narratives, CAs, macro context, news and crash alerts for active symbols.
        Uses cached values — no parallel Elfa calls, all TTL-gated.
        """
        import asyncio

        narratives, macro, twitter_cas, telegram_cas = await asyncio.gather(
            self.get_trending_narratives(),
            self.get_macro_context(),
            self.get_trending_cas("twitter"),
            self.get_trending_cas("telegram"),
            return_exceptions=True,
        )

        symbol_data: dict[str, Any] = {}
        for symbol in symbols:
            news, crash = await asyncio.gather(
                self.get_token_news(symbol),
                self.check_crash_keywords(symbol),
                return_exceptions=True,
            )
            symbol_data[symbol] = {
                "news": news if isinstance(news, list) else [],
                "crash_alert": crash if isinstance(crash, dict) else {},
            }

        return {
            "macro": macro if isinstance(macro, str) else "",
            "narratives": narratives if isinstance(narratives, list) else [],
            "trending_twitter": twitter_cas if isinstance(twitter_cas, list) else [],
            "trending_telegram": telegram_cas if isinstance(telegram_cas, list) else [],
            "symbols": symbol_data,
            "timestamp_ms": int(time.time() * 1000),
        }

    # ── Internal helpers ───────────────────────────────────────────────────────

    async def _fetch_trending_tokens(self) -> list[dict]:
        """GET /v2/aggregations/trending-tokens — unwraps doubly-nested envelope."""
        resp = await self._client.get(
            "/aggregations/trending-tokens",
            params={"timeWindow": "24h"},
        )
        if resp.status_code == 429:
            log.warning("Elfa rate limit hit")
            raise RuntimeError("Elfa rate limited")
        if resp.status_code != 200:
            raise RuntimeError(f"Elfa API {resp.status_code}: {resp.text}")

        body = resp.json()
        if isinstance(body, dict):
            outer = body.get("data", body)
            if isinstance(outer, dict):
                items = outer.get("data", [])
            elif isinstance(outer, list):
                items = outer
            else:
                items = []
        elif isinstance(body, list):
            items = body
        else:
            items = []

        log.debug("Elfa trending tokens: %d items", len(items))
        return items if isinstance(items, list) else []

    def _unwrap_list(self, body: Any) -> list[dict]:
        """Generic envelope unwrapper — handles {success, data: [...]} or {data: {data: [...]}}."""
        if isinstance(body, list):
            return body
        if not isinstance(body, dict):
            return []
        data = body.get("data", body)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            inner = data.get("data", [])
            return inner if isinstance(inner, list) else []
        return []

    def _extract_symbol(self, items: list[dict], symbol: str) -> SentimentData:
        """Find symbol in trending-tokens response and normalise score."""
        lower = symbol.lower()
        for item in items:
            if not isinstance(item, dict):
                continue
            item_token = (
                item.get("token") or item.get("symbol") or item.get("ticker") or ""
            ).lower()
            if item_token == lower:
                change_pct = float(item.get("change_percent", 0) or 0)
                raw_score = 50.0 + (change_pct / 2.0)
                score = max(0.0, min(100.0, raw_score))
                mentions = int(item.get("current_count", 0) or 0)
                log.info(
                    "Elfa: %s change_pct=%.1f%% → score=%.1f sentiment=%s mentions=%d",
                    symbol, change_pct, score, _classify_sentiment(score).value, mentions,
                )
                return SentimentData(
                    symbol=symbol,
                    score=score,
                    sentiment=_classify_sentiment(score),
                    raw_mentions=mentions,
                )
        log.debug("Elfa: %s not in trending — defaulting NEUTRAL", symbol)
        return SentimentData(symbol=symbol, score=50.0, sentiment=Sentiment.NEUTRAL)

    async def close(self) -> None:
        await self._client.aclose()
