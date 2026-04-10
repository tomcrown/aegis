from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.models.vault import VaultShare, VaultState

router = APIRouter()


@router.get("/state", response_model=VaultState)
async def vault_state(request: Request) -> VaultState:
    return await request.app.state.vault.get_vault_state()


@router.get("/share/{wallet}", response_model=VaultShare)
async def vault_share(wallet: str, request: Request) -> VaultShare:
    share = await request.app.state.vault.get_user_share(wallet)
    if not share:
        raise HTTPException(status_code=404, detail="No vault share found for this wallet")
    return share
