"""
Integration tests for the full risk → execution cycle.

All external I/O (Pacifica API, Redis) is mocked.
The risk engine and execution engine run with real logic.
VaultManager is imported lazily to avoid requiring redis at collection time.
"""
from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest

from app.models.pacifica import AccountSnapshot
from app.models.risk import (
    HedgeDecision,
    RecoveryDecision,
    RiskTier,
    Sentiment,
    SentimentData,
)
from app.services.risk import engine as risk_engine

from tests.integration.conftest import (
    MOCK_ACCOUNT_HEDGE,
    MOCK_ACCOUNT_RECOVERING,
    MOCK_ACCOUNT_SAFE,
    MOCK_POSITION_SOL_LONG,
    MOCK_SENTIMENT_BEARISH,
    MOCK_SENTIMENT_NEUTRAL,
)


# ── Risk engine integration (no external deps) ────────────────────────────────

class TestRiskCycleIntegration:
    """Risk engine with realistic mock account snapshots."""

    def test_safe_account_no_action(self):
        snapshot = AccountSnapshot(
            wallet="wallet_safe",
            cross_mmr=MOCK_ACCOUNT_SAFE.cross_mmr,
            available_to_spend=MOCK_ACCOUNT_SAFE.available_to_spend,
            positions=[MOCK_POSITION_SOL_LONG],
            timestamp_ms=0,
        )
        output = risk_engine.evaluate(snapshot, {}, {})
        assert output.risk_tier == RiskTier.SAFE
        assert not output.hedges_to_open
        assert not output.hedges_to_close

    def test_hedge_account_triggers_hedge(self):
        snapshot = AccountSnapshot(
            wallet="wallet_hedge",
            cross_mmr=MOCK_ACCOUNT_HEDGE.cross_mmr,
            available_to_spend=MOCK_ACCOUNT_HEDGE.available_to_spend,
            positions=[MOCK_POSITION_SOL_LONG],
            timestamp_ms=0,
        )
        output = risk_engine.evaluate(snapshot, {"SOL": MOCK_SENTIMENT_BEARISH}, {})

        assert output.risk_tier == RiskTier.HEDGE
        assert len(output.hedges_to_open) == 1
        hedge = output.hedges_to_open[0]
        assert hedge.symbol == "SOL"
        assert hedge.hedge_side == "ask"
        assert Decimal(hedge.hedge_amount) == Decimal("0.075")
        assert hedge.sentiment == Sentiment.BEARISH

    def test_recovery_closes_hedge(self):
        snapshot = AccountSnapshot(
            wallet="wallet_recovering",
            cross_mmr=MOCK_ACCOUNT_RECOVERING.cross_mmr,
            available_to_spend="8000.0",
            positions=[MOCK_POSITION_SOL_LONG],
            timestamp_ms=0,
        )
        output = risk_engine.evaluate(snapshot, {}, {"SOL": 99001})
        assert not output.hedges_to_open
        assert len(output.hedges_to_close) == 1
        assert output.hedges_to_close[0].order_id == 99001

    def test_neutral_sentiment_hedge_size(self):
        snapshot = AccountSnapshot(
            wallet="wallet_neutral",
            cross_mmr="0.90",
            available_to_spend="5000.0",
            positions=[MOCK_POSITION_SOL_LONG],
            timestamp_ms=0,
        )
        output = risk_engine.evaluate(snapshot, {"SOL": MOCK_SENTIMENT_NEUTRAL}, {})
        hedge = output.hedges_to_open[0]
        # Neutral → 50% of 0.1 SOL = 0.05 SOL
        assert Decimal(hedge.hedge_amount) == Decimal("0.05")


# ── Execution engine integration ──────────────────────────────────────────────
# Skipped when httpx is not installed (CI/offline environments).
# In production, httpx is always present (listed in pyproject.toml deps).

_httpx = pytest.importorskip("httpx", reason="httpx not installed — skipping execution engine tests")


