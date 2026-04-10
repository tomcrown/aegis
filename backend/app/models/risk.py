"""
Domain models for the risk engine and hedge decisions.
Pure data — no I/O, no side effects.
"""
from __future__ import annotations

from decimal import Decimal
from enum import Enum

from pydantic import BaseModel


class RiskTier(str, Enum):
    SAFE = "safe"         # cross_mmr < 70%
    WATCH = "watch"       # 70% ≤ cross_mmr < 85%
    HEDGE = "hedge"       # cross_mmr ≥ 85%


class Sentiment(str, Enum):
    BEARISH = "bearish"   # score < 35
    NEUTRAL = "neutral"   # 35 ≤ score < 65
    BULLISH = "bullish"   # score ≥ 65


class SentimentData(BaseModel):
    symbol: str
    score: float          # 0–100 normalised
    sentiment: Sentiment
    raw_mentions: int = 0


class HedgeDecision(BaseModel):
    """Output of the risk engine for a single user+position pair."""
    wallet: str
    symbol: str
    hedge_side: str       # "short" to hedge a long, "long" to hedge a short
    hedge_amount: str     # string decimal, matches Pacifica wire format
    sentiment: Sentiment
    hedge_multiplier: Decimal
    cross_mmr: str
    risk_tier: RiskTier
    vault_funded: bool = False   # True if vault capital is being used


class RecoveryDecision(BaseModel):
    """Signals that an existing hedge should be closed."""
    wallet: str
    symbol: str
    order_id: int         # the hedge order to cancel


class RiskEngineOutput(BaseModel):
    """Full output from one risk engine evaluation cycle."""
    wallet: str
    risk_tier: RiskTier
    cross_mmr: str
    hedges_to_open: list[HedgeDecision] = []
    hedges_to_close: list[RecoveryDecision] = []
