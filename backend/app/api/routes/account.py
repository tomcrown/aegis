"""
Account proxy endpoints — thin wrappers over PacificaClient.
All Aegis activation/deactivation logic routes through VaultManager.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from app.models.pacifica import AccountInfo, Position
from app.services.fuul.client import send_activation_event

router = APIRouter()


@router.get("/info", response_model=AccountInfo)
async def account_info(
    request: Request,
    wallet: str = Query(..., description="Wallet address to query"),
) -> AccountInfo:
    """Proxy GET /account from Pacifica and return typed AccountInfo."""
    try:
        return await request.app.state.pacifica.get_account_info(wallet)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/positions", response_model=list[Position])
async def positions(
    request: Request,
    wallet: str = Query(..., description="Wallet address to query"),
) -> list[Position]:
    """Proxy GET /positions from Pacifica."""
    try:
        return await request.app.state.pacifica.get_positions(wallet)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


class AegisActivateRequest(BaseModel):
    wallet: str
    threshold: int = 75    # cross_mmr % trigger, default 75
    referral_code: str | None = None


class AegisActivateResponse(BaseModel):
    activated: bool
    wallet: str
    deposited_usdc: str
    threshold: int


@router.post("/aegis/activate", response_model=AegisActivateResponse)
async def activate_aegis(
    body: AegisActivateRequest,
    request: Request,
) -> AegisActivateResponse:
    """
    Activate Aegis protection for a wallet.
    Fetches current positions, calculates premium, records vault share.
    """
    try:
        positions = await request.app.state.pacifica.get_positions(body.wallet)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch positions: {exc}") from exc

    share = await request.app.state.vault.activate_user(
        wallet=body.wallet,
        positions=positions,
        threshold=body.threshold,
    )

    # Fuul: fire conversion event (best-effort — never blocks activation)
    await send_activation_event(
        wallet=body.wallet,
        deposited_usdc=share.deposited_usdc,
        referral_code=body.referral_code,
    )

    return AegisActivateResponse(
        activated=True,
        wallet=body.wallet,
        deposited_usdc=share.deposited_usdc,
        threshold=body.threshold,
    )


@router.post("/aegis/deactivate")
async def deactivate_aegis(
    request: Request,
    wallet: str = Query(...),
) -> dict[str, str]:
    await request.app.state.vault.deactivate_user(wallet)
    return {"status": "deactivated", "wallet": wallet}


@router.get("/aegis/status")
async def aegis_status(
    request: Request,
    wallet: str = Query(...),
) -> dict:
    active = await request.app.state.vault.is_user_active(wallet)
    threshold = await request.app.state.vault.get_user_threshold(wallet)
    return {"wallet": wallet, "active": active, "threshold": threshold}


@router.post("/aegis/demo-trigger")
async def demo_trigger_hedge(
    request: Request,
    wallet: str = Query(..., description="Wallet to force-trigger a hedge for"),
) -> dict:
    """
    DEMO ONLY — forces a hedge evaluation bypassing the cross_mmr threshold.
    Used to demonstrate hedge execution in the hackathon demo video.
    Calls the real Pacifica testnet API to place an actual order.
    """
    from app.models.risk import Sentiment
    from app.models.risk import HedgeDecision, RiskTier
    from app.api.websocket.events import manager as ws_manager
    import time

    try:
        positions = await request.app.state.pacifica.get_positions(wallet)
        account_info = await request.app.state.pacifica.get_account_info(wallet)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch account: {exc}") from exc

    if not positions:
        raise HTTPException(status_code=400, detail="No open positions to hedge")

    position = positions[0]
    hedge_side = "ask" if position.side == "long" else "bid"

    from decimal import Decimal, ROUND_DOWN
    from app.utils.decimal_utils import to_dec, to_wire

    # Hedge 50% of position (neutral sentiment for demo)
    # Round to lot size 0.00001 — Pacifica requires multiples of lot size
    hedge_amount = (to_dec(position.amount) * Decimal("0.5")).quantize(
        Decimal("0.00001"), rounding=ROUND_DOWN
    )

    decision = HedgeDecision(
        wallet=wallet,
        symbol=position.symbol,
        hedge_side=hedge_side,
        hedge_amount=to_wire(hedge_amount),
        sentiment=Sentiment.NEUTRAL,
        hedge_multiplier=Decimal("0.5"),
        cross_mmr=account_info.cross_mmr,
        risk_tier=RiskTier.HEDGE,
    )

    ws_monitor = request.app.state.orchestrator._ws_monitor
    mark_price = await ws_monitor.get_mark_price(position.symbol)

    order = await request.app.state.orchestrator._execution.open_hedge(
        decision, mark_price=mark_price
    )
    await request.app.state.vault.record_hedge(wallet, position.symbol, order.order_id)

    await ws_manager.broadcast(wallet, {
        "type": "hedge_opened",
        "wallet": wallet,
        "timestamp_ms": int(time.time() * 1000),
        "payload": {
            "symbol": position.symbol,
            "order_id": order.order_id,
            "amount": to_wire(hedge_amount),
            "side": hedge_side,
            "sentiment": "neutral",
            "cross_mmr": account_info.cross_mmr,
        },
    })

    return {
        "triggered": True,
        "symbol": position.symbol,
        "side": hedge_side,
        "amount": to_wire(hedge_amount),
        "order_id": order.order_id,
    }
