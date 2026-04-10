"""Vault ledger models — Redis-backed, no on-chain Solana program."""
from __future__ import annotations

from pydantic import BaseModel


class VaultShare(BaseModel):
    wallet: str
    deposited_usdc: str      # string decimal
    share_fraction: str      # deposited / total_tvl at time of deposit
    yield_earned: str = "0"
    active_hedges: int = 0
    joined_at_ms: int = 0


class VaultState(BaseModel):
    total_tvl: str           # sum of all deposited_usdc
    active_protections: int
    total_yield_distributed: str
    user_count: int
