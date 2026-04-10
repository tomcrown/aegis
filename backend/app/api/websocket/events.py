"""
Frontend-facing WebSocket endpoint.
Pushes real-time cross_mmr updates and hedge execution events to each browser tab.
Full implementation in Phase 2 Step 9 (background task orchestration).
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

log = logging.getLogger(__name__)
router = APIRouter()


class ConnectionManager:
    """Tracks all active frontend WebSocket connections."""

    def __init__(self) -> None:
        self._connections: dict[str, list[WebSocket]] = {}

    async def connect(self, wallet: str, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.setdefault(wallet, []).append(ws)
        log.info("WS connected: wallet=%s total=%d", wallet, len(self._connections[wallet]))

    def disconnect(self, wallet: str, ws: WebSocket) -> None:
        bucket = self._connections.get(wallet, [])
        try:
            bucket.remove(ws)
        except ValueError:
            pass
        if not bucket:
            self._connections.pop(wallet, None)

    async def broadcast(self, wallet: str, payload: dict) -> None:
        """Send payload to all browser tabs connected for this wallet."""
        for ws in list(self._connections.get(wallet, [])):
            try:
                await ws.send_json(payload)
            except Exception:
                self.disconnect(wallet, ws)


manager = ConnectionManager()


@router.websocket("/{wallet}")
async def websocket_endpoint(ws: WebSocket, wallet: str) -> None:
    await manager.connect(wallet, ws)
    try:
        while True:
            # Keep connection alive; frontend sends pings
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(wallet, ws)
        log.info("WS disconnected: wallet=%s", wallet)
