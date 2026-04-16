import { useEffect, useRef } from "react";
import { useAegisStore } from "@/stores/useAegisStore";
import { Sentiment } from "@/types";

const BASE_MMR_BOOST = 55;

export function useDevModeSimulation(): void {
  const devMode = useAegisStore((s) => s.devMode);
  const setRiskState = useAegisStore((s) => s.setRiskState);
  const setSentiment = useAegisStore((s) => s.setSentiment);
  const positions = useAegisStore((s) => s.positions);
  const realMmrRef = useRef<number>(0);
  const activeRef = useRef(false);

  const realMmrLive = useAegisStore((s) => s.riskState.crossMmrPct);

  useEffect(() => {
    if (devMode.enabled) {
      if (!activeRef.current) {
        realMmrRef.current = realMmrLive;
        activeRef.current = true;
      }

      const drop = devMode.simulatedPriceDrop;
      const simulatedMmrPct = Math.min(
        99,
        realMmrRef.current + BASE_MMR_BOOST * (drop / 4),
      );
      const tier =
        simulatedMmrPct >= 90
          ? "hedge"
          : simulatedMmrPct >= 80
            ? "watch"
            : "safe";

      setRiskState({ crossMmrPct: simulatedMmrPct, tier });

      const symbols = positions.map((p) => p.symbol);
      symbols.forEach((symbol) => {
        setSentiment({
          symbol,
          score: 18,
          sentiment: "bearish" as Sentiment,
        });
      });
    } else {
      activeRef.current = false;
    }
  }, [
    devMode.enabled,
    devMode.simulatedPriceDrop,
    positions,
    setRiskState,
    setSentiment,
    realMmrLive,
  ]);
}
