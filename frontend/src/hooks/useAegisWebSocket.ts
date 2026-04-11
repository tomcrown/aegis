/**
 * WebSocket client — connects to ws://localhost:8000/ws/{wallet}
 * and feeds live events into the Zustand store.
 *
 * Handles:
 *   - mmr_update → updates riskState in store
 *   - hedge_opened / hedge_closed → triggers toast notifications
 *   - alert → watch-tier warning
 *   - Automatic reconnect with exponential backoff
 *   - Heartbeat ping every 25s
 *
 * Dev mode note: this hook connects to the real backend WebSocket.
 * The dev mode simulation only overrides the crossMmrPct value in the store
 * via useDevModeSimulation — it does NOT send anything to the backend.
 */

import { useEffect, useRef } from "react";
import { useAegisStore } from "@/stores/useAegisStore";
import type { RiskTier, WsEvent } from "@/types";

const WS_BASE = import.meta.env.VITE_WS_URL as string;
const PING_INTERVAL_MS = 25_000;
const BASE_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

function backoff(attempt: number): number {
  const cap = Math.min(MAX_RECONNECT_MS, BASE_RECONNECT_MS * 2 ** attempt);
  return Math.random() * cap;
}

export function useAegisWebSocket(wallet: string | null): void {
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);

  const setRiskState = useAegisStore((s) => s.setRiskState);
  const addActivity = useAegisStore((s) => s.addActivity);
  const devModeRef = useRef(false);
  // Keep a ref so the WS message handler (closed over in useEffect) sees live value
  const devModeEnabled = useAegisStore((s) => s.devMode.enabled);
  useEffect(() => { devModeRef.current = devModeEnabled; }, [devModeEnabled]);

  useEffect(() => {
    mountedRef.current = true;
    if (!wallet) return;

    function connect() {
      if (!mountedRef.current || !wallet) return;

      const ws = new WebSocket(`${WS_BASE}/${wallet}`);
      wsRef.current = ws;

      ws.onopen = () => {
        attemptRef.current = 0;
        // Start heartbeat
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (evt: MessageEvent<string>) => {
        let event: WsEvent;
        try {
          event = JSON.parse(evt.data) as WsEvent;
        } catch {
          return; // pong or malformed — ignore
        }
        handleEvent(event);
      };

      ws.onclose = () => {
        cleanup();
        if (!mountedRef.current) return;
        const wait = backoff(attemptRef.current++);
        reconnectRef.current = setTimeout(connect, wait);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    function handleEvent(event: WsEvent) {
      switch (event.type) {
        case "mmr_update": {
          // Dev mode overrides the store — don't let real WS data clobber it
          if (devModeRef.current) break;
          const payload = event.payload as {
            cross_mmr_pct: number;
            risk_tier: RiskTier;
          };
          // Pacifica cross_mmr > 100% = safe, 100% = liquidation.
          // Normalize to 0-100 danger scale: 200%-safe = 0, 100%-liq = 100.
          const dangerPct = Math.max(0, Math.min(100, 200 - payload.cross_mmr_pct));
          setRiskState({
            crossMmrPct: dangerPct,
            tier: payload.risk_tier,
          });
          break;
        }
        case "hedge_opened":
        case "hedge_closed":
        case "alert":
          addActivity({
            id: crypto.randomUUID(),
            type: event.type,
            timestamp_ms: event.timestamp_ms,
            payload: event.payload,
          });
          window.dispatchEvent(
            new CustomEvent("aegis:ws-event", { detail: event })
          );
          break;
      }
    }

    function cleanup() {
      if (pingRef.current) {
        clearInterval(pingRef.current);
        pingRef.current = null;
      }
    }

    connect();

    return () => {
      mountedRef.current = false;
      cleanup();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [wallet, setRiskState, addActivity]);
}
