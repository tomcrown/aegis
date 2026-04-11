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
        # Return a zeroed-out share so the UI always renders "Your Position"
        from app.models.vault import VaultShare as VS
        import time
        return VS(
            wallet=wallet,
            deposited_usdc="0",
            share_fraction="0",
            yield_earned="0",
            active_hedges=0,
            joined_at_ms=int(time.time() * 1000),
        )
    return share
