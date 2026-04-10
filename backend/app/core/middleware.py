"""
FastAPI middleware and exception handlers.
Registered in create_app() in main.py.
"""
from __future__ import annotations

import logging
import time

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.middleware.base import BaseHTTPMiddleware

from app.services.pacifica.client import PacificaError

log = logging.getLogger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log every request with method, path, status, and duration."""

    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(
            "%s %s → %d (%.1fms)",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        return response


async def pacifica_error_handler(request: Request, exc: PacificaError) -> JSONResponse:
    """Convert PacificaError into a structured 502 response."""
    log.warning("Pacifica upstream error: status=%d body=%s", exc.status, exc.body[:200])
    return JSONResponse(
        status_code=502,
        content={"detail": f"Pacifica API error {exc.status}", "upstream": exc.body[:200]},
    )


async def validation_error_handler(request: Request, exc: ValidationError) -> JSONResponse:
    """Return 422 with structured field errors for Pydantic validation failures."""
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )


async def generic_error_handler(request: Request, exc: Exception) -> JSONResponse:
    log.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
