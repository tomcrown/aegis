"""
Unit tests for the risk engine.
Zero I/O — all inputs are pure Python objects.
Tests cover all tier transitions, hedge multipliers, recovery, and edge cases.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from app.models.pacifica import AccountSnapshot, Position
from app.models.risk import RiskTier, Sentiment, SentimentData
from app.services.risk.engine import evaluate


def _make_snapshot(
    cross_mmr: str,
    wallet: str = "wallet123",
    positions: list[Position] | None = None,
) -> AccountSnapshot:
    return AccountSnapshot(
        wallet=wallet,
        cross_mmr=cross_mmr,
        available_to_spend="1000.0",
        positions=positions or [],
        timestamp_ms=0,
    )


def _make_position(symbol: str = "SOL", side: str = "long", amount: str = "1.0") -> Position:
    return Position(
        symbol=symbol,
        side=side,
        amount=amount,
        entry_price="100.0",
        margin="0",
        funding="0",
        isolated=False,
        created_at=0,
        updated_at=0,
    )


def _make_sentiment(symbol: str, sentiment: Sentiment, score: float) -> SentimentData:
    return SentimentData(symbol=symbol, score=score, sentiment=sentiment)


# ── Tier classification ────────────────────────────────────────────────────────

class TestTierClassification:
    def test_safe_below_70(self):
        out = evaluate(_make_snapshot("0.69"), {}, {})
        assert out.risk_tier == RiskTier.SAFE
        assert not out.hedges_to_open
        assert not out.hedges_to_close

    def test_watch_at_70(self):
        out = evaluate(_make_snapshot("0.70"), {}, {})
        assert out.risk_tier == RiskTier.WATCH

    def test_watch_below_85(self):
        out = evaluate(_make_snapshot("0.8499"), {}, {})
        assert out.risk_tier == RiskTier.WATCH

    def test_hedge_at_85(self):
        account = _make_snapshot("0.85", positions=[_make_position()])
        out = evaluate(account, {}, {})
        assert out.risk_tier == RiskTier.HEDGE

    def test_hedge_above_85(self):
        account = _make_snapshot("0.99", positions=[_make_position()])
        out = evaluate(account, {}, {})
        assert out.risk_tier == RiskTier.HEDGE


# ── Hedge decisions ────────────────────────────────────────────────────────────

class TestHedgeDecisions:
    def test_no_hedge_when_safe(self):
        account = _make_snapshot("0.50", positions=[_make_position()])
        out = evaluate(account, {}, {})
        assert not out.hedges_to_open

    def test_hedge_long_with_short(self):
        """A long position should be hedged with a short (ask side)."""
        account = _make_snapshot("0.90", positions=[_make_position(side="long")])
        out = evaluate(account, {}, {})
        assert len(out.hedges_to_open) == 1
        assert out.hedges_to_open[0].hedge_side == "ask"

    def test_hedge_short_with_long(self):
        """A short position should be hedged with a long (bid side)."""
        account = _make_snapshot("0.90", positions=[_make_position(side="short")])
        out = evaluate(account, {}, {})
        assert len(out.hedges_to_open) == 1
        assert out.hedges_to_open[0].hedge_side == "bid"

    def test_hedge_multiplier_bearish(self):
        """Bearish sentiment → 75% hedge size."""
        account = _make_snapshot("0.90", positions=[_make_position(amount="1.0")])
        sentiment = {
            "SOL": _make_sentiment("SOL", Sentiment.BEARISH, score=20.0)
        }
        out = evaluate(account, sentiment, {})
        assert len(out.hedges_to_open) == 1
        hedge = out.hedges_to_open[0]
        assert Decimal(hedge.hedge_amount) == Decimal("0.75")
        assert hedge.hedge_multiplier == Decimal("0.75")
        assert hedge.sentiment == Sentiment.BEARISH

    def test_hedge_multiplier_neutral(self):
        """Neutral sentiment → 50% hedge size."""
        account = _make_snapshot("0.90", positions=[_make_position(amount="1.0")])
        sentiment = {
            "SOL": _make_sentiment("SOL", Sentiment.NEUTRAL, score=50.0)
        }
        out = evaluate(account, sentiment, {})
        hedge = out.hedges_to_open[0]
        assert Decimal(hedge.hedge_amount) == Decimal("0.5")
        assert hedge.hedge_multiplier == Decimal("0.50")

    def test_hedge_multiplier_bullish(self):
        """Bullish sentiment → 25% hedge size."""
        account = _make_snapshot("0.90", positions=[_make_position(amount="1.0")])
        sentiment = {
            "SOL": _make_sentiment("SOL", Sentiment.BULLISH, score=80.0)
        }
        out = evaluate(account, sentiment, {})
        hedge = out.hedges_to_open[0]
        assert Decimal(hedge.hedge_amount) == Decimal("0.25")

    def test_no_sentiment_defaults_to_neutral(self):
        """Missing Elfa data → NEUTRAL multiplier (0.5)."""
        account = _make_snapshot("0.90", positions=[_make_position(amount="0.2")])
        out = evaluate(account, {}, {})
        hedge = out.hedges_to_open[0]
        assert Decimal(hedge.hedge_amount) == Decimal("0.1")
        assert hedge.sentiment == Sentiment.NEUTRAL

    def test_no_duplicate_hedge_if_already_active(self):
        """Skip positions that already have an active hedge."""
        account = _make_snapshot("0.90", positions=[_make_position(symbol="SOL")])
        out = evaluate(account, {}, {"SOL": 99999})
        assert not out.hedges_to_open

    def test_multiple_positions(self):
        """Multiple positions → multiple hedge decisions."""
        positions = [
            _make_position(symbol="SOL", amount="1.0"),
            _make_position(symbol="BTC", amount="0.01"),
        ]
        account = _make_snapshot("0.90", positions=positions)
        out = evaluate(account, {}, {})
        assert len(out.hedges_to_open) == 2
        symbols = {h.symbol for h in out.hedges_to_open}
        assert symbols == {"SOL", "BTC"}

    def test_skip_below_minimum_hedge_amount(self):
        """Extremely small positions produce amounts below _MIN_HEDGE_AMOUNT → skipped."""
        account = _make_snapshot("0.90", positions=[_make_position(amount="0.00000001")])
        out = evaluate(account, {}, {})
        # 0.00000001 * 0.5 = 0.000000005 < 0.001 minimum
        assert not out.hedges_to_open


# ── Recovery decisions ─────────────────────────────────────────────────────────

class TestRecoveryDecisions:
    def test_close_hedge_on_recovery(self):
        """cross_mmr < 65% → close existing hedges."""
        account = _make_snapshot("0.60", positions=[_make_position()])
        active_hedges = {"SOL": 42001}
        out = evaluate(account, {}, active_hedges)
        assert len(out.hedges_to_close) == 1
        assert out.hedges_to_close[0].order_id == 42001
        assert out.hedges_to_close[0].symbol == "SOL"

    def test_no_close_if_no_active_hedges(self):
        account = _make_snapshot("0.60")
        out = evaluate(account, {}, {})
        assert not out.hedges_to_close

    def test_close_all_hedges_on_recovery(self):
        account = _make_snapshot("0.55")
        active_hedges = {"SOL": 100, "BTC": 200}
        out = evaluate(account, {}, active_hedges)
        assert len(out.hedges_to_close) == 2

    def test_no_close_in_hedge_tier(self):
        """Active hedges are NOT closed when still in HEDGE tier."""
        account = _make_snapshot("0.90", positions=[_make_position()])
        active_hedges = {"SOL": 100}
        out = evaluate(account, {}, active_hedges)
        assert not out.hedges_to_close
        # But also no new hedge (already active)
        assert not out.hedges_to_open

    def test_no_close_in_watch_tier(self):
        """Recovery only happens below 65%, not in WATCH tier."""
        account = _make_snapshot("0.72")
        active_hedges = {"SOL": 100}
        out = evaluate(account, {}, active_hedges)
        assert not out.hedges_to_close


# ── Project spec example ───────────────────────────────────────────────────────

class TestProjectSpecExample:
    def test_demo_scenario(self):
        """
        From project spec:
        User has 0.1 SOL long, sentiment is bearish → open 0.075 SOL short.
        """
        account = _make_snapshot(
            "0.88",
            positions=[_make_position(symbol="SOL", side="long", amount="0.1")],
        )
        sentiment = {
            "SOL": _make_sentiment("SOL", Sentiment.BEARISH, score=20.0)
        }
        out = evaluate(account, sentiment, {})
        assert out.risk_tier == RiskTier.HEDGE
        assert len(out.hedges_to_open) == 1
        hedge = out.hedges_to_open[0]
        assert hedge.symbol == "SOL"
        assert hedge.hedge_side == "ask"   # short hedge for a long position
        assert Decimal(hedge.hedge_amount) == Decimal("0.075")
