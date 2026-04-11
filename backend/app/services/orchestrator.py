"""
Aegis background task orchestrator.

Background tasks:
  1. ws_monitor      — Pacifica WebSocket for mark prices
  2. elfa_poller     — sentiment + narratives + macro + crash keywords (60s)
  3. macro_poller    — AI macro context (30 min)
  4. risk_loop       — risk evaluation + hedge execution (500ms per user)

The risk_loop is the heartbeat:
  for each active user:
    1. Fetch account info + positions from Pacifica REST
    2. Run risk engine with cached prices + Elfa sentiment
    3. On HEDGE tier: call execution engine, generate AI narrative
    4. On recovery: close open hedges
    5. Push WS events to connected frontend tabs
    6. Check crash keywords for at-risk users
"""
from __future__ import annotations

import asyncio
import logging
import time

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import redis.asyncio as aioredis

from app.api.websocket.events import manager as ws_manager
from app.models.pacifica import AccountSnapshot
from app.models.risk import RiskTier
from app.services.elfa.client import ElfaClient
from app.services.execution.engine import ExecutionEngine
from app.services.pacifica.client import PacificaClient, PacificaError
from app.services.pacifica.ws_monitor import PacificaWsMonitor
from app.services.risk import engine as risk_engine
from app.services.vault.manager import VaultManager

log = logging.getLogger(__name__)

_RISK_POLL_INTERVAL_S = 0.5     # 500ms
_ELFA_POLL_INTERVAL_S = 60.0    # 60s sentiment refresh
_MACRO_POLL_INTERVAL_S = 1800.0 # 30 min macro context
_CRASH_CHECK_INTERVAL_S = 300.0 # 5 min crash keyword check


