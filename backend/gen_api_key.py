"""
Generate a Pacifica API Config Key using the Aegis agent key.

Run from the backend directory:
  python gen_api_key.py

The generated key will be printed — copy it into .env as PACIFICA_API_CONFIG_KEY=...
"""
import asyncio
import json
import time

import base58
import httpx
import redis.asyncio as aioredis
from cryptography.fernet import Fernet

# ── Load config from .env ─────────────────────────────────────────────────────
import os
from dotenv import load_dotenv

load_dotenv(".env")

PACIFICA_REST_URL = os.getenv("PACIFICA_REST_URL", "https://test-api.pacifica.fi/api/v1").rstrip("/")
REDIS_URL         = os.getenv("REDIS_URL", "redis://localhost:6379/0")
FERNET_KEY        = os.getenv("FERNET_MASTER_KEY", "")


def _sort_recursive(obj):
    if isinstance(obj, dict):
        return {k: _sort_recursive(v) for k, v in sorted(obj.items())}
    if isinstance(obj, list):
        return [_sort_recursive(i) for i in obj]
    return obj


def canonical_json(payload: dict) -> str:
    return json.dumps(_sort_recursive(payload), separators=(",", ":"), ensure_ascii=True)


async def main():
    # ── Load agent keypair from Redis ─────────────────────────────────────────
    r = aioredis.from_url(REDIS_URL, decode_responses=False)
    encrypted = await r.get("aegis:agent_key:encrypted")
    await r.aclose()

    if not encrypted:
        print("ERROR: No agent key found in Redis. Start the backend first to bootstrap.")
        return

    f = Fernet(FERNET_KEY.encode())
    raw_bytes = f.decrypt(encrypted)

    from solders.keypair import Keypair
    keypair = Keypair.from_bytes(raw_bytes)
    pubkey = str(keypair.pubkey())
    print(f"Agent wallet: {pubkey}")

    # ── Build and sign the create_api_key request ─────────────────────────────
    timestamp = int(time.time() * 1000)
    header = {
        "type": "create_api_key",
        "timestamp": timestamp,
        "expiry_window": 30_000,
    }
    payload = {}   # empty for create

    message_dict = {**header, "data": payload}
    message = canonical_json(message_dict)
    sig_obj = keypair.sign_message(message.encode("utf-8"))
    signature = base58.b58encode(bytes(sig_obj)).decode("ascii")

    body = {
        "account": pubkey,
        "signature": signature,
        "timestamp": timestamp,
        "expiry_window": 30_000,
    }

    # ── POST to Pacifica ──────────────────────────────────────────────────────
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{PACIFICA_REST_URL}/account/api_keys/create",
            json=body,
            headers={"Content-Type": "application/json"},
        )

    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.text}")

    if resp.status_code == 200:
        data = resp.json()
        api_key = data.get("data", {}).get("api_key") or data.get("api_key")
        if api_key:
            print(f"\n✓ SUCCESS — add this to your .env:\n\nPACIFICA_API_CONFIG_KEY={api_key}\n")
        else:
            print("\nKey not found in response — check response above.")
    else:
        print("\nFailed. Check error above.")


asyncio.run(main())
