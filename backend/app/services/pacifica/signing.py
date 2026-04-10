"""
Ed25519 signing for Pacifica API requests.

Signing spec (verified against Pacifica docs):
  1. Build the payload dict with all required fields
  2. Recursively sort all keys alphabetically
  3. Serialise to compact JSON (no whitespace, ensure_ascii=True)
  4. Sign the UTF-8 encoded bytes with solders Ed25519 keypair
  5. base58-encode the 64-byte signature
  6. Inject 'signature' field back into the payload dict

The 'type' field identifies the operation and is included in the signed payload.
Timestamps are ALWAYS milliseconds.
"""
from __future__ import annotations

import json
import time
from typing import Any

import base58
from solders.keypair import Keypair


def _sort_recursive(obj: Any) -> Any:
    """Recursively sort dict keys alphabetically. Lists are not sorted (order matters)."""
    if isinstance(obj, dict):
        return {k: _sort_recursive(v) for k, v in sorted(obj.items())}
    if isinstance(obj, list):
        return [_sort_recursive(item) for item in obj]
    return obj


def canonical_json(payload: dict[str, Any]) -> str:
    """Produce the canonical signing string: sorted keys, compact, ASCII-safe."""
    return json.dumps(_sort_recursive(payload), separators=(",", ":"), ensure_ascii=True)


def sign_payload(
    payload: dict[str, Any],
    keypair: Keypair,
    *,
    expiry_window_ms: int = 30_000,
) -> dict[str, Any]:
    """
    Given an unsigned payload dict, add timestamp (if missing), expiry_window,
    sign it, inject the signature, and return the ready-to-POST dict.

    The payload must already contain all required fields (account, symbol, etc.)
    before calling this function.
    """
    # Ensure timestamp present and in milliseconds
    if "timestamp" not in payload:
        payload["timestamp"] = int(time.time() * 1000)
    if "expiry_window" not in payload:
        payload["expiry_window"] = expiry_window_ms

    # Canonical JSON → sign
    message = canonical_json(payload)
    signature_obj = keypair.sign_message(message.encode("utf-8"))
    sig_b58 = base58.b58encode(bytes(signature_obj)).decode("ascii")

    payload["signature"] = sig_b58
    return payload


def build_market_order_payload(
    *,
    account: str,
    symbol: str,
    side: str,                   # "bid" (buy/long) or "ask" (sell/short)
    amount: str,
    slippage_percent: str,
    reduce_only: bool,
    agent_wallet: str,
    builder_code: str,
    keypair: Keypair,
    client_order_id: str | None = None,
    take_profit_price: str | None = None,
    stop_loss_price: str | None = None,
) -> dict[str, Any]:
    """
    Build and sign a create_market_order payload.
    builder_code is always injected — callers cannot omit it.
    """
    payload: dict[str, Any] = {
        "account": account,
        "agent_wallet": agent_wallet,
        "amount": amount,
        "builder_code": builder_code,
        "reduce_only": reduce_only,
        "side": side,
        "slippage_percent": slippage_percent,
        "symbol": symbol,
        "timestamp": int(time.time() * 1000),
        "type": "create_market_order",
    }
    if client_order_id:
        payload["client_order_id"] = client_order_id
    if take_profit_price:
        payload["take_profit"] = {"stop_price": take_profit_price}
    if stop_loss_price:
        payload["stop_loss"] = {"stop_price": stop_loss_price}

    return sign_payload(payload, keypair)


def build_cancel_order_payload(
    *,
    account: str,
    symbol: str,
    order_id: int,
    agent_wallet: str,
    keypair: Keypair,
) -> dict[str, Any]:
    """Build and sign a cancel_order payload."""
    payload: dict[str, Any] = {
        "account": account,
        "agent_wallet": agent_wallet,
        "order_id": order_id,
        "symbol": symbol,
        "timestamp": int(time.time() * 1000),
        "type": "cancel_order",
    }
    return sign_payload(payload, keypair)


def build_stop_order_payload(
    *,
    account: str,
    symbol: str,
    side: str,
    stop_price: str,
    amount: str,
    reduce_only: bool,
    agent_wallet: str,
    builder_code: str,
    keypair: Keypair,
) -> dict[str, Any]:
    """
    Build and sign a create_stop_order payload.
    Used to place a stop-loss on a hedge position.
    """
    payload: dict[str, Any] = {
        "account": account,
        "agent_wallet": agent_wallet,
        "builder_code": builder_code,
        "reduce_only": reduce_only,
        "side": side,
        "stop_order": {
            "amount": amount,
            "stop_price": stop_price,
        },
        "symbol": symbol,
        "timestamp": int(time.time() * 1000),
        "type": "create_stop_order",
    }
    return sign_payload(payload, keypair)
