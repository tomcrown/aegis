"""
Aegis background task orchestrator.

Manages three concurrent long-running tasks:
  1. ws_monitor   — maintains Pacifica WebSocket for mark price data
  2. elfa_poller  — polls Elfa every 60s for active symbols
  3. risk_loop    — evaluates risk + triggers execution every 500ms per user

The risk_loop is the heartbeat of the system:
  for each active user:
    1. Fetch account info + positions from Pacifica REST
    2. Run risk engine with cached prices + Elfa sentiment
    3. On HEDGE tier: call execution engine
    4. On recovery: close open hedges
    5. Push WS events to connected frontend tabs
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

_RISK_POLL_INTERVAL_S = 0.5    # 500ms account polling cadence
_ELFA_POLL_INTERVAL_S = 60.0   # 60s sentiment refresh
_ALERT_TIER_THRESHOLD = 70.0   # push alerts to frontend above this %


class Orchestrator:
    """
    Central coordinator for all Aegis background tasks.
    One instance per application lifetime.
    """

    @property
    def elfa(self) -> ElfaClient:
        """Expose ElfaClient for use by the sentiment API route via app.state.elfa."""
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

    async def start(self) -> None:
        """Launch all background tasks."""
        self._tasks = [
            asyncio.create_task(self._ws_monitor.run(), name="ws_monitor"),
            asyncio.create_task(self._elfa_poll_loop(), name="elfa_poller"),
            asyncio.create_task(self._risk_loop(), name="risk_loop"),
        ]
        log.info("Orchestrator started — %d tasks running", len(self._tasks))

    async def stop(self) -> None:
        """Gracefully cancel all background tasks."""
        await self._ws_monitor.stop()
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        await self._elfa.close()
        log.info("Orchestrator stopped")

    # ── Elfa polling loop ─────────────────────────────────────────────────────

    async def _elfa_poll_loop(self) -> None:
        """Poll Elfa every 60s for all symbols held by active users."""
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
        """Collect all active symbols and batch-fetch sentiment from Elfa."""
        active_users = await self._vault.get_active_users()
        if not active_users:
            return

        # Collect all symbols across all active users
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
        log.debug("Elfa refreshed for symbols: %s", list(symbols))

    # ── Risk evaluation loop ──────────────────────────────────────────────────

    async def _risk_loop(self) -> None:
        """Main 500ms evaluation loop — one pass per active user per tick."""
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
        """Evaluate risk for each active user concurrently."""
        active_users = await self._vault.get_active_users()
        if not active_users:
            return

        await asyncio.gather(
            *[self._evaluate_user(wallet) for wallet in active_users],
            return_exceptions=True,
        )

    async def _evaluate_user(self, wallet: str) -> None:
        """Full risk evaluation cycle for a single wallet."""
        try:
            account_info = await self._pacifica.get_account_info(wallet)
            positions = await self._pacifica.get_positions(wallet)
        except PacificaError as exc:
            log.warning("Pacifica fetch failed for %s: %s", wallet, exc)
            return

        snapshot = AccountSnapshot(
            wallet=wallet,
            cross_mmr=account_info.cross_mmr,
            available_to_spend=account_info.available_to_spend,
            positions=positions,
            timestamp_ms=int(time.time() * 1000),
        )

        active_hedges = await self._vault.get_active_hedges(wallet)

        output = risk_engine.evaluate(
            account=snapshot,
            sentiment_map=self._sentiment_cache,
            active_hedge_order_ids=active_hedges,
        )

        # Push risk state update to frontend
        cross_mmr_pct = float(account_info.cross_mmr) * 100
        await ws_manager.broadcast(wallet, {
            "type": "mmr_update",
            "wallet": wallet,
            "cross_mmr": account_info.cross_mmr,
            "cross_mmr_pct": cross_mmr_pct,
            "risk_tier": output.risk_tier.value,
            "timestamp_ms": int(time.time() * 1000),
        })

        # ── Open hedges ───────────────────────────────────────────────────────
        for hedge in output.hedges_to_open:
            try:
                mark_price = await self._ws_monitor.get_mark_price(hedge.symbol)
                order = await self._execution.open_hedge(hedge, mark_price=mark_price)
                await self._vault.record_hedge(wallet, hedge.symbol, order.order_id)

                await ws_manager.broadcast(wallet, {
                    "type": "hedge_opened",
                    "wallet": wallet,
                    "symbol": hedge.symbol,
                    "order_id": order.order_id,
                    "amount": hedge.hedge_amount,
                    "side": hedge.hedge_side,
                    "sentiment": hedge.sentiment.value,
                    "cross_mmr": output.cross_mmr,
                    "timestamp_ms": int(time.time() * 1000),
                })
            except Exception as exc:
                log.error(
                    "Failed to open hedge for %s/%s: %s",
                    wallet, hedge.symbol, exc, exc_info=True,
                )

        # ── Close recovering hedges ────────────────────────────────────────────
        for recovery in output.hedges_to_close:
            try:
                await self._execution.close_hedge(recovery)
                await self._vault.clear_hedge(wallet, recovery.symbol)

                await ws_manager.broadcast(wallet, {
                    "type": "hedge_closed",
                    "wallet": wallet,
                    "symbol": recovery.symbol,
                    "order_id": recovery.order_id,
                    "timestamp_ms": int(time.time() * 1000),
                })
            except Exception as exc:
                log.error(
                    "Failed to close hedge for %s/%s: %s",
                    wallet, recovery.symbol, exc, exc_info=True,
                )

        # ── Alert for WATCH tier ───────────────────────────────────────────────
        if output.risk_tier == RiskTier.WATCH:
            await ws_manager.broadcast(wallet, {
                "type": "alert",
                "wallet": wallet,
                "message": f"Risk rising — cross_mmr at {cross_mmr_pct:.1f}%",
                "cross_mmr_pct": cross_mmr_pct,
                "timestamp_ms": int(time.time() * 1000),
            })
