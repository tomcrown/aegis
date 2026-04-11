"""
Ed25519 signing for Pacifica API requests.

Pacifica signing spec (confirmed from python-sdk source):
  1. Build a header: {type, timestamp, expiry_window}
  2. Build a payload dict of operation-specific fields
  3. Merge header + payload into one dict, recursively sort all keys
  4. Serialise to compact JSON (no whitespace, ensure_ascii=True) → this is the message
  5. Sign UTF-8 encoded message bytes with Ed25519 keypair
  6. base58-encode the 64-byte signature
  7. POST body = flat merge of header fields + payload fields + account + agent_wallet + signature
     (no 'data' wrapper in POST body — only in signed message)
"""
from __future__ import annotations

import json
import time
import uuid
from typing import Any

import base58
from solders.keypair import Keypair


def _sort_recursive(obj: Any) -> Any:
    """Recursively sort dict keys alphabetically."""
    if isinstance(obj, dict):
        return {k: _sort_recursive(v) for k, v in sorted(obj.items())}
    if isinstance(obj, list):
        return [_sort_recursive(item) for item in obj]
    return obj


def canonical_json(payload: dict[str, Any]) -> str:
    """Produce the canonical signing string: sorted keys, compact, ASCII-safe."""
    return json.dumps(_sort_recursive(payload), separators=(",", ":"), ensure_ascii=True)


def sign_message(
    header: dict[str, Any],
    payload: dict[str, Any],
    keypair: Keypair,
) -> tuple[str, str]:
    """
    Mirror of Pacifica SDK sign_message(header, payload, keypair).

    Signed message = canonical_json({...header, data: {...payload}})
    Returns (message_string, base58_signature)
    """
    message_dict = {**header, "data": payload}
    message = canonical_json(message_dict)
    sig_obj = keypair.sign_message(message.encode("utf-8"))
    sig_b58 = base58.b58encode(bytes(sig_obj)).decode("ascii")
    return message, sig_b58


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
) -> dict[str, Any]:
    """
    Build and sign a create_market_order payload.
    builder_code is always injected — callers cannot omit it.
    """
    timestamp = int(time.time() * 1000)

    header = {
        "type": "create_market_order",
        "timestamp": timestamp,
        "expiry_window": 5_000,
    }

    payload = {
        "symbol": symbol,
        "side": side,
        "amount": amount,
        "slippage_percent": slippage_percent,
        "reduce_only": reduce_only,
        "client_order_id": client_order_id or str(uuid.uuid4()),
        "builder_code": builder_code,
    }

    _, signature = sign_message(header, payload, keypair)

    # POST body: flat merge — no `data` wrapper
    return {
        "account": account,
        "agent_wallet": agent_wallet,
        "signature": signature,
        "timestamp": timestamp,
        "expiry_window": 5_000,
        **payload,
    }


def build_cancel_order_payload(
    *,
    account: str,
    symbol: str,
    order_id: int,
    agent_wallet: str,
    keypair: Keypair,
) -> dict[str, Any]:
    """Build and sign a cancel_order payload."""
    timestamp = int(time.time() * 1000)

    header = {
        "type": "cancel_order",
        "timestamp": timestamp,
        "expiry_window": 5_000,
    }

    payload = {
        "symbol": symbol,
        "order_id": order_id,
    }

    _, signature = sign_message(header, payload, keypair)

    return {
        "account": account,
        "agent_wallet": agent_wallet,
        "signature": signature,
        "timestamp": timestamp,
        "expiry_window": 5_000,
        **payload,
    }


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

    Pacifica stop order POST body nests order fields under 'stop_order':
      {account, agent_wallet, signature, timestamp, expiry_window,
       stop_order: {symbol, side, stop_price, amount, reduce_only, builder_code}}
    The signed message data mirrors this nesting.
    """
    timestamp = int(time.time() * 1000)

    header = {
        "type": "create_stop_order",
        "timestamp": timestamp,
        "expiry_window": 5_000,
    }

    order_fields = {
        "symbol": symbol,
        "side": side,
        "stop_price": stop_price,
        "amount": amount,
        "reduce_only": reduce_only,
        "builder_code": builder_code,
    }

    # Signed message data wraps fields under 'stop_order' (for signature verification)
    # POST body is flat — same as market order pattern
    _, signature = sign_message(header, {"stop_order": order_fields}, keypair)

    return {
        "account": account,
        "agent_wallet": agent_wallet,
        "signature": signature,
        "timestamp": timestamp,
        "expiry_window": 5_000,
        **order_fields,
    }
