"""
Sentiment endpoint — proxies Elfa AI data via the app-level ElfaClient.
The ElfaClient is stored in app.state so it shares the Redis cache
and httpx connection pool across all requests.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.models.risk import SentimentData

router = APIRouter()


@router.get("/{symbol}", response_model=SentimentData)
async def get_sentiment(symbol: str, request: Request) -> SentimentData:
    """
    Return cached Elfa sentiment for a symbol.
    Falls back to NEUTRAL if Elfa is unavailable.
    Uses app.state.elfa (created in orchestrator) to avoid per-request client creation.
    """
    elfa = getattr(request.app.state, "elfa", None)
    if elfa is None:
        raise HTTPException(
            status_code=503,
            detail="Elfa client not initialised — orchestrator may not have started",
        )
    return await elfa.get_sentiment(symbol.upper())
