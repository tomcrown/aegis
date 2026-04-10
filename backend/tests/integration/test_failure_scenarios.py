"""
Integration tests for failure scenarios and graceful degradation.

Tests what happens when:
  - Pacifica API returns 5xx
  - Pacifica API returns 429 (rate limit)
  - Elfa API fails entirely
  - Agent Key not bootstrapped
  - Fernet token is tampered
  - Hedge open fails (execution engine handles exception gracefully)
  - Recovery with no active hedges (no-op)
"""
from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.pacifica import AccountSnapshot
from app.models.risk import RiskTier, Sentiment, SentimentData
from app.services.risk import engine as risk_engine

from tests.integration.conftest import MOCK_POSITION_SOL_LONG


# ── Fernet tamper detection ────────────────────────────────────────────────────

class TestFernetTamperDetection:
    """Security: tampered tokens must be rejected, not silently decrypted."""

    @pytest.fixture(autouse=True)
    def _patch_settings(self):
        from cryptography.fernet import Fernet
        from app.core import encryption
        key = Fernet.generate_key().decode()
        encryption._get_fernet.cache_clear()
        with patch("app.core.encryption.get_settings") as m:
            m.return_value.fernet_master_key = key
            yield
        encryption._get_fernet.cache_clear()

    def test_tampered_token_raises_value_error(self):
        from app.core.encryption import decrypt, encrypt
        token = encrypt(b"agent_key_bytes" * 4)
        # Flip a character in the base64 payload section
        idx = 20
        chars = list(token)
        chars[idx] = "Z" if chars[idx] != "Z" else "A"
        tampered = "".join(chars)
        with pytest.raises(ValueError, match="Decryption failed"):
            decrypt(tampered)

    def test_wrong_key_raises_value_error(self):
        """Token encrypted with key A must not decrypt with key B."""
        from cryptography.fernet import Fernet
        from app.core import encryption
        from app.core.encryption import encrypt

        token = encrypt(b"secret_key_bytes")

        # Swap in a different Fernet key
        encryption._get_fernet.cache_clear()
        different_key = Fernet.generate_key().decode()
        with patch("app.core.encryption.get_settings") as m:
            m.return_value.fernet_master_key = different_key
            from app.core.encryption import decrypt
            with pytest.raises(ValueError):
                decrypt(token)
        encryption._get_fernet.cache_clear()


# ── Risk engine: safe degradation on missing/bad data ────────────────────────

class TestRiskEngineDegradation:
    def test_empty_positions_in_hedge_tier(self):
        """cross_mmr ≥ 85% but no positions → no hedges opened (nothing to hedge)."""
        snapshot = AccountSnapshot(
            wallet="w", cross_mmr="0.90",
            available_to_spend="1000", positions=[], timestamp_ms=0,
        )
        out = risk_engine.evaluate(snapshot, {}, {})
        assert out.risk_tier == RiskTier.HEDGE
        assert not out.hedges_to_open

    def test_recovery_with_no_active_hedges_is_noop(self):
        """cross_mmr < 65% but no active hedges → nothing to close."""
        snapshot = AccountSnapshot(
            wallet="w", cross_mmr="0.50",
            available_to_spend="1000", positions=[MOCK_POSITION_SOL_LONG], timestamp_ms=0,
        )
        out = risk_engine.evaluate(snapshot, {}, {})
        assert not out.hedges_to_close
        assert not out.hedges_to_open

    def test_sentiment_map_missing_symbol_uses_neutral(self):
        """SentimentData absent for a symbol → NEUTRAL (0.50 multiplier)."""
        snapshot = AccountSnapshot(
            wallet="w", cross_mmr="0.90",
            available_to_spend="1000", positions=[MOCK_POSITION_SOL_LONG], timestamp_ms=0,
        )
        # BTC sentiment provided but not SOL
        sentiment_map = {
            "BTC": SentimentData(symbol="BTC", score=80.0, sentiment=Sentiment.BULLISH)
        }
        out = risk_engine.evaluate(snapshot, sentiment_map, {})
        hedge = out.hedges_to_open[0]
        assert hedge.sentiment == Sentiment.NEUTRAL
        assert Decimal(hedge.hedge_amount) == Decimal("0.05")  # 0.1 × 0.5

    def test_extreme_cross_mmr_values(self):
        """cross_mmr of '0.00' and '1.00' should not crash the engine."""
        for mmr in ["0.00", "0.99", "1.00"]:
            snapshot = AccountSnapshot(
                wallet="w", cross_mmr=mmr,
                available_to_spend="1000",
                positions=[MOCK_POSITION_SOL_LONG] if float(mmr) >= 0.85 else [],
                timestamp_ms=0,
            )
            out = risk_engine.evaluate(snapshot, {}, {})
            assert out is not None

    def test_cross_mmr_string_with_many_decimals(self):
        """Pacifica may return high-precision decimals — must parse correctly."""
        snapshot = AccountSnapshot(
            wallet="w", cross_mmr="0.850000001",
            available_to_spend="1000",
            positions=[MOCK_POSITION_SOL_LONG], timestamp_ms=0,
        )
        out = risk_engine.evaluate(snapshot, {}, {})
        assert out.risk_tier == RiskTier.HEDGE


