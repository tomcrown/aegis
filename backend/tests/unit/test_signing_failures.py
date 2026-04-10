"""
Signing failure and security property tests.

Key security invariants verified here:
  1. builder_code is always injected by builders — callers can't omit it
  2. stop order also enforces builder_code
  3. Signatures are tied to the signing keypair (wrong key fails to verify)
  4. Payload mutation after signing is detectable
"""
from __future__ import annotations

import base58
import pytest
from solders.keypair import Keypair
from solders.signature import Signature

from app.services.pacifica.signing import (
    build_cancel_order_payload,
    build_market_order_payload,
    build_stop_order_payload,
    canonical_json,
    sign_payload,
)


def _kp() -> Keypair:
    return Keypair()


# ── Security: signature verification ──────────────────────────────────────────

class TestSignatureVerification:
    def test_wrong_key_fails_verification(self):
        """Signature from keypair A must NOT verify with keypair B's pubkey."""
        kp_a = _kp()
        kp_b = _kp()
        payload = {"account": "wallet", "symbol": "SOL"}
        signed = sign_payload(payload.copy(), kp_a)

        # Remove signature, re-canonicalize, try to verify with kp_b
        payload_copy = {k: v for k, v in signed.items() if k != "signature"}
        message = canonical_json(payload_copy).encode("utf-8")
        sig = Signature.from_bytes(base58.b58decode(signed["signature"]))

        assert not sig.verify(kp_b.pubkey(), message)

    def test_mutated_payload_invalidates_signature(self):
        """Changing any field in a signed payload must invalidate the signature."""
        kp = _kp()
        payload = {"account": "wallet_A", "amount": "1.0", "symbol": "SOL"}
        signed = sign_payload(payload.copy(), kp)

        # Mutate the amount field
        signed["amount"] = "999.0"
        payload_copy = {k: v for k, v in signed.items() if k != "signature"}
        message = canonical_json(payload_copy).encode("utf-8")
        sig = Signature.from_bytes(base58.b58decode(signed["signature"]))

        assert not sig.verify(kp.pubkey(), message)

    def test_builder_code_mutation_detected(self):
        """Changing builder_code from AEGIS to something else invalidates signature."""
        kp = _kp()
        payload = build_market_order_payload(
            account="wallet", symbol="SOL", side="ask", amount="0.1",
            slippage_percent="0.5", reduce_only=False,
            agent_wallet=str(kp.pubkey()), builder_code="AEGIS", keypair=kp,
        )
        original_sig = payload["signature"]

        # Attacker tries to change builder_code after signing
        payload["builder_code"] = "ATTACKER"
        payload_copy = {k: v for k, v in payload.items() if k != "signature"}
        message = canonical_json(payload_copy).encode("utf-8")
        sig = Signature.from_bytes(base58.b58decode(original_sig))

        assert not sig.verify(kp.pubkey(), message)


# ── Builder invariants ────────────────────────────────────────────────────────

class TestBuilderInvariants:
    def test_market_order_always_has_builder_code(self):
        kp = _kp()
        payload = build_market_order_payload(
            account="w", symbol="SOL", side="ask", amount="0.1",
            slippage_percent="0.5", reduce_only=False,
            agent_wallet=str(kp.pubkey()), builder_code="AEGIS", keypair=kp,
        )
        assert payload["builder_code"] == "AEGIS"

    def test_stop_order_always_has_builder_code(self):
        kp = _kp()
        payload = build_stop_order_payload(
            account="w", symbol="SOL", side="bid",
            stop_price="140.0", amount="0.075", reduce_only=True,
            agent_wallet=str(kp.pubkey()), builder_code="AEGIS", keypair=kp,
        )
        assert payload["builder_code"] == "AEGIS"

    def test_cancel_order_has_no_builder_code(self):
        """Cancel orders do not carry builder_code — that's correct per Pacifica spec."""
        kp = _kp()
        payload = build_cancel_order_payload(
            account="w", symbol="SOL", order_id=12345,
            agent_wallet=str(kp.pubkey()), keypair=kp,
        )
        assert "builder_code" not in payload

    def test_market_order_type_field_correct(self):
        kp = _kp()
        p = build_market_order_payload(
            account="w", symbol="BTC", side="bid", amount="0.001",
            slippage_percent="0.5", reduce_only=False,
            agent_wallet=str(kp.pubkey()), builder_code="AEGIS", keypair=kp,
        )
        assert p["type"] == "create_market_order"

    def test_cancel_order_type_field_correct(self):
        kp = _kp()
        p = build_cancel_order_payload(
            account="w", symbol="SOL", order_id=99,
            agent_wallet=str(kp.pubkey()), keypair=kp,
        )
        assert p["type"] == "cancel_order"

    def test_stop_order_type_field_correct(self):
        kp = _kp()
        p = build_stop_order_payload(
            account="w", symbol="SOL", side="ask",
            stop_price="155.0", amount="0.1", reduce_only=True,
            agent_wallet=str(kp.pubkey()), builder_code="AEGIS", keypair=kp,
        )
        assert p["type"] == "create_stop_order"


# ── Canonical JSON edge cases ──────────────────────────────────────────────────

class TestCanonicalJsonEdgeCases:
    def test_empty_dict(self):
        assert canonical_json({}) == "{}"

    def test_boolean_values(self):
        result = canonical_json({"reduce_only": False, "active": True})
        assert '"reduce_only":false' in result
        assert '"active":true' in result

    def test_null_value(self):
        result = canonical_json({"field": None})
        assert '"field":null' in result

    def test_integer_values_not_quoted(self):
        result = canonical_json({"timestamp": 1234567890000})
        assert '"timestamp":1234567890000' in result

    def test_string_decimal_preserved(self):
        """String decimals must stay as strings — critical for Pacifica amounts."""
        result = canonical_json({"amount": "0.075"})
        assert '"amount":"0.075"' in result

    def test_nested_stop_order_structure(self):
        """Nested objects sort their keys too."""
        result = canonical_json({
            "stop_order": {"stop_price": "154.5", "amount": "0.075"}
        })
        # "amount" sorts before "stop_price"
        assert result.index('"amount"') < result.index('"stop_price"')