class TestExecutionEngineIntegration:
    """Execution engine with mocked PacificaClient and Agent Key."""

    @staticmethod
    def _make_engine(mock_pacifica):
        from app.services.execution.engine import ExecutionEngine
        return ExecutionEngine(pacifica=mock_pacifica)

    @staticmethod
    def _agent_patches():
        """Return (keypair, patch_kp, patch_pk) — caller must use as context managers."""
        from solders.keypair import Keypair
        # Import the module first so patch target is resolvable
        import app.services.execution.engine as _exe_mod  # noqa: F401
        kp = Keypair()
        return (
            kp,
            patch("app.services.execution.engine.get_agent_keypair", return_value=kp),
            patch("app.services.execution.engine.get_agent_pubkey", return_value=str(kp.pubkey())),
        )

    @pytest.mark.asyncio
    async def test_open_hedge_calls_pacifica_correctly(self, mock_pacifica):
        decision = HedgeDecision(
            wallet="wallet_test",
            symbol="SOL",
            hedge_side="ask",
            hedge_amount="0.075",
            sentiment=Sentiment.BEARISH,
            hedge_multiplier=Decimal("0.75"),
            cross_mmr="0.88",
            risk_tier=RiskTier.HEDGE,
        )
        kp, patch_kp, patch_pk = self._agent_patches()
        with patch_kp, patch_pk:
            result = await self._make_engine(mock_pacifica).open_hedge(decision, mark_price="150.0")

        assert result.order_id == 99001
        mock_pacifica.create_market_order.assert_awaited_once()
        args = mock_pacifica.create_market_order.call_args[0][0]
        assert args["builder_code"] == "AEGIS"
        assert args["symbol"] == "SOL"
        assert args["side"] == "ask"
        assert args["amount"] == "0.075"
        assert "signature" in args

    @pytest.mark.asyncio
    async def test_open_hedge_places_stop_loss(self, mock_pacifica):
        decision = HedgeDecision(
            wallet="wallet_test",
            symbol="SOL",
            hedge_side="ask",
            hedge_amount="0.075",
            sentiment=Sentiment.BEARISH,
            hedge_multiplier=Decimal("0.75"),
            cross_mmr="0.88",
            risk_tier=RiskTier.HEDGE,
        )
        kp, patch_kp, patch_pk = self._agent_patches()
        with patch_kp, patch_pk:
            await self._make_engine(mock_pacifica).open_hedge(decision, mark_price="150.0")

        mock_pacifica.create_stop_order.assert_awaited_once()
        sl_args = mock_pacifica.create_stop_order.call_args[0][0]
        assert sl_args["builder_code"] == "AEGIS"
        assert sl_args["reduce_only"] is True
        stop_price = float(sl_args["stop_order"]["stop_price"])
        assert stop_price == pytest.approx(154.5, rel=0.001)

    @pytest.mark.asyncio
    async def test_close_hedge_cancels_order(self, mock_pacifica):
        decision = RecoveryDecision(wallet="wallet_test", symbol="SOL", order_id=99001)
        kp, patch_kp, patch_pk = self._agent_patches()
        with patch_kp, patch_pk:
            await self._make_engine(mock_pacifica).close_hedge(decision)

        mock_pacifica.cancel_order.assert_awaited_once()
        args = mock_pacifica.cancel_order.call_args[0][0]
        assert args["order_id"] == 99001
        assert args["symbol"] == "SOL"
        assert "signature" in args

    def test_pacifica_client_rejects_missing_builder_code(self):
        """Guard: create_market_order rejects any payload without builder_code='AEGIS'."""
        import asyncio
        from app.services.pacifica.client import PacificaClient

        client = object.__new__(PacificaClient)
        with pytest.raises(ValueError, match="builder_code='AEGIS'"):
            asyncio.get_event_loop().run_until_complete(
                client.create_market_order({"builder_code": "WRONG"})
            )


# ── Vault manager integration (mock Redis only) ───────────────────────────────

class TestVaultManagerIntegration:
    """VaultManager with mock Redis — no redis package required at test time."""

    def _make_vault(self, mock_redis):
        # Lazy import to avoid module-level redis dependency
        from app.services.vault.manager import VaultManager  # type: ignore[import]
        return VaultManager(redis=mock_redis)

    @pytest.mark.asyncio
    async def test_activate_user_writes_to_redis(self, mock_redis):
        vault = self._make_vault(mock_redis)
        share = await vault.activate_user(
            wallet="wallet_A",
            positions=[MOCK_POSITION_SOL_LONG],
            threshold=75,
        )
        assert share.wallet == "wallet_A"
        assert mock_redis.set.await_count >= 1

    @pytest.mark.asyncio
    async def test_is_active_after_activate(self, mock_redis):
        vault = self._make_vault(mock_redis)
        await vault.activate_user("wallet_B", positions=[], threshold=80)
        active = await vault.is_user_active("wallet_B")
        assert active is True

    @pytest.mark.asyncio
    async def test_deactivate_removes_from_set(self, mock_redis):
        vault = self._make_vault(mock_redis)
        await vault.activate_user("wallet_C", positions=[], threshold=75)
        await vault.deactivate_user("wallet_C")
        active = await vault.is_user_active("wallet_C")
        assert active is False

    @pytest.mark.asyncio
    async def test_unknown_wallet_threshold_defaults_to_75(self, mock_redis):
        vault = self._make_vault(mock_redis)
        threshold = await vault.get_user_threshold("wallet_unknown")
        assert threshold == 75
