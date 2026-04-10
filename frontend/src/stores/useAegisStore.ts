/**
 * Global Zustand store — Aegis operational state.
 * Dev mode simulation lives here and NOWHERE else (not sent to backend).
 */
import { create } from "zustand";
import type { DevModeState, Position, RiskState, SentimentData } from "@/types";

interface AegisStore {
  // ── Risk ────────────────────────────────────────────────────────────────
  riskState: RiskState;
  setRiskState: (s: Partial<RiskState>) => void;

  // ── Positions ────────────────────────────────────────────────────────────
  positions: Position[];
  setPositions: (p: Position[]) => void;

  // ── Sentiment ────────────────────────────────────────────────────────────
  sentimentMap: Record<string, SentimentData>; // keyed by symbol
  setSentiment: (s: SentimentData) => void;

  // ── Dev mode (frontend-only simulation) ──────────────────────────────────
  devMode: DevModeState;
  setDevMode: (d: Partial<DevModeState>) => void;
}

export const useAegisStore = create<AegisStore>((set) => ({
  riskState: {
    crossMmrPct: 0,
    tier: "safe",
    aegisActive: false,
    threshold: 75,
  },
  setRiskState: (s) =>
    set((prev) => ({ riskState: { ...prev.riskState, ...s } })),

  positions: [],
  setPositions: (positions) => set({ positions }),

  sentimentMap: {},
  setSentiment: (s) =>
    set((prev) => ({
      sentimentMap: { ...prev.sentimentMap, [s.symbol]: s },
    })),

  devMode: {
    enabled: false,
    simulatedPriceDrop: 4,
  },
  setDevMode: (d) =>
    set((prev) => ({ devMode: { ...prev.devMode, ...d } })),
}));
