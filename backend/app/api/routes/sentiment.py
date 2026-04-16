
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.models.risk import SentimentData

router = APIRouter()


@router.get("/{symbol}", response_model=SentimentData)
async def get_sentiment(symbol: str, request: Request) -> SentimentData:

    elfa = getattr(request.app.state, "elfa", None)
    if elfa is None:
        raise HTTPException(
            status_code=503,
            detail="Elfa client not initialised — orchestrator may not have started",
        )
    return await elfa.get_sentiment(symbol.upper())
