"""
Vault Manager — Redis-backed ledger for the Aegis protection pool.

Redis key schema:
  aegis:vault:tvl                     → string decimal (total USDC deposited)
  aegis:vault:shares:{wallet}         → JSON VaultShare
  aegis:vault:hedges:{wallet}:{sym}   → order_id string (active vault-funded hedge)
  aegis:users:active                  → SET of wallet addresses with Aegis active
  aegis:users:config:{wallet}         → JSON user config (threshold, etc.)

All vault arithmetic uses Decimal. Redis stores string decimals only.
No on-chain Solana program — Redis ledger is the source of truth for the vault.
On-chain verification is via the Builder Code trade history on Pacifica.
"""
from __future__ import annotations

import json
import logging
import time
from decimal import ROUND_DOWN, Decimal

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import redis.asyncio as aioredis

from app.models.pacifica import Position
from app.models.vault import VaultShare, VaultState
from app.utils.decimal_utils import to_dec, to_wire

log = logging.getLogger(__name__)

# ── Redis key helpers ─────────────────────────────────────────────────────────
_TVL_KEY = "aegis:vault:tvl"
_SHARE_KEY = "aegis:vault:shares:{wallet}"
_HEDGE_KEY = "aegis:vault:hedges:{wallet}:{symbol}"
_USERS_ACTIVE_KEY = "aegis:users:active"
_USER_CONFIG_KEY = "aegis:users:config:{wallet}"

_PREMIUM_BPS = Decimal("10")  # 10 bps = 0.10% — matches VAULT_PREMIUM_BPS in config