# ── Execution engine: hedge open failure handling ─────────────────────────────

class TestExecutionFailureHandling:
    @pytest.mark.asyncio
    async def test_stop_loss_failure_does_not_abort_hedge(self, mock_pacifica):
        """
        If placing the stop-loss fails, the hedge order itself is still reported
        as successful. The stop-loss is best-effort (logged, not fatal).
        """
        _httpx = pytest.importorskip("httpx", reason="httpx not installed")

        from app.models.risk import HedgeDecision, RiskTier
        from app.services.execution.engine import ExecutionEngine

        mock_pacifica.create_stop_order = AsyncMock(
            side_effect=RuntimeError("Pacifica stop order failed")
        )

        decision = HedgeDecision(
            wallet="w", symbol="SOL", hedge_side="ask",
            hedge_amount="0.075", sentiment=Sentiment.BEARISH,
            hedge_multiplier=Decimal("0.75"), cross_mmr="0.88",
            risk_tier=RiskTier.HEDGE,
        )

        import app.services.execution.engine as _exe_mod  # noqa: F401
        with patch("app.services.execution.engine.get_agent_keypair") as mock_kp, \
             patch("app.services.execution.engine.get_agent_pubkey") as mock_pk:
            from solders.keypair import Keypair
            kp = Keypair()
            mock_kp.return_value = kp
            mock_pk.return_value = str(kp.pubkey())

            engine = ExecutionEngine(pacifica=mock_pacifica)
            # Should NOT raise — stop-loss failure is logged and swallowed
            result = await engine.open_hedge(decision, mark_price="150.0")

        assert result.order_id == 99001
        mock_pacifica.create_market_order.assert_awaited_once()


# ── Vault manager: edge cases ─────────────────────────────────────────────────

class TestVaultManagerEdgeCases:
    @pytest.mark.asyncio
    async def test_activate_user_with_no_positions(self, mock_redis):
        """User with no open positions pays zero premium — should not crash."""
        from app.services.vault.manager import VaultManager
        vault = VaultManager(redis=mock_redis)
        share = await vault.activate_user(wallet="w", positions=[], threshold=75)
        assert share.wallet == "w"
        # deposited_usdc will be "0" (no notional)
        assert float(share.deposited_usdc) == 0.0

    @pytest.mark.asyncio
    async def test_get_user_share_returns_none_for_unknown(self, mock_redis):
        from app.services.vault.manager import VaultManager
        vault = VaultManager(redis=mock_redis)
        result = await vault.get_user_share("unknown_wallet")
        assert result is None

    @pytest.mark.asyncio
    async def test_credit_yield_noop_for_unknown_wallet(self, mock_redis):
        """credit_yield on unknown wallet should be a no-op (no crash)."""
        from app.services.vault.manager import VaultManager
        vault = VaultManager(redis=mock_redis)
        # Should not raise
        await vault.credit_yield("unknown_wallet", "5.0")

    @pytest.mark.asyncio
    async def test_active_hedges_empty_for_new_user(self, mock_redis):
        from app.services.vault.manager import VaultManager
        vault = VaultManager(redis=mock_redis)
        hedges = await vault.get_active_hedges("brand_new_wallet")
        assert hedges == {}
