"""
Pydantic models for every Pacifica API response Aegis consumes.
All decimal fields represented as str (matching Pacifica's wire format).
Conversion to Decimal happens only at computation boundaries.
"""
from __future__ import annotations

from pydantic import BaseModel, Field
from pydantic import ConfigDict


# ── Account ───────────────────────────────────────────────────────────────────

class AccountInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")   # ignore unknown Pacifica fields

    balance: str
    fee_level: int
    maker_fee: str
    taker_fee: str
    account_equity: str
    available_to_spend: str
    available_to_withdraw: str
    pending_balance: str
    total_margin_used: str
    cross_mmr: str          # Already a percentage value e.g. "84.32"
    positions_count: int
    orders_count: int
    stop_orders_count: int
    updated_at: int          # milliseconds


class Position(BaseModel):
    model_config = ConfigDict(extra="ignore")

    symbol: str
    side: str                # normalised to "long"/"short" from Pacifica's "bid"/"ask"
    amount: str
    entry_price: str
    margin: str = "0"
    funding: str = "0"
    isolated: bool
    liquidation_price: str = "0"
    created_at: int
    updated_at: int

    @classmethod
    def model_validate(cls, obj, **kwargs):  # type: ignore[override]
        if isinstance(obj, dict) and obj.get("side") in ("bid", "ask"):
            obj = {**obj, "side": "long" if obj["side"] == "bid" else "short"}
        return super().model_validate(obj, **kwargs)


# ── Orders ────────────────────────────────────────────────────────────────────

class OrderResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    order_id: int


class CancelOrderResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
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
    model_config = ConfigDict(extra="ignore")  # ignore any extra fields

    history_id: int
    address: str
    symbol: str
    amount: str
    price: str
    builder_fee: str
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
