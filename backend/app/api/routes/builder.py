from __future__ import annotations

from fastapi import APIRouter, Query, Request

from app.core.config import get_settings
from app.models.pacifica import BuilderTrade

router = APIRouter()
settings = get_settings()


@router.get("/trades", response_model=list[BuilderTrade])
async def builder_trades(
    request: Request,
    limit: int = Query(default=100, le=500),
) -> list[BuilderTrade]:
    """All trades attributed to builder_code=AEGIS on Pacifica."""
    return await request.app.state.pacifica.get_builder_trades(
        settings.builder_code, limit=limit
    )


@router.get("/leaderboard")
async def builder_leaderboard(request: Request) -> list:
    return await request.app.state.pacifica.get_builder_leaderboard(settings.builder_code)
