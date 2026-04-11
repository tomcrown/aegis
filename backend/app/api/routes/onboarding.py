"""
Onboarding endpoints.

Flow:
  1. Frontend collects user's Privy-signed builder code approval payload
  2. POST /onboarding/approve-builder → forwards to Pacifica
  3. Frontend signals Aegis is ready for the user
  4. POST /onboarding/register → stores user config in Redis

The Agent Key public key is returned so the frontend can display
what the key is authorised to do (place/cancel orders only).
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

import json
import logging

from app.core.agent_key import get_agent_pubkey

log = logging.getLogger(__name__)
router = APIRouter()


class BuilderApprovalRequest(BaseModel):
    """
    POST body forwarded to Pacifica — flat structure, no type/data wrapper.
    Signed message (not sent directly) uses nested data: {type, expiry_window, timestamp, data:{builder_code, max_fee_rate}}
    """
    account: str
    signature: str
    timestamp: int
    expiry_window: int
    builder_code: str
    max_fee_rate: str


class BindAgentKeyRequest(BaseModel):
    """
    User-signed payload to authorize Aegis Agent Key on their Pacifica account.
    Signed fields: type, expiry_window, timestamp, agent_wallet
    POST body: account + signature + timestamp + expiry_window + agent_wallet
    """
    account: str
    signature: str
    timestamp: int
    expiry_window: int
    agent_wallet: str


class AgentKeyInfoResponse(BaseModel):
    agent_public_key: str
    permissions: list[str]
    cannot_do: list[str]


@router.post("/bind-agent-key")
async def bind_agent_key(
    body: BindAgentKeyRequest,
    request: Request,
) -> dict:
    """
    Forward user-signed agent key binding to Pacifica.
    After this, the Aegis Agent Key can sign orders on behalf of this user.
    """
    try:
        payload = body.model_dump()
        log.info("bind-agent-key payload → Pacifica: %s", json.dumps({k: v for k, v in payload.items() if k != "signature"}, indent=2))
        result = await request.app.state.pacifica.bind_agent_key(payload)
        return {"status": "bound", "result": result}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/approve-builder")
async def approve_builder_code(
    body: BuilderApprovalRequest,
    request: Request,
) -> dict:
    """
    Forward the user-signed builder code approval to Pacifica.
    This must be called once per user during onboarding.
    """
    try:
        payload = body.model_dump()
        log.info("approve-builder payload → Pacifica: %s", json.dumps(payload, indent=2))
        result = await request.app.state.pacifica.approve_builder_code(payload)
        return {"status": "approved", "result": result}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/agent-key-info", response_model=AgentKeyInfoResponse)
async def agent_key_info() -> AgentKeyInfoResponse:
    """
    Return the Agent Key public key and its permission scope.
    Displayed in the frontend's trust/security panel.
    """
    return AgentKeyInfoResponse(
        agent_public_key=get_agent_pubkey(),
        permissions=["place_orders", "cancel_orders"],
        cannot_do=["withdraw_funds", "transfer_assets", "change_leverage_above_user_setting"],
    )
