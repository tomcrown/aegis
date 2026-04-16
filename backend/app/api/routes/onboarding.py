
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

import json
import logging

from app.core.agent_key import get_agent_pubkey

log = logging.getLogger(__name__)
router = APIRouter()


class BuilderApprovalRequest(BaseModel):
    account: str
    signature: str
    timestamp: int
    expiry_window: int
    builder_code: str
    max_fee_rate: str


class BindAgentKeyRequest(BaseModel):
 
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
  
    try:
        payload = body.model_dump()
        log.info("approve-builder payload → Pacifica: %s", json.dumps(payload, indent=2))
        result = await request.app.state.pacifica.approve_builder_code(payload)
        return {"status": "approved", "result": result}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/agent-key-info", response_model=AgentKeyInfoResponse)
async def agent_key_info() -> AgentKeyInfoResponse:
   
    return AgentKeyInfoResponse(
        agent_public_key=get_agent_pubkey(),
        permissions=["place_orders", "cancel_orders"],
        cannot_do=["withdraw_funds", "transfer_assets", "change_leverage_above_user_setting"],
    )
