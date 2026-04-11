/**
 * Global Zustand store — Aegis operational state.
 */
import { create } from "zustand";
import type { ActivityEvent, DevModeState, Position, RiskState, SentimentData } from "@/types";

interface AegisStore {
  riskState: RiskState;
  setRiskState: (s: Partial<RiskState>) => void;

  positions: Position[];
  setPositions: (p: Position[]) => void;

  sentimentMap: Record<string, SentimentData>;
  setSentiment: (s: SentimentData) => void;

  // Live mark prices from WS — symbol → price
  markPrices: Record<string, number>;
  setMarkPrices: (p: Record<string, number>) => void;

  // Activity log — last 50 WS events for Protection page history
  activityLog: ActivityEvent[];
  addActivity: (e: ActivityEvent) => void;

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

  markPrices: {},
  setMarkPrices: (p) =>
    set((prev) => ({ markPrices: { ...prev.markPrices, ...p } })),

  activityLog: [],
  addActivity: (e) =>
    set((prev) => ({
      activityLog: [e, ...prev.activityLog].slice(0, 50),
    })),

  devMode: {
    enabled: false,
    simulatedPriceDrop: 4,
  },
  setDevMode: (d) =>
    set((prev) => ({ devMode: { ...prev.devMode, ...d } })),
}));
