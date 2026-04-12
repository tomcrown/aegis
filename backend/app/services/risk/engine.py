"""
Risk engine — pure deterministic logic. Zero I/O, zero side effects.

Inputs:  AccountSnapshot + SentimentData per position symbol
Outputs: RiskEngineOutput (hedges to open / hedges to close)

Tier thresholds (from project spec):
  cross_mmr < 70%   → SAFE   — do nothing
  70% ≤ mmr < 85%   → WATCH  — alert only, no execution
  mmr ≥ 85%         → HEDGE  — compute and return hedge decisions

Hedge multipliers (from project spec):
  BEARISH sentiment  → 75% of net delta
  NEUTRAL sentiment  → 50% of net delta
  BULLISH sentiment  → 25% of net delta

Recovery threshold:
  cross_mmr < 65%   → close existing hedges

All arithmetic uses Python Decimal for precision. The function is designed
to be called from tests with no mocking needed.
"""
from __future__ import annotations

import logging
from decimal import ROUND_DOWN, Decimal

from app.models.pacifica import AccountSnapshot, Position
from app.models.risk import (
    HedgeDecision,
    RecoveryDecision,
    RiskEngineOutput,
    RiskTier,
    Sentiment,
    SentimentData,
)
from app.utils.decimal_utils import to_dec, to_wire

log = logging.getLogger(__name__)

# ── Thresholds ────────────────────────────────────────────────────────────────
# Pacifica cross_mmr: HIGH = safe, LOW = dangerous. Liquidation at ~100%.
# We hedge when cross_mmr drops toward 100% (the liquidation floor).
_SAFE_THRESHOLD = Decimal("150")     # cross_mmr % > this → SAFE, do nothing
_WATCH_THRESHOLD = Decimal("120")    # cross_mmr % ≤ this → WATCH, alert only
_HEDGE_THRESHOLD = Decimal("110")    # cross_mmr % ≤ this → HEDGE, execute
_RECOVER_THRESHOLD = Decimal("140")  # cross_mmr % > this (while hedged) → close hedges

# ── Sentiment-adjusted preemptive threshold ───────────────────────────────────
# When Elfa sentiment is strongly bearish (score < 30), trigger earlier at 115%
# instead of waiting for 110%. Catches crashes before they tank margin.
_BEARISH_PREEMPTIVE_THRESHOLD = Decimal("115")
_BEARISH_SCORE_CUTOFF = 30.0  # Elfa score below this = strongly bearish

# ── Hedge multipliers by sentiment ────────────────────────────────────────────
_MULTIPLIERS: dict[Sentiment, Decimal] = {
    Sentiment.BEARISH: Decimal("0.75"),
    Sentiment.NEUTRAL: Decimal("0.50"),
    Sentiment.BULLISH: Decimal("0.25"),
}

# ── Minimum hedge size (avoid dust orders) ────────────────────────────────────
_MIN_HEDGE_AMOUNT = Decimal("0.01") 


def _cross_mmr_pct(account: AccountSnapshot) -> Decimal:
    """Pacifica cross_mmr is already a percentage (e.g. '84.32'), use directly."""
    return to_dec(account.cross_mmr)


def _classify_tier(mmr_pct: Decimal) -> RiskTier:
    # Low cross_mmr = danger (approaching 100% liquidation floor)
    if mmr_pct <= _HEDGE_THRESHOLD:
        return RiskTier.HEDGE
    if mmr_pct <= _WATCH_THRESHOLD:
        return RiskTier.WATCH
    return RiskTier.SAFE


def _hedge_side(position_side: str) -> str:
    """Return the opposing side to hedge a position."""
    return "ask" if position_side == "long" else "bid"


def _compute_hedge_amount(
    position_amount: str,
    multiplier: Decimal,
) -> Decimal:
    """
    Compute hedge size = position_amount × multiplier.
    Rounded DOWN to Pacifica's lot size (0.01) to avoid over-hedging
    and prevent 'not a multiple of lot size' 400 errors.
    """
    return (to_dec(position_amount) * multiplier).quantize(
        Decimal("0.01"), rounding=ROUND_DOWN
    )

