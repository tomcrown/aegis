/**
 * Dev mode simulation — FRONTEND ONLY. Never touches the backend.
 *
 * When enabled:
 *   - Intercepts the live crossMmrPct value from the store
 *   - Applies a synthetic price-drop effect: raises crossMmrPct by
 *     (simulatedPriceDrop / entryLeverage) scaled to push it toward threshold
 *   - Overrides the store's riskState with the simulated values
 *   - Simultaneously raises Elfa sentiment to "bearish" in the store
 *
 * The actual Pacifica API is never called with simulated data.
 * The backend never knows dev mode is on.
 */

import { useEffect, useRef } from "react";
import { useAegisStore } from "@/stores/useAegisStore";
import { Sentiment } from "@/types";

// How aggressively the simulated drop pushes MMR up (tuned for demo)
const BASE_MMR_BOOST = 55; // adds ~55% cross_mmr on top of current

export function useDevModeSimulation(): void {
  const devMode = useAegisStore((s) => s.devMode);
  const setRiskState = useAegisStore((s) => s.setRiskState);
  const setSentiment = useAegisStore((s) => s.setSentiment);
  const positions = useAegisStore((s) => s.positions);
  const realMmrRef = useRef<number>(0);
  const activeRef = useRef(false);

  // Capture real MMR before simulation starts
  const realMmrLive = useAegisStore((s) => s.riskState.crossMmrPct);

  useEffect(() => {
    if (devMode.enabled) {
      // Snapshot the real MMR when simulation turns on
      if (!activeRef.current) {
        realMmrRef.current = realMmrLive;
        activeRef.current = true;
      }

      // Simulate price drop: push crossMmrPct up toward / past threshold
      const drop = devMode.simulatedPriceDrop; // default 4%
      const simulatedMmrPct = Math.min(
        99,
        realMmrRef.current + BASE_MMR_BOOST * (drop / 4)
      );
      const tier =
        simulatedMmrPct >= 85
          ? "hedge"
          : simulatedMmrPct >= 70
            ? "watch"
            : "safe";

      setRiskState({ crossMmrPct: simulatedMmrPct, tier });

      // Simulate bearish Elfa sentiment for each open position
      const symbols = positions.map((p) => p.symbol);
      symbols.forEach((symbol) => {
        setSentiment({
          symbol,
          score: 18,
          sentiment: "bearish" as Sentiment,
        });
      });
    } else {
      // Simulation turned off — restore real values on next WS tick
      // (WS handler will overwrite riskState naturally)
      activeRef.current = false;
    }
  }, [devMode.enabled, devMode.simulatedPriceDrop, positions, setRiskState, setSentiment, realMmrLive]);
}