class Orchestrator:
    """Central coordinator for all Aegis background tasks."""

    @property
    def elfa(self) -> ElfaClient:
        return self._elfa

    def __init__(
        self,
        redis: "aioredis.Redis",
        pacifica: PacificaClient,
        vault: VaultManager,
    ) -> None:
        self._redis = redis
        self._pacifica = pacifica
        self._vault = vault
        self._elfa = ElfaClient(redis=redis)
        self._ws_monitor = PacificaWsMonitor(redis=redis)
        self._execution = ExecutionEngine(pacifica=pacifica)
        self._tasks: list[asyncio.Task] = []
        self._sentiment_cache: dict[str, object] = {}
        # Cache last good account info per wallet — used as fallback during Pacifica 5xx
        self._account_cache: dict[str, object] = {}
        self._consecutive_failures: dict[str, int] = {}

    async def start(self) -> None:
        self._tasks = [
            asyncio.create_task(self._ws_monitor.run(), name="ws_monitor"),
            asyncio.create_task(self._elfa_poll_loop(), name="elfa_poller"),
            asyncio.create_task(self._macro_poll_loop(), name="macro_poller"),
            asyncio.create_task(self._risk_loop(), name="risk_loop"),
        ]
        log.info("Orchestrator started — %d tasks running", len(self._tasks))

    async def stop(self) -> None:
        await self._ws_monitor.stop()
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        await self._elfa.close()
        log.info("Orchestrator stopped")

    # ── Elfa sentiment + crash detection loop ─────────────────────────────────

    async def _elfa_poll_loop(self) -> None:
        log.info("Elfa poller started")
        while True:
            try:
                await self._refresh_elfa_sentiment()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                log.warning("Elfa poll error: %s", exc)
            await asyncio.sleep(_ELFA_POLL_INTERVAL_S)

    async def _refresh_elfa_sentiment(self) -> None:
        """Collect active symbols, batch-fetch sentiment, detect deterioration."""
        active_users = await self._vault.get_active_users()
        if not active_users:
            return

        symbols: set[str] = set()
        for wallet in active_users:
            try:
                positions = await self._pacifica.get_positions(wallet)
                symbols.update(p.symbol for p in positions)
            except Exception:
                pass

        if not symbols:
            return

        sentiment_map = await self._elfa.get_sentiment_batch(list(symbols))
        self._sentiment_cache.update(sentiment_map)

        # Detect rapid sentiment deterioration
        for symbol, data in sentiment_map.items():
            prev_key = f"aegis:elfa:prev_score:{symbol}"
            prev_raw = await self._redis.get(prev_key)
            if prev_raw:
                prev_score = float(prev_raw)
                drop = prev_score - data.score
                if drop >= 15:
                    log.warning(
                        "SENTIMENT ALERT: %s score dropped %.1f pts (%.1f→%.1f)",
                        symbol, drop, prev_score, data.score,
                    )
                    for wallet in active_users:
                        await ws_manager.broadcast(wallet, {
                            "type": "alert",
                            "wallet": wallet,
                            "timestamp_ms": int(time.time() * 1000),
                            "payload": {
                                "kind": "sentiment_drop",
                                "message": f"{symbol} social sentiment dropped sharply — risk engine elevated.",
                                "symbol": symbol,
                                "drop": round(drop, 1),
                                "score": round(data.score, 1),
                            },
                        })
            await self._redis.setex(prev_key, 300, str(data.score))

        log.debug("Elfa refreshed for symbols: %s", list(symbols))

        # Check crash keywords for active symbols (cached 10 min so cost is low)
        for symbol in symbols:
            try:
                crash = await self._elfa.check_crash_keywords(symbol)
                if crash.get("alert"):
                    for wallet in active_users:
                        await ws_manager.broadcast(wallet, {
                            "type": "alert",
                            "wallet": wallet,
                            "timestamp_ms": int(time.time() * 1000),
                            "payload": {
                                "kind": "crash_keywords",
                                "message": f"⚠ {symbol}: crash signals detected on social ({', '.join(crash.get('keywords_hit', []))})",
                                "symbol": symbol,
                                "keywords": crash.get("keywords_hit", []),
                            },
                        })
            except Exception:
                pass

    # ── Macro context poll loop ────────────────────────────────────────────────

    async def _macro_poll_loop(self) -> None:
        """Refresh AI macro context every 30 minutes."""
        log.info("Macro poller started")
        while True:
            try:
                await self._elfa.get_macro_context()
                log.debug("Macro context refreshed")
            except asyncio.CancelledError:
                break
            except Exception as exc:
                log.warning("Macro poll error: %s", exc)
            await asyncio.sleep(_MACRO_POLL_INTERVAL_S)

    # ── Risk evaluation loop ───────────────────────────────────────────────────

    async def _risk_loop(self) -> None:
        log.info("Risk loop started — interval=%.1fs", _RISK_POLL_INTERVAL_S)
        while True:
            try:
                await self._evaluate_all_users()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                log.error("Risk loop unhandled error: %s", exc, exc_info=True)
            await asyncio.sleep(_RISK_POLL_INTERVAL_S)

    async def _evaluate_all_users(self) -> None:
        active_users = await self._vault.get_active_users()
        if not active_users:
            return
        await asyncio.gather(
            *[self._evaluate_user(wallet) for wallet in active_users],
            return_exceptions=True,
        )

    async def _evaluate_user(self, wallet: str) -> None:
        try:
            account_info = await self._pacifica.get_account_info(wallet)
            positions = await self._pacifica.get_positions(wallet)
            # Cache the last good snapshot
            self._account_cache[wallet] = (account_info, positions)
            self._consecutive_failures[wallet] = 0
        except PacificaError as exc:
            failures = self._consecutive_failures.get(wallet, 0) + 1
            self._consecutive_failures[wallet] = failures
            # Use cached snapshot for up to 30 consecutive failures (~15s) then give up
            cached = self._account_cache.get(wallet)
            if cached and failures <= 30:
                log.debug(
                    "Pacifica /account unavailable for %s (failure #%d) — using cached snapshot",
                    wallet, failures,
                )
                account_info, positions = cached  # type: ignore[assignment]
            else:
                if failures == 1 or failures % 10 == 0:
                    log.warning("Pacifica fetch failed for %s: %s", wallet, exc)
                return

        # If no positions, nothing to hedge — broadcast safe state and return early
        if not positions:
            # No positions = zero risk. Send 200 so frontend ring shows 0% danger (200-200=0).
            await ws_manager.broadcast(wallet, {
                "type": "mmr_update",
                "wallet": wallet,
                "timestamp_ms": int(time.time() * 1000),
                "payload": {
                    "cross_mmr_pct": 200.0,
                    "risk_tier": "safe",
                    "cross_mmr": "200",
                    "no_positions": True,
                },
            })
            return

        # Pacifica sometimes returns cross_mmr="0" while positions exist — bad data.
        # A real 0% cross_mmr would already be liquidated. Treat as stale and skip.
        raw_mmr = float(account_info.cross_mmr) if account_info.cross_mmr else 0.0
        if raw_mmr == 0.0 and positions:
            log.debug("cross_mmr=0 with active positions for %s — Pacifica data not ready, skipping cycle", wallet)
            return

        snapshot = AccountSnapshot(
            wallet=wallet,
            cross_mmr=account_info.cross_mmr,
            available_to_spend=account_info.available_to_spend,
            positions=positions,
            timestamp_ms=int(time.time() * 1000),
        )

        active_hedges = await self._vault.get_active_hedges(wallet)
        user_threshold = await self._vault.get_user_threshold(wallet)

        output = risk_engine.evaluate(
            account=snapshot,
            sentiment_map=self._sentiment_cache,
            active_hedge_order_ids=active_hedges,
            user_hedge_threshold=user_threshold,
        )

        # Store sparkline history (last 60 readings)
        cross_mmr_pct = float(account_info.cross_mmr)
        spark_key = f"aegis:sparkline:{wallet}"
        await self._redis.lpush(spark_key, cross_mmr_pct)
        await self._redis.ltrim(spark_key, 0, 59)
        await self._redis.expire(spark_key, 300)

        # Fetch live mark prices for all positions (non-blocking best-effort)
        mark_prices: dict[str, float] = {}
        for pos in positions:
            try:
                mp = await self._ws_monitor.get_mark_price(pos.symbol)
                if mp:
                    mark_prices[pos.symbol] = float(mp)
            except Exception:
                pass

        # Push mmr_update to frontend
        await ws_manager.broadcast(wallet, {
            "type": "mmr_update",
            "wallet": wallet,
            "timestamp_ms": int(time.time() * 1000),
            "payload": {
                "cross_mmr_pct": cross_mmr_pct,
                "risk_tier": output.risk_tier.value,
                "cross_mmr": account_info.cross_mmr,
                "mark_prices": mark_prices,
            },
        })

        # ── Open hedges ────────────────────────────────────────────────────────
        for hedge in output.hedges_to_open:
            try:
                mark_price = await self._ws_monitor.get_mark_price(hedge.symbol)
                order = await self._execution.open_hedge(hedge, mark_price=mark_price)
                await self._vault.record_hedge(wallet, hedge.symbol, order.order_id)

                # Generate AI narrative for this hedge (async, non-blocking)
                try:
                    narrative = await self._elfa.get_hedge_narrative(
                        hedge.symbol, "opened", hedge.sentiment.value
                    )
                except Exception:
                    narrative = f"{hedge.symbol} hedge opened — {hedge.sentiment.value} sentiment."

                await ws_manager.broadcast(wallet, {
                    "type": "hedge_opened",
                    "wallet": wallet,
                    "timestamp_ms": int(time.time() * 1000),
                    "payload": {
                        "symbol": hedge.symbol,
                        "order_id": order.order_id,
                        "amount": hedge.hedge_amount,
                        "side": hedge.hedge_side,
                        "sentiment": hedge.sentiment.value,
                        "cross_mmr": output.cross_mmr,
                        "narrative": narrative,
                    },
                })
            except Exception as exc:
                log.error("Failed to open hedge for %s/%s: %s", wallet, hedge.symbol, exc, exc_info=True)

        # ── Close recovering hedges ────────────────────────────────────────────
        for recovery in output.hedges_to_close:
            try:
                await self._execution.close_hedge(recovery)
                await self._vault.clear_hedge(wallet, recovery.symbol)

                await ws_manager.broadcast(wallet, {
                    "type": "hedge_closed",
                    "wallet": wallet,
                    "timestamp_ms": int(time.time() * 1000),
                    "payload": {
                        "symbol": recovery.symbol,
                        "order_id": recovery.order_id,
                    },
                })
            except Exception as exc:
                log.error("Failed to close hedge for %s/%s: %s", wallet, recovery.symbol, exc, exc_info=True)

        # ── Alert for WATCH tier ───────────────────────────────────────────────
        if output.risk_tier == RiskTier.WATCH:
            await ws_manager.broadcast(wallet, {
                "type": "alert",
                "wallet": wallet,
                "timestamp_ms": int(time.time() * 1000),
                "payload": {
                    "kind": "watch_tier",
                    "message": f"Safety buffer shrinking — {(200 - cross_mmr_pct):.1f}% margin ratio",
                    "cross_mmr_pct": cross_mmr_pct,
                },
            })