class VaultManager:
    def __init__(self, redis: "aioredis.Redis") -> None:
        self._redis = redis

    # ── User activation ───────────────────────────────────────────────────────

    async def activate_user(
        self,
        wallet: str,
        positions: list[Position],
        threshold: int = 75,
    ) -> VaultShare:
        """
        Register a user with Aegis.
        Calculates their 0.1% protection premium from total position notional.
        Records their vault share in Redis.
        Returns the VaultShare for confirmation.
        """
        # Calculate total USD notional across all non-isolated positions
        # amount is in token units, entry_price is USD — multiply for USD notional
        notional = sum(
            to_dec(p.amount) * to_dec(p.entry_price)
            for p in positions
            if not p.isolated
        )
        premium = (notional * _PREMIUM_BPS / Decimal("10000")).quantize(
            Decimal("0.000001"), rounding=ROUND_DOWN
        )

        # Record user config
        config = {"threshold": threshold, "activated_at": int(time.time() * 1000)}
        await self._redis.set(
            _USER_CONFIG_KEY.format(wallet=wallet), json.dumps(config)
        )

        # Update TVL
        current_tvl = to_dec(await self._redis.get(_TVL_KEY) or "0")
        new_tvl = current_tvl + premium
        await self._redis.set(_TVL_KEY, to_wire(new_tvl))

        # Record share
        share = VaultShare(
            wallet=wallet,
            deposited_usdc=to_wire(premium),
            share_fraction=to_wire(
                premium / new_tvl if new_tvl > Decimal("0") else Decimal("0")
            ),
            yield_earned="0",
            active_hedges=0,
            joined_at_ms=int(time.time() * 1000),
        )
        await self._redis.set(
            _SHARE_KEY.format(wallet=wallet), share.model_dump_json()
        )

        # Add to active user set
        await self._redis.sadd(_USERS_ACTIVE_KEY, wallet)

        log.info(
            "Vault: user activated wallet=%s premium=%s new_tvl=%s",
            wallet, to_wire(premium), to_wire(new_tvl),
        )
        return share

    async def deactivate_user(self, wallet: str) -> None:
        await self._redis.srem(_USERS_ACTIVE_KEY, wallet)
        log.info("Vault: user deactivated wallet=%s", wallet)

    async def is_user_active(self, wallet: str) -> bool:
        return bool(await self._redis.sismember(_USERS_ACTIVE_KEY, wallet))

    async def get_active_users(self) -> set[str]:
        return await self._redis.smembers(_USERS_ACTIVE_KEY)

    async def get_user_threshold(self, wallet: str) -> int:
        """Return user's configured hedge threshold (default 75%)."""
        raw = await self._redis.get(_USER_CONFIG_KEY.format(wallet=wallet))
        if raw:
            return json.loads(raw).get("threshold", 75)
        return 75

    # ── Share queries ─────────────────────────────────────────────────────────

    async def get_user_share(self, wallet: str) -> VaultShare | None:
        raw = await self._redis.get(_SHARE_KEY.format(wallet=wallet))
        if not raw:
            return None
        return VaultShare.model_validate_json(raw)

    async def get_vault_state(self) -> VaultState:
        tvl = await self._redis.get(_TVL_KEY) or "0"
        active_count = await self._redis.scard(_USERS_ACTIVE_KEY)

        # Count active hedges by scanning hedge keys
        hedge_keys = await self._redis.keys("aegis:vault:hedges:*")
        active_protections = len(hedge_keys)

        return VaultState(
            total_tvl=tvl,
            active_protections=active_protections,
            total_yield_distributed="0",   # TODO: implement yield tracking
            user_count=active_count,
        )

    # ── Hedge tracking ────────────────────────────────────────────────────────

    async def record_hedge(
        self, wallet: str, symbol: str, order_id: int
    ) -> None:
        """Record an active hedge order in Redis."""
        key = _HEDGE_KEY.format(wallet=wallet, symbol=symbol)
        await self._redis.set(key, str(order_id))

        # Increment active hedges on user share
        raw = await self._redis.get(_SHARE_KEY.format(wallet=wallet))
        if raw:
            share = VaultShare.model_validate_json(raw)
            share.active_hedges += 1
            await self._redis.set(_SHARE_KEY.format(wallet=wallet), share.model_dump_json())

        log.info("Vault: hedge recorded wallet=%s symbol=%s order_id=%d", wallet, symbol, order_id)

    async def get_active_hedges(self, wallet: str) -> dict[str, int]:
        """Return {symbol: order_id} for all active hedges for this wallet."""
        pattern = _HEDGE_KEY.format(wallet=wallet, symbol="*")
        keys = await self._redis.keys(pattern)
        result: dict[str, int] = {}
        for key in keys:
            # key format: aegis:vault:hedges:{wallet}:{symbol}
            symbol = key.split(":")[-1]
            order_id_str = await self._redis.get(key)
            if order_id_str:
                result[symbol] = int(order_id_str)
        return result

    async def clear_hedge(self, wallet: str, symbol: str) -> None:
        """Remove a closed hedge from Redis."""
        key = _HEDGE_KEY.format(wallet=wallet, symbol=symbol)
        await self._redis.delete(key)

        # Decrement active hedges on user share
        raw = await self._redis.get(_SHARE_KEY.format(wallet=wallet))
        if raw:
            share = VaultShare.model_validate_json(raw)
            share.active_hedges = max(0, share.active_hedges - 1)
            await self._redis.set(_SHARE_KEY.format(wallet=wallet), share.model_dump_json())

        log.info("Vault: hedge cleared wallet=%s symbol=%s", wallet, symbol)

    # ── Yield crediting (placeholder — full implementation post-hackathon) ─────

    async def credit_yield(self, wallet: str, yield_usdc: str) -> None:
        """
        Credit funding-rate yield to a user's vault share.
        Called by the orchestrator after reading Pacifica funding settlements.
        """
        raw = await self._redis.get(_SHARE_KEY.format(wallet=wallet))
        if not raw:
            return
        share = VaultShare.model_validate_json(raw)
        new_yield = to_dec(share.yield_earned) + to_dec(yield_usdc)
        share.yield_earned = to_wire(new_yield)
        await self._redis.set(_SHARE_KEY.format(wallet=wallet), share.model_dump_json())
        log.info("Vault: yield credited wallet=%s amount=%s total=%s", wallet, yield_usdc, share.yield_earned)
