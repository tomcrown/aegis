"""
Unit tests for the Pacifica signing module.
Validates canonical JSON, sort order, and signature round-trips.
Does NOT call Pacifica API — pure cryptographic unit tests.
"""
from __future__ import annotations

import json
import time

import base58
import pytest
from solders.keypair import Keypair

from app.services.pacifica.signing import (
    build_market_order_payload,
    canonical_json,
    sign_payload,
)


def _random_keypair() -> Keypair:
    return Keypair()


class TestCanonicalJson:
    def test_keys_sorted_alphabetically(self):
        payload = {"z": 1, "a": 2, "m": 3}
        result = canonical_json(payload)
        parsed = json.loads(result)
        keys = list(parsed.keys())
        assert keys == sorted(keys)

    def test_nested_keys_sorted(self):
        payload = {"outer": {"z": 1, "a": 2}, "b": 3}
        result = canonical_json(payload)
        parsed = json.loads(result)
        # outer keys should be sorted
        outer_keys = list(parsed["outer"].keys())
        assert outer_keys == sorted(outer_keys)

    def test_compact_no_whitespace(self):
        payload = {"a": 1, "b": 2}
        result = canonical_json(payload)
        assert " " not in result

    def test_list_order_preserved(self):
        """Lists must NOT be sorted — order is semantically significant."""
        payload = {"items": [3, 1, 2]}
        result = canonical_json(payload)
        parsed = json.loads(result)
        assert parsed["items"] == [3, 1, 2]

    def test_deeply_nested(self):
        payload = {
            "z_top": {"z_mid": {"z_inner": 1, "a_inner": 2}, "a_mid": 3},
            "a_top": 4,
        }
        result = canonical_json(payload)
        parsed = json.loads(result)
        assert list(parsed.keys())[0] == "a_top"
        assert list(parsed["z_top"].keys())[0] == "a_mid"
        assert list(parsed["z_top"]["z_mid"].keys())[0] == "a_inner"


class TestSignPayload:
    def test_timestamp_injected_if_missing(self):
        keypair = _random_keypair()
        payload = {"account": "abc", "symbol": "SOL"}
        before = int(time.time() * 1000)
        signed = sign_payload(payload.copy(), keypair)
        after = int(time.time() * 1000)
        assert before <= signed["timestamp"] <= after

    def test_expiry_window_injected(self):
        keypair = _random_keypair()
        signed = sign_payload({"account": "abc"}, keypair, expiry_window_ms=5000)
        assert signed["expiry_window"] == 5000

    def test_signature_field_present(self):
        keypair = _random_keypair()
        signed = sign_payload({"account": "abc"}, keypair)
        assert "signature" in signed
        assert isinstance(signed["signature"], str)
        assert len(signed["signature"]) > 0

    def test_signature_is_valid_base58(self):
        """Signature must be decodable from base58 to 64 bytes."""
        keypair = _random_keypair()
        signed = sign_payload({"account": "abc"}, keypair)
        sig_bytes = base58.b58decode(signed["signature"])
        assert len(sig_bytes) == 64

    def test_signature_verifiable(self):
        """Verify the signature can be verified with the keypair's public key."""
        from solders.pubkey import Pubkey

        keypair = _random_keypair()
        payload = {"account": "test_wallet", "symbol": "SOL", "amount": "0.1"}
        signed = sign_payload(payload.copy(), keypair)

        # Reconstruct the signed message
        # (remove signature before re-canonicalising)
        payload_copy = {k: v for k, v in signed.items() if k != "signature"}
        message = canonical_json(payload_copy).encode("utf-8")

        sig_bytes = base58.b58decode(signed["signature"])
        # solders verification
        from solders.signature import Signature as SoldersSignature
        sig = SoldersSignature.from_bytes(sig_bytes)
        assert sig.verify(keypair.pubkey(), message)

    def test_existing_timestamp_not_overwritten(self):
        keypair = _random_keypair()
        payload = {"account": "abc", "timestamp": 12345}
        signed = sign_payload(payload, keypair)
        assert signed["timestamp"] == 12345


class TestBuildMarketOrderPayload:
    def test_builder_code_always_aegis(self):
        keypair = _random_keypair()
        payload = build_market_order_payload(
            account="wallet",
            symbol="SOL",
            side="ask",
            amount="0.075",
            slippage_percent="0.5",
            reduce_only=False,
            agent_wallet=str(keypair.pubkey()),
            builder_code="AEGIS",
            keypair=keypair,
        )
        assert payload["builder_code"] == "AEGIS"

    def test_type_field_set(self):
        keypair = _random_keypair()
        payload = build_market_order_payload(
            account="wallet",
            symbol="SOL",
            side="bid",
            amount="0.1",
            slippage_percent="0.5",
            reduce_only=False,
            agent_wallet=str(keypair.pubkey()),
            builder_code="AEGIS",
            keypair=keypair,
        )
        assert payload["type"] == "create_market_order"

    def test_agent_wallet_in_payload(self):
        keypair = _random_keypair()
        pubkey = str(keypair.pubkey())
        payload = build_market_order_payload(
            account="wallet",
            symbol="BTC",
            side="ask",
            amount="0.001",
            slippage_percent="0.5",
            reduce_only=False,
            agent_wallet=pubkey,
            builder_code="AEGIS",
            keypair=keypair,
        )
        assert payload["agent_wallet"] == pubkey

    def test_signature_present_and_valid(self):
        keypair = _random_keypair()
        payload = build_market_order_payload(
            account="wallet",
            symbol="SOL",
            side="ask",
            amount="0.075",
            slippage_percent="0.5",
            reduce_only=False,
            agent_wallet=str(keypair.pubkey()),
            builder_code="AEGIS",
            keypair=keypair,
        )
        assert "signature" in payload
        sig_bytes = base58.b58decode(payload["signature"])
        assert len(sig_bytes) == 64
