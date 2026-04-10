"""
Risk engine edge cases and failure scenarios not covered in test_risk_engine.py.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from app.models.pacifica import AccountSnapshot, Position
from app.models.risk import RiskTier, Sentiment, SentimentData
from app.services.risk.engine import evaluate


def _snapshot(cross_mmr: str, positions=None) -> AccountSnapshot:
    return AccountSnapshot(
        wallet="w",
        cross_mmr=cross_mmr,
        available_to_spend="1000",
        positions=positions or [],
        timestamp_ms=0,
    )


def _pos(symbol="SOL", side="long", amount="1.0", isolated=False) -> Position:
    return Position(
        symbol=symbol, side=side, amount=amount,
        entry_price="100", margin="0", funding="0",
        isolated=isolated, created_at=0, updated_at=0,
    )


def _sent(symbol, sentiment, score=50.0) -> SentimentData:
    return SentimentData(symbol=symbol, score=score, sentiment=sentiment)


# ── Boundary conditions ────────────────────────────────────────────────────────

class TestBoundaryConditions:
    def test_exactly_at_recovery_boundary(self):
        """cross_mmr = 0.65 (65%) — exactly at recovery threshold → SAFE, no close."""
        out = evaluate(_snapshot("0.65"), {}, {"SOL": 1})
        assert out.risk_tier == RiskTier.SAFE
        assert not out.hedges_to_close

    def test_just_below_recovery_threshold(self):
        """cross_mmr = 0.6499 < 65% — should close."""
        out = evaluate(_snapshot("0.6499"), {}, {"SOL": 1})
        assert len(out.hedges_to_close) == 1

    def test_exactly_at_watch_boundary(self):
        """cross_mmr = 0.70 exactly — WATCH tier, no hedge."""
        out = evaluate(_snapshot("0.70"), {}, {})
        assert out.risk_tier == RiskTier.WATCH

    def test_exactly_at_hedge_boundary(self):
        """cross_mmr = 0.85 exactly — HEDGE tier, should open hedge."""
        out = evaluate(_snapshot("0.85"), {}, {}, )
        assert out.risk_tier == RiskTier.HEDGE

    def test_just_below_hedge_threshold_no_execution(self):
        """cross_mmr = 0.8499 — WATCH, no hedge opened."""
        out = evaluate(_snapshot("0.8499"), {}, {})
        assert out.risk_tier == RiskTier.WATCH
        assert not out.hedges_to_open


# ── Wallet and position variety ────────────────────────────────────────────────

class TestPositionVariety:
    def test_isolated_position_still_hedged(self):
        """Isolated positions should still be hedged on risk breach."""
        pos = _pos(isolated=True)
        out = evaluate(_snapshot("0.90", positions=[pos]), {}, {})
        assert len(out.hedges_to_open) == 1

    def test_short_position_hedged_with_long(self):
        out = evaluate(_snapshot("0.90", positions=[_pos(side="short")]), {}, {})
        assert out.hedges_to_open[0].hedge_side == "bid"

    def test_zero_amount_position_skipped(self):
        """Position with amount='0' computes hedge=0 → below minimum → skipped."""
        out = evaluate(_snapshot("0.90", positions=[_pos(amount="0")]), {}, {})
        assert not out.hedges_to_open

    def test_many_positions_all_hedged(self):
        positions = [_pos(f"SYM{i}", amount="1.0") for i in range(5)]
        out = evaluate(_snapshot("0.95", positions=positions), {}, {})
        assert len(out.hedges_to_open) == 5

    def test_mix_of_active_and_new_hedges(self):
        """SOL already hedged, BTC not — only BTC gets a new hedge decision."""
        positions = [_pos("SOL"), _pos("BTC")]
        out = evaluate(_snapshot("0.90", positions=positions), {}, active_hedge_order_ids={"SOL": 1})
        symbols_to_open = {h.symbol for h in out.hedges_to_open}
        assert symbols_to_open == {"BTC"}


# ── Sentiment multiplier precision ────────────────────────────────────────────

class TestSentimentPrecision:
    def test_bearish_large_position(self):
        """1.0 SOL × 0.75 = 0.75 exactly."""
        out = evaluate(
            _snapshot("0.90", positions=[_pos(amount="1.0")]),
            {"SOL": _sent("SOL", Sentiment.BEARISH)},
            {},
        )
        assert Decimal(out.hedges_to_open[0].hedge_amount) == Decimal("0.75")

    def test_neutral_precise(self):
        """0.3 SOL × 0.5 = 0.15."""
        out = evaluate(
            _snapshot("0.90", positions=[_pos(amount="0.3")]),
            {"SOL": _sent("SOL", Sentiment.NEUTRAL)},
            {},
        )
        assert Decimal(out.hedges_to_open[0].hedge_amount) == Decimal("0.15")

    def test_bullish_rounds_down(self):
        """0.1 SOL × 0.25 = 0.025 — no truncation needed, exact."""
        out = evaluate(
            _snapshot("0.90", positions=[_pos(amount="0.1")]),
            {"SOL": _sent("SOL", Sentiment.BULLISH)},
            {},
        )
        assert Decimal(out.hedges_to_open[0].hedge_amount) == Decimal("0.025")

    def test_irrational_amount_truncated_not_rounded(self):
        """1/3 SOL × 0.75 → should truncate, not round up."""
        from decimal import Decimal as D
        # 1/3 ≈ 0.33333333... × 0.75 = 0.25
        out = evaluate(
            _snapshot("0.90", positions=[_pos(amount="0.33333333")]),
            {"SOL": _sent("SOL", Sentiment.BEARISH)},
            {},
        )
        amount = Decimal(out.hedges_to_open[0].hedge_amount)
        # 0.33333333 × 0.75 = 0.24999999... → truncated to 0.24999999
        assert amount <= Decimal("0.25")
        assert amount > Decimal("0.24")


# ── Recovery with multiple hedges ─────────────────────────────────────────────

class TestMultiHedgeRecovery:
    def test_recover_closes_all_active_hedges(self):
        active = {"SOL": 1001, "BTC": 1002, "ETH": 1003}
        out = evaluate(_snapshot("0.50"), {}, active)
        closed_symbols = {r.symbol for r in out.hedges_to_close}
        assert closed_symbols == {"SOL", "BTC", "ETH"}

    def test_recovery_and_new_hedge_not_simultaneous(self):
        """When cross_mmr < 65%, ONLY close — never open new hedges."""
        positions = [_pos("SOL"), _pos("BTC")]
        out = evaluate(_snapshot("0.50", positions=positions), {}, {"SOL": 1})
        assert not out.hedges_to_open
        assert len(out.hedges_to_close) == 1


# ── Output metadata ────────────────────────────────────────────────────────────

class TestOutputMetadata:
    def test_output_wallet_matches_input(self):
        snap = AccountSnapshot(
            wallet="specific_wallet_addr",
            cross_mmr="0.50", available_to_spend="1000",
            positions=[], timestamp_ms=0,
        )
        out = evaluate(snap, {}, {})
        assert out.wallet == "specific_wallet_addr"

    def test_output_cross_mmr_preserved_as_string(self):
        out = evaluate(_snapshot("0.8432"), {}, {})
        assert out.cross_mmr == "0.8432"

    def test_hedge_decision_contains_correct_metadata(self):
        out = evaluate(
            _snapshot("0.90", positions=[_pos(amount="0.5")]),
            {"SOL": _sent("SOL", Sentiment.BEARISH, score=15.0)},
            {},
        )
        hedge = out.hedges_to_open[0]
        assert hedge.wallet == "w"
        assert hedge.risk_tier == RiskTier.HEDGE
        assert hedge.cross_mmr == "0.90"
        assert hedge.vault_funded is False  # not vault-funded by default
