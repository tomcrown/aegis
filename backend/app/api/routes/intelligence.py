"""
Intelligence endpoints — Elfa AI data for the Intelligence page.

Routes:
  GET /api/v1/intelligence/snapshot?wallet=  — full intel snapshot for active symbols
  GET /api/v1/intelligence/narratives         — trending narratives (global)
  GET /api/v1/intelligence/macro              — AI macro context (global)
  GET /api/v1/intelligence/trending-cas       — trending CAs on Twitter + Telegram
  GET /api/v1/intelligence/news?symbol=       — token news feed
  GET /api/v1/intelligence/sentiment-history?symbol= — sentiment score history
  GET /api/v1/intelligence/crash-check?symbol=       — crash keyword alert status
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query, Request

log = logging.getLogger(__name__)
router = APIRouter()


def _get_elfa(request: Request):
    elfa = getattr(request.app.state, "elfa", None)
    if elfa is None:
        raise HTTPException(503, "Elfa client not initialised")
    return elfa


def _get_pacifica(request: Request):
    pacifica = getattr(request.app.state, "pacifica", None)
    if pacifica is None:
        raise HTTPException(503, "Pacifica client not initialised")
    return pacifica


def _get_vault(request: Request):
    vault = getattr(request.app.state, "vault", None)
    if vault is None:
        raise HTTPException(503, "Vault not initialised")
    return vault


@router.get("/snapshot")
async def get_intelligence_snapshot(
    wallet: str = Query(...),
    request: Request = None,
) -> dict:
   
    elfa = _get_elfa(request)
    pacifica = _get_pacifica(request)

    try:
        positions = await pacifica.get_positions(wallet)
        symbols = [p.symbol for p in positions]
    except Exception:
        symbols = []

    try:
        snapshot = await elfa.get_intelligence_snapshot(symbols)
    except Exception as exc:
        log.error("Intelligence snapshot failed: %s", exc)
        raise HTTPException(500, f"Intelligence fetch failed: {exc}") from exc

    return snapshot


@router.get("/narratives")
async def get_narratives(request: Request) -> dict:
    elfa = _get_elfa(request)
    narratives = await elfa.get_trending_narratives()
    return {"narratives": narratives}


@router.get("/macro")
async def get_macro(request: Request) -> dict:
    elfa = _get_elfa(request)
    context = await elfa.get_macro_context()
    return {"context": context}


@router.get("/trending-cas")
async def get_trending_cas(
    platform: str = Query("twitter"),
    request: Request = None,
) -> dict:
    elfa = _get_elfa(request)
    if platform not in ("twitter", "telegram"):
        raise HTTPException(400, "platform must be 'twitter' or 'telegram'")
    cas = await elfa.get_trending_cas(platform)
    return {"platform": platform, "tokens": cas}


@router.get("/news")
async def get_token_news(
    symbol: str = Query(...),
    request: Request = None,
) -> dict:
    elfa = _get_elfa(request)
    news = await elfa.get_token_news(symbol.upper())
    return {"symbol": symbol.upper(), "news": news}


@router.get("/sentiment-history")
async def get_sentiment_history(
    symbol: str = Query(...),
    request: Request = None,
) -> dict:
   
    elfa = _get_elfa(request)
    history = await elfa.get_sentiment_history(symbol.upper())
    return {"symbol": symbol.upper(), "scores": history}


@router.get("/trending-named-tokens")
async def get_trending_named_tokens(request: Request) -> dict:
   
    elfa = _get_elfa(request)
    try:
        # Tap into the internal trending-tokens fetch — fully cached
        items = await elfa._fetch_trending_tokens()
    except Exception:
        items = []

    tokens = []
    for item in items[:30]:
        if not isinstance(item, dict):
            continue
        sym = str(item.get("token") or item.get("symbol") or item.get("ticker") or "").upper()
        if not sym:
            continue
        change_pct = float(item.get("change_percent", 0) or 0)
        mentions = int(item.get("current_count", 0) or 0)
        score = max(0.0, min(100.0, 50.0 + change_pct / 2.0))
        tokens.append({
            "symbol": sym,
            "score": round(score, 1),
            "mentions": mentions,
            "change_pct": round(change_pct, 1),
        })

    # Sort by mention count descending
    tokens.sort(key=lambda x: x["mentions"], reverse=True)
    return {"tokens": tokens}


@router.get("/crash-check")
async def crash_check(
    symbol: str = Query(...),
    request: Request = None,
) -> dict:
    elfa = _get_elfa(request)
    result = await elfa.check_crash_keywords(symbol.upper())
    return result