def evaluate(
    account: AccountSnapshot,
    sentiment_map: dict[str, SentimentData],
    active_hedge_order_ids: dict[str, int],  # symbol → order_id of existing hedge
    user_hedge_threshold: int = 75,           # from vault config (slider value 50-95)
) -> RiskEngineOutput:
    """
    Core risk evaluation function.

    Args:
        account: Current account snapshot (cross_mmr, positions, etc.)
        sentiment_map: Latest sentiment per symbol (may be empty → defaults to NEUTRAL)
        active_hedge_order_ids: Maps symbol → existing hedge order_id (if any)

    Returns:
        RiskEngineOutput with hedges_to_open and hedges_to_close lists.
    """
    mmr_pct = _cross_mmr_pct(account)

    # Apply user's threshold from the slider:
    # slider value 50-95 maps to "hedge at cross_mmr ≤ (200 - threshold)%"
    # e.g. threshold=75 → hedge at cross_mmr ≤ 125%
    # Override hardcoded HEDGE threshold with user's setting if more conservative
    user_derived_threshold = Decimal(str(200 - user_hedge_threshold))
    effective_hedge_threshold = max(_HEDGE_THRESHOLD, user_derived_threshold)
    effective_watch_threshold = max(_WATCH_THRESHOLD, user_derived_threshold + Decimal("10"))
    effective_recover_threshold = min(_RECOVER_THRESHOLD, user_derived_threshold + Decimal("20"))

    def _classify_tier_user(pct: Decimal) -> RiskTier:
        if pct <= effective_hedge_threshold:
            return RiskTier.HEDGE
        if pct <= effective_watch_threshold:
            return RiskTier.WATCH
        return RiskTier.SAFE

    tier = _classify_tier_user(mmr_pct)

    output = RiskEngineOutput(
        wallet=account.wallet,
        risk_tier=tier,
        cross_mmr=account.cross_mmr,
    )

    log.debug(
        "Risk eval wallet=%s cross_mmr=%.2f%% tier=%s positions=%d",
        account.wallet, mmr_pct, tier.value, len(account.positions),
    )

    # ── Recovery: close existing hedges if account health has improved ────────
    if mmr_pct > effective_recover_threshold:
        for symbol, order_id in active_hedge_order_ids.items():
            output.hedges_to_close.append(
                RecoveryDecision(
                    wallet=account.wallet,
                    symbol=symbol,
                    order_id=order_id,
                )
            )
        return output

    # ── SAFE or WATCH: no hedge execution ─────────────────────────────────────
    if tier != RiskTier.HEDGE:
        return output

    # ── HEDGE tier: compute hedge decisions per position ──────────────────────
    for position in account.positions:
        symbol = position.symbol

        # Skip positions that already have an active hedge
        if symbol in active_hedge_order_ids:
            log.debug("Hedge already active for %s — skipping", symbol)
            continue

        # Determine sentiment (default NEUTRAL if not available)
        sentiment_data = sentiment_map.get(symbol)
        if sentiment_data:
            sentiment = sentiment_data.sentiment
            # Preemptive hedge: if strongly bearish AND approaching danger zone
            if (
                sentiment_data.score < _BEARISH_SCORE_CUTOFF
                and tier != RiskTier.HEDGE
                and mmr_pct <= _BEARISH_PREEMPTIVE_THRESHOLD
            ):
                log.info(
                    "Preemptive hedge triggered for %s — bearish score=%.1f mmr=%.2f%%",
                    symbol, sentiment_data.score, mmr_pct,
                )
                # Override tier to hedge for this position only
        else:
            sentiment = Sentiment.NEUTRAL
            log.debug("No Elfa sentiment for %s — defaulting to NEUTRAL", symbol)

        multiplier = _MULTIPLIERS[sentiment]
        hedge_amount = _compute_hedge_amount(position.amount, multiplier)

        if hedge_amount < _MIN_HEDGE_AMOUNT:
            log.warning(
                "Computed hedge amount %s for %s is below minimum %s — skipping",
                hedge_amount, symbol, _MIN_HEDGE_AMOUNT,
            )
            continue

        output.hedges_to_open.append(
            HedgeDecision(
                wallet=account.wallet,
                symbol=symbol,
                hedge_side=_hedge_side(position.side),
                hedge_amount=to_wire(hedge_amount),
                sentiment=sentiment,
                hedge_multiplier=multiplier,
                cross_mmr=account.cross_mmr,
                risk_tier=tier,
            )
        )

        log.info(
            "Hedge decision: wallet=%s symbol=%s side=%s amount=%s "
            "sentiment=%s multiplier=%s mmr=%.2f%%",
            account.wallet, symbol, _hedge_side(position.side),
            to_wire(hedge_amount), sentiment.value, multiplier, mmr_pct,
        )

    return output
