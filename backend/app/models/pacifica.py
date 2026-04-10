"""
Pydantic models for every Pacifica API response Aegis consumes.
All decimal fields represented as str (matching Pacifica's wire format).
Conversion to Decimal happens only at computation boundaries.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


# ── Account ───────────────────────────────────────────────────────────────────

class AccountInfo(BaseModel):
    balance: str
    fee_level: int
    maker_fee: str
    taker_fee: str
    account_equity: str
    available_to_spend: str
    available_to_withdraw: str
    pending_balance: str
    total_margin_used: str
    cross_mmr: str          # Primary health metric — string decimal
    positions_count: int
    orders_count: int
    stop_orders_count: int
    updated_at: int          # milliseconds


class Position(BaseModel):
    symbol: str
    side: str                # "long" or "short"  (NOT "bid"/"ask")
    amount: str
    entry_price: str
    margin: str = "0"        # populated only for isolated positions
    funding: str = "0"
    isolated: bool
    created_at: int
    updated_at: int


# ── Orders ────────────────────────────────────────────────────────────────────

class OrderResponse(BaseModel):
    order_id: int


class CancelOrderResponse(BaseModel):
    order_id: int | None = None
    success: bool = True


# ── Market info ───────────────────────────────────────────────────────────────

class MarketInfo(BaseModel):
    symbol: str
    tick_size: str
    lot_size: str
    max_leverage: int
    isolated_only: bool
    min_order_size: str
    max_order_size: str
    funding_rate: str
    next_funding_rate: str


# ── Builder ───────────────────────────────────────────────────────────────────

class BuilderTrade(BaseModel):
    history_id: int
    order_id: int
    symbol: str
    amount: str
    price: str
    entry_price: str
    fee: str
    pnl: str
    side: str
    created_at: int


class BuilderApproval(BaseModel):
    builder_code: str
    description: str
    max_fee_rate: str
    updated_at: int


# ── Risk engine inputs ────────────────────────────────────────────────────────

class AccountSnapshot(BaseModel):
    """Aggregated snapshot passed to the risk engine each cycle."""
    wallet: str
    cross_mmr: str
    available_to_spend: str
    positions: list[Position]
    timestamp_ms: int = Field(default_factory=lambda: 0)
