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

from app.core.agent_key import get_agent_pubkey

router = APIRouter()


class BuilderApprovalRequest(BaseModel):
    """
    Signed payload from the user's Privy wallet — forwarded verbatim to Pacifica.
    The frontend signs this; we never see or need the user's private key.
    """
    account: str
    timestamp: int
    expiry_window: int
    signature: str
    data: dict  # contains builder_code, max_fee_rate etc.


class AgentKeyInfoResponse(BaseModel):
    agent_public_key: str
    permissions: list[str]
    cannot_do: list[str]


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
        result = await request.app.state.pacifica.approve_builder_code(body.model_dump())
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
