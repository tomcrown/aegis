"""
Aegis — FastAPI application entry point.
All route registration, lifespan management, and middleware configured here.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.agent_key import bootstrap_agent_key
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.redis import get_redis

configure_logging()
log = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Startup and shutdown sequence."""
    log.info("Aegis backend starting — builder_code=%s", settings.builder_code)

    from app.services.pacifica.client import PacificaClient
    from app.services.vault.manager import VaultManager
    from app.services.orchestrator import Orchestrator

    redis = await get_redis()
    app.state.redis = redis

    # Bootstrap Agent Key (load from Redis or env on first run)
    await bootstrap_agent_key(redis)

    pacifica = PacificaClient(redis=redis)
    vault = VaultManager(redis=redis)
    orchestrator = Orchestrator(redis=redis, pacifica=pacifica, vault=vault)

    app.state.pacifica = pacifica
    app.state.vault = vault
    app.state.orchestrator = orchestrator
    app.state.elfa = orchestrator.elfa   # shared ElfaClient for sentiment route

    await orchestrator.start()
    log.info("Orchestrator started")
    log.info("Pacifica REST target: %s", settings.pacifica_rest_url)

    yield

    log.info("Aegis backend shutting down")
    await orchestrator.stop()
    await pacifica.close()
    await redis.aclose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Aegis Risk Engine",
        version="0.1.0",
        docs_url="/docs",
        redoc_url=None,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from app.api.routes import account, builder, health, intelligence, onboarding, vault, sentiment
    from app.api.websocket import events
    from app.core.middleware import (
        RequestLoggingMiddleware,
        generic_error_handler,
        pacifica_error_handler,
        validation_error_handler,
    )
    from app.services.pacifica.client import PacificaError
    from pydantic import ValidationError

    app.add_middleware(RequestLoggingMiddleware)
    app.add_exception_handler(PacificaError, pacifica_error_handler)
    app.add_exception_handler(ValidationError, validation_error_handler)
    app.add_exception_handler(Exception, generic_error_handler)

    app.include_router(health.router, prefix="/health", tags=["health"])
    app.include_router(onboarding.router, prefix="/api/v1/onboarding", tags=["onboarding"])
    app.include_router(account.router, prefix="/api/v1/account", tags=["account"])
    app.include_router(vault.router, prefix="/api/v1/vault", tags=["vault"])
    app.include_router(builder.router, prefix="/api/v1/builder", tags=["builder"])
    app.include_router(sentiment.router, prefix="/api/v1/sentiment", tags=["sentiment"])
    app.include_router(intelligence.router, prefix="/api/v1/intelligence", tags=["intelligence"])
    app.include_router(events.router, prefix="/ws", tags=["websocket"])

    return app


app = create_app()
