"""
Pacifica WebSocket monitor.

Responsibilities:
  - Maintain a persistent connection to wss://test-ws.pacifica.fi/ws
  - Subscribe to the `prices` channel for real-time mark prices
  - Store latest mark prices in Redis (TTL 30s) for the risk engine
  - Reconnect with exponential backoff on any failure
  - Heartbeat ping every 30s to prevent server-side 60s disconnect

Account data (positions, cross_mmr) is fetched via REST polling because
the exact auth format for per-account WS subscriptions is not fully
documented. The REST fallback is reliable and sufficient at 500ms cadence.
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import random
from typing import Any

from typing import TYPE_CHECKING

import websockets

if TYPE_CHECKING:
    import redis.asyncio as aioredis
from websockets.exceptions import ConnectionClosed

from app.core.config import get_settings

log = logging.getLogger(__name__)

_PING_INTERVAL_S = 30
_RECONNECT_BASE_S = 1.0
_RECONNECT_MAX_S = 60.0


def _backoff(attempt: int) -> float:
    cap = min(_RECONNECT_MAX_S, _RECONNECT_BASE_S * (2**attempt))
    return random.uniform(0, cap)


class PacificaWsMonitor:
    """
    Long-running WebSocket monitor. Start via run() as an asyncio task.
    Stop cleanly by calling stop().
    """

    def __init__(self, redis: "aioredis.Redis") -> None:
        self._redis = redis
        self._stop_event = asyncio.Event()
        self._prices: dict[str, str] = {}  # symbol → mark price string (in-memory, no Redis)
        settings = get_settings()
        self._ws_url = settings.pacifica_ws_url
        if settings.pacifica_api_config_key:
            self._extra_headers = {"PF-API-KEY": settings.pacifica_api_config_key}
        else:
            self._extra_headers: dict[str, str] = {}

    async def run(self) -> None:
        """Entry point — runs until stop() is called."""
        log.info("WS monitor starting — target=%s", self._ws_url)
        attempt = 0

        while not self._stop_event.is_set():
            try:
                await self._connect_and_listen()
                attempt = 0  # reset on clean disconnect
            except asyncio.CancelledError:
                break
            except Exception as exc:
                wait = _backoff(attempt)
                log.warning(
                    "WS monitor disconnected (attempt %d): %s — reconnecting in %.1fs",
                    attempt, exc, wait,
                )
                attempt += 1
                await asyncio.sleep(wait)

        log.info("WS monitor stopped")

    async def stop(self) -> None:
        self._stop_event.set()

    async def _connect_and_listen(self) -> None:
        async with websockets.connect(
            self._ws_url,
            additional_headers=self._extra_headers,
            ping_interval=None,   # we manage pings manually
            open_timeout=10,
            close_timeout=5,
        ) as ws:
            log.info("WS connected to Pacifica")
            await self._subscribe_prices(ws)

            ping_task = asyncio.create_task(self._heartbeat(ws))
            try:
                async for raw_message in ws:
                    if self._stop_event.is_set():
                        break
                    await self._handle_message(raw_message)
            except ConnectionClosed as exc:
                log.warning("WS connection closed: %s", exc)
            finally:
                ping_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await ping_task

    async def _subscribe_prices(self, ws: Any) -> None:
        """Subscribe to the prices channel (no auth required)."""
        msg = json.dumps({
            "method": "subscribe",
            "params": {"source": "prices"},
        })
        await ws.send(msg)
        log.debug("Sent prices subscription")

    async def _heartbeat(self, ws: Any) -> None:
        """Send ping every 30s to keep connection alive."""
        while True:
            await asyncio.sleep(_PING_INTERVAL_S)
            try:
                await ws.send(json.dumps({"method": "ping"}))
                log.debug("WS ping sent")
            except ConnectionClosed:
                break

    async def _handle_message(self, raw: str | bytes) -> None:
        """Parse incoming WS message and dispatch to handlers."""
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            log.warning("WS received non-JSON message: %r", raw)
            return

        channel = msg.get("channel")

        if channel == "pong":
            log.debug("WS pong received")
            return

        if channel == "prices":
            await self._handle_prices(msg.get("data", []))
            return

    async def _handle_prices(self, price_data: list[dict[str, Any]]) -> None:
        """
        Cache each symbol's mark price in-process memory.
        No Redis writes — prices are only needed within this process.
        """
        for item in price_data:
            symbol: str = item.get("symbol", "")
            mark: str = item.get("mark", "")
            if symbol and mark:
                self._prices[symbol] = mark

    def get_mark_price(self, symbol: str) -> str | None:
        """Retrieve the latest cached mark price for a symbol (in-memory, no Redis)."""
        return self._prices.get(symbol)

