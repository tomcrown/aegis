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
_HEDGE_THRESHOLD = Decimal("85")    # cross_mmr % ≥ this → execute hedge
_WATCH_THRESHOLD = Decimal("70")    # cross_mmr % ≥ this → watch tier
_RECOVER_THRESHOLD = Decimal("65")  # cross_mmr % < this → close hedges

# ── Hedge multipliers by sentiment ────────────────────────────────────────────
_MULTIPLIERS: dict[Sentiment, Decimal] = {
    Sentiment.BEARISH: Decimal("0.75"),
    Sentiment.NEUTRAL: Decimal("0.50"),
    Sentiment.BULLISH: Decimal("0.25"),
}

# ── Minimum hedge size (avoid dust orders) ────────────────────────────────────
_MIN_HEDGE_AMOUNT = Decimal("0.001")


def _cross_mmr_pct(account: AccountSnapshot) -> Decimal:
    """Convert cross_mmr string (e.g. '0.8432') to percentage (84.32)."""
    return to_dec(account.cross_mmr) * Decimal("100")


def _classify_tier(mmr_pct: Decimal) -> RiskTier:
    if mmr_pct >= _HEDGE_THRESHOLD:
        return RiskTier.HEDGE
    if mmr_pct >= _WATCH_THRESHOLD:
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
    Rounded down to 8 decimal places to avoid over-hedging.
    """
    return (to_dec(position_amount) * multiplier).quantize(
        Decimal("0.00000001"), rounding=ROUND_DOWN
    )


def evaluate(
    account: AccountSnapshot,
    sentiment_map: dict[str, SentimentData],
    active_hedge_order_ids: dict[str, int],  # symbol → order_id of existing hedge
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
    tier = _classify_tier(mmr_pct)

    output = RiskEngineOutput(
        wallet=account.wallet,
        risk_tier=tier,
        cross_mmr=account.cross_mmr,
    )

    log.debug(
        "Risk eval wallet=%s cross_mmr=%.2f%% tier=%s positions=%d",
        account.wallet, mmr_pct, tier.value, len(account.positions),
    )

    # ── Recovery: close existing hedges if account is healthy ─────────────────
    if mmr_pct < _RECOVER_THRESHOLD:
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
