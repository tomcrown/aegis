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
import json

from typing import TYPE_CHECKING


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

from app.models.risk import SentimentData  # add to imports at top

from decimal import Decimal



log = logging.getLogger(__name__)

_RISK_POLL_INTERVAL_S = 1.5     # 1500ms — stays under 300 credits/60s with API config key
_ELFA_POLL_INTERVAL_S = 60.0    # 60s sentiment refresh
_MACRO_POLL_INTERVAL_S = 1800.0 # 30 min macro context
_CRASH_CHECK_INTERVAL_S = 300.0 # 5 min crash keyword check
_HEDGE_STALE_GRACE_S = 60  # don't clear a hedge placed less than 60s ago
_MIN_HEDGE_NOTIONAL_USD = Decimal("10.00") 


class Orchestrator:
    """Central coordinator for all Aegis background tasks."""

    @property
    def elfa(self) -> ElfaClient:
        return self._elfa

    def __init__(
        self,
        redis: aioredis.Redis,
        pacifica: PacificaClient,
        vault: VaultManager,
    ) -> None:
        self._redis: aioredis.Redis = redis
        self._pacifica = pacifica
        self._vault = vault
        self._elfa = ElfaClient(redis=redis)
        self._ws_monitor = PacificaWsMonitor(redis=redis)
        self._execution = ExecutionEngine(pacifica=pacifica)
        self._tasks: list[asyncio.Task] = []
        self._sentiment_cache: dict[str, SentimentData] = {}
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

        # ── Synthetic cross_mmr ───────────────────────────────────────────────
        # Pacifica testnet always returns cross_mmr="0" — a known data bug.
        # We derive it ourselves from data Pacifica DOES return correctly:
        #   synthetic_cross_mmr = (mark_price / liquidation_price) × 100
        # This is the actual mathematical definition: at liquidation, mark==liq → 100%.
        # We take the LOWEST ratio across all positions (worst position drives overall risk).
        # If no mark price in Redis yet (WS not warmed up), fall back to entry_price.
        mark_prices: dict[str, float] = {}
        synthetic_ratios: list[float] = []

        for pos in positions:
            try:
                mp_raw = await self._ws_monitor.get_mark_price(pos.symbol)
                mark = float(mp_raw) if mp_raw else float(pos.entry_price)
                mark_prices[pos.symbol] = mark
            except Exception:
                mark = float(pos.entry_price)
                mark_prices[pos.symbol] = mark

            liq = float(pos.liquidation_price) if pos.liquidation_price else 0.0
            if liq > 0:
                if pos.side == "short":
                    ratio = (liq / mark) * 100.0
                else:
                    ratio = (mark / liq) * 100.0
                synthetic_ratios.append(ratio)

        if synthetic_ratios:
            cross_mmr_pct = min(synthetic_ratios)  # worst position drives the metric
        else:
            # No liquidation prices available — treat as safe
            cross_mmr_pct = 200.0

        synthetic_cross_mmr_str = f"{cross_mmr_pct:.4f}"

        log.debug(
            "Synthetic cross_mmr for %s: %.2f%% (from %d positions, mark_prices=%s)",
            wallet, cross_mmr_pct, len(positions), mark_prices,
        )

        snapshot = AccountSnapshot(
            wallet=wallet,
            cross_mmr=synthetic_cross_mmr_str,
            available_to_spend=account_info.available_to_spend,
            positions=positions,
            timestamp_ms=int(time.time() * 1000),
        )

        active_hedges = await self._vault.get_active_hedges(wallet)

      
        
        if active_hedges:
            try:
                open_order_ids = await self._pacifica.get_open_order_ids(wallet)
                now = int(time.time())
                for symbol, order_id in list(active_hedges.items()):
                    if open_order_ids is not None and order_id not in open_order_ids:
                        # Check placement time — don't clear recently placed hedges
                        hedge_key = f"aegis:vault:hedges:{wallet}:{symbol}"
                        raw = await self._redis.get(hedge_key)
                        placed_at = 0
                        if raw:
                            try:
                                data = json.loads(raw)
                                placed_at = data.get("placed_at", 0) if isinstance(data, dict) else 0
                            except Exception:
                                pass
                        
                        if now - placed_at < _HEDGE_STALE_GRACE_S:
                            log.debug(
                                "Hedge %d for %s/%s not in open orders but placed %ds ago — skipping stale clear",
                                order_id, wallet, symbol, now - placed_at,
                            )
                            continue

                        log.info(
                            "Stale hedge detected: wallet=%s symbol=%s order_id=%d not in open orders — clearing",
                            wallet, symbol, order_id,
                        )
                        await self._vault.clear_hedge(wallet, symbol)
                        del active_hedges[symbol]
            except Exception as exc:
                log.debug("Stale hedge check failed for %s: %s", wallet, exc)

        user_threshold = await self._vault.get_user_threshold(wallet)

        output = risk_engine.evaluate(
            account=snapshot,
            sentiment_map=self._sentiment_cache,
            active_hedge_order_ids=active_hedges,
            user_hedge_threshold=user_threshold,
        )

        # Store sparkline history (last 60 readings)
        spark_key = f"aegis:sparkline:{wallet}"
        await self._redis.lpush(spark_key, cross_mmr_pct)
        await self._redis.ltrim(spark_key, 0, 59)
        await self._redis.expire(spark_key, 300)

        # Push mmr_update to frontend
        await ws_manager.broadcast(wallet, {
            "type": "mmr_update",
            "wallet": wallet,
            "timestamp_ms": int(time.time() * 1000),
            "payload": {
                "cross_mmr_pct": cross_mmr_pct,
                "risk_tier": output.risk_tier.value,
                "cross_mmr": synthetic_cross_mmr_str,
                "mark_prices": mark_prices,
            },
        })

        # ── Open hedges ────────────────────────────────────────────────────────
        for hedge in output.hedges_to_open:
            try:
                mark_price = await self._ws_monitor.get_mark_price(hedge.symbol)

                # Guard: skip if USD notional is below Pacifica's minimum
                if mark_price:
                    notional = Decimal(hedge.hedge_amount) * Decimal(mark_price)
                    if notional < _MIN_HEDGE_NOTIONAL_USD:
                        log.warning(
                            "Hedge for %s/%s skipped — notional $%.2f below Pacifica minimum $%s "
                            "(amount=%s mark=%s)",
                            wallet, hedge.symbol, notional, _MIN_HEDGE_NOTIONAL_USD,
                            hedge.hedge_amount, mark_price,
                        )
                        continue

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
                    "message": f"Safety buffer shrinking — margin ratio at {cross_mmr_pct:.1f}%",
                    "cross_mmr_pct": cross_mmr_pct,
                },
            })
