"""
Async Pacifica REST API client.

Design decisions:
- httpx.AsyncClient with connection pooling (one instance per app lifetime)
- Exponential backoff with jitter on 5xx and network errors
- 429 rate-limit handled: wait Retry-After header seconds, then retry
- All response parsing uses Pydantic models — no raw dict access in callers
- builder_code is NEVER a parameter — it is injected by signing helpers
"""
from __future__ import annotations

import asyncio
import logging
import random
from typing import Any

import httpx

from app.core.config import get_settings
from app.models.pacifica import (
    AccountInfo,
    BuilderTrade,
    CancelOrderResponse,
    MarketInfo,
    OrderResponse,
    Position,
)

log = logging.getLogger(__name__)

_MAX_RETRIES = 4
_BASE_BACKOFF_S = 0.5
_MAX_BACKOFF_S = 30.0


def _backoff(attempt: int) -> float:
    """Exponential backoff with full jitter."""
    cap = min(_MAX_BACKOFF_S, _BASE_BACKOFF_S * (2**attempt))
    return random.uniform(0, cap)


class PacificaError(Exception):
    """Raised when Pacifica returns a non-retriable error response."""

    def __init__(self, status: int, body: str) -> None:
        self.status = status
        self.body = body
        super().__init__(f"Pacifica API error {status}: {body}")


class PacificaClient:
    """
    Async REST client for the Pacifica API.
    Instantiate once; call close() during app shutdown.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._base = settings.pacifica_rest_url.rstrip("/")
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if settings.pacifica_api_config_key:
            headers["PF-API-KEY"] = settings.pacifica_api_config_key

        self._client = httpx.AsyncClient(
            base_url=self._base,
            headers=headers,
            timeout=httpx.Timeout(10.0, connect=5.0),
        )

    # ── Internal request helpers ──────────────────────────────────────────────

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        return await self._request("GET", path, params=params)

    async def _post(self, path: str, body: dict[str, Any]) -> Any:
        return await self._request("POST", path, json=body)

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> Any:
        for attempt in range(_MAX_RETRIES):
            try:
                resp = await self._client.request(
                    method, path, params=params, json=json
                )

                if resp.status_code == 429:
                    retry_after = float(resp.headers.get("Retry-After", "1"))
                    log.warning(
                        "Pacifica rate limit hit on %s — waiting %.1fs", path, retry_after
                    )
                    await asyncio.sleep(retry_after)
                    continue

                if resp.status_code >= 500:
                    wait = _backoff(attempt)
                    log.warning(
                        "Pacifica 5xx on %s (attempt %d/%d) — retrying in %.2fs",
                        path, attempt + 1, _MAX_RETRIES, wait,
                    )
                    await asyncio.sleep(wait)
                    continue

                if resp.status_code >= 400:
                    raise PacificaError(resp.status_code, resp.text)

                return resp.json()

            except (httpx.ConnectError, httpx.TimeoutException) as exc:
                wait = _backoff(attempt)
                log.warning(
                    "Pacifica network error on %s (attempt %d/%d): %s — retrying in %.2fs",
                    path, attempt + 1, _MAX_RETRIES, exc, wait,
                )
                if attempt == _MAX_RETRIES - 1:
                    raise
                await asyncio.sleep(wait)

        raise PacificaError(0, f"Max retries ({_MAX_RETRIES}) exceeded for {path}")

    # ── Account ───────────────────────────────────────────────────────────────

    async def get_account_info(self, wallet: str) -> AccountInfo:
        data = await self._get("/account", params={"account": wallet})
        return AccountInfo.model_validate(data)

    async def get_positions(self, wallet: str) -> list[Position]:
        data = await self._get("/positions", params={"account": wallet})
        # Pacifica returns a list directly
        if isinstance(data, list):
            return [Position.model_validate(p) for p in data]
        return []

    # ── Market data ───────────────────────────────────────────────────────────

    async def get_market_info(self) -> dict[str, MarketInfo]:
        """Returns a dict keyed by symbol."""
        data = await self._get("/info")
        result: dict[str, MarketInfo] = {}
        items = data if isinstance(data, list) else data.get("data", [])
        for item in items:
            info = MarketInfo.model_validate(item)
            result[info.symbol] = info
        return result

    # ── Orders ────────────────────────────────────────────────────────────────

    async def create_market_order(self, payload: dict[str, Any]) -> OrderResponse:
        """
        Submit a pre-signed market order payload.
        Payload must already contain builder_code and signature.
        This method does NOT modify the payload — all signing is done upstream.
        """
        if payload.get("builder_code") != "AEGIS":
            raise ValueError(
                "create_market_order called without builder_code='AEGIS'. "
                "All orders must be constructed via signing helpers."
            )
        data = await self._post("/orders/create_market", payload)
        return OrderResponse.model_validate(data)

    async def cancel_order(self, payload: dict[str, Any]) -> CancelOrderResponse:
        """Submit a pre-signed cancel_order payload."""
        data = await self._post("/orders/cancel", payload)
        return CancelOrderResponse.model_validate(data)

    async def create_stop_order(self, payload: dict[str, Any]) -> OrderResponse:
        """Submit a pre-signed stop order payload (used for hedge stop-losses)."""
        if payload.get("builder_code") != "AEGIS":
            raise ValueError("create_stop_order called without builder_code='AEGIS'.")
        data = await self._post("/orders/stop/create", payload)
        return OrderResponse.model_validate(data)

    # ── Builder ───────────────────────────────────────────────────────────────

    async def approve_builder_code(self, signed_payload: dict[str, Any]) -> dict[str, Any]:
        """
        Forward a user-signed builder code approval to Pacifica.
        The payload is signed by the USER's wallet (Privy), not the Agent Key.
        """
        return await self._post("/account/builder_codes/approve", signed_payload)

    async def get_builder_trades(
        self,
        builder_code: str,
        limit: int = 100,
    ) -> list[BuilderTrade]:
        data = await self._get(
            "/builder/trades",
            params={"builder_code": builder_code, "limit": limit},
        )
        items = data if isinstance(data, list) else data.get("data", [])
        return [BuilderTrade.model_validate(t) for t in items]

    async def get_builder_leaderboard(self, builder_code: str) -> list[dict[str, Any]]:
        data = await self._get(
            "/leaderboard/builder_code",
            params={"builder_code": builder_code},
        )
        return data if isinstance(data, list) else data.get("data", [])

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def close(self) -> None:
        await self._client.aclose()
        log.info("PacificaClient closed")
