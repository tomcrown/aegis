"""
Fuul conversion event client.

Fires server-side trigger events to Fuul when key conversions happen.
Uses the send:trigger_event API key (FUUL_TRIGGER_KEY) — this key must
NEVER be exposed to the frontend.

Current events:
  - activate_protection: fired when a user activates Aegis for the first time

All calls are best-effort: failure is logged but never propagates to the caller.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import httpx

log = logging.getLogger(__name__)

_FUUL_EVENTS_URL = "https://api.fuul.xyz/api/v1/events"


async def send_activation_event(
    wallet: str,
    deposited_usdc: str,
    referral_code: str | None = None,
) -> None:
    """
    Fire an activate_protection conversion event to Fuul.
    Best-effort — any exception is caught and logged, never re-raised.

    Args:
        wallet: The user's Solana wallet address (used as identifier)
        deposited_usdc: Premium amount paid (for Fuul value tracking)
        referral_code: Optional referral code stored from ?ref= URL param
    """
    from app.core.config import get_settings
    settings = get_settings()

    if not settings.fuul_trigger_key:
        log.debug("FUUL_TRIGGER_KEY not set — skipping Fuul event")
        return

    try:
        import httpx as _httpx

        payload: dict[str, Any] = {
            "name": "activate_protection",
            "user": {
                "identifier": wallet,
                "identifier_type": "solana_address",
            },
            "args": {
                "value": {
                    "amount": deposited_usdc,
                    "identifier": "usdc",
                    "identifier_type": "named_currency",
                },
            },
        }

        if referral_code:
            payload["referral_code"] = referral_code

        async with _httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                _FUUL_EVENTS_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {settings.fuul_trigger_key}",
                    "Content-Type": "application/json",
                },
            )

        if resp.status_code not in (200, 201, 202):
            log.warning(
                "Fuul event rejected: status=%d body=%s",
                resp.status_code,
                resp.text[:200],
            )
        else:
            log.info(
                "Fuul activation event sent: wallet=%s usdc=%s ref=%s",
                wallet, deposited_usdc, referral_code,
            )

    except Exception as exc:
        log.warning("Fuul event failed (non-fatal): %s", exc)
