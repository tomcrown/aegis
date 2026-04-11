/**
 * Health meter — large ring showing cross_mmr risk level.
 * Shows current tier badge, Aegis toggle, and threshold slider.
 */

import { useState } from "react";
import { useAegisStore } from "@/stores/useAegisStore";
import { accountApi } from "@/services/api";
import { TierBadge } from "@/components/shared/Badge";
import { RingMeter } from "@/components/shared/RingMeter";
import { useSolanaWallet } from "@/hooks/useSolanaWallet";

export function HealthMeter() {
  const riskState = useAegisStore((s) => s.riskState);
  const setRiskState = useAegisStore((s) => s.setRiskState);
  const devMode = useAegisStore((s) => s.devMode);

  const { address: walletAddress } = useSolanaWallet();
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoResult, setDemoResult] = useState<string | null>(null);

  async function handleDemoTrigger() {
    if (!walletAddress) return;
    setDemoLoading(true);
    setDemoResult(null);
    try {
      const result = await accountApi.demoTriggerHedge(walletAddress);
      setDemoResult(`Hedge placed! Order #${result.order_id} — ${result.amount} ${result.symbol} ${result.side}`);
    } catch (err) {
      setDemoResult(err instanceof Error ? err.message : "Trigger failed");
    } finally {
      setDemoLoading(false);
    }
  }

  async function handleAegisToggle() {
    if (!walletAddress) return;

    if (riskState.aegisActive) {
      await accountApi.deactivateAegis(walletAddress);
      setRiskState({ aegisActive: false });
    } else {
      await accountApi.activateAegis(walletAddress, riskState.threshold);
      setRiskState({ aegisActive: true });
    }
  }

  return (
    <div className="rounded-xl border border-aegis-border bg-aegis-surface p-6">
      <div className="flex flex-col items-center gap-4">
        {/* Ring meter — dev mode applies simulated value from store */}
        <RingMeter pct={riskState.crossMmrPct} size={220} thickness={18} />

        <div className="flex items-center gap-2">
          <TierBadge tier={riskState.tier} />
          {devMode.enabled && (
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
              simulated
            </span>
          )}
        </div>

        {/* Threshold slider */}
        <div className="w-full">
          <div className="mb-1 flex justify-between text-xs text-aegis-muted">
            <span>Hedge threshold</span>
            <span className="font-mono text-white">{riskState.threshold}%</span>
          </div>
          <input
            type="range"
            min={50}
            max={95}
            step={5}
            value={riskState.threshold}
            onChange={(e) =>
              setRiskState({ threshold: Number(e.target.value) })
            }
            className="w-full accent-aegis-accent"
          />
        </div>

        {/* Aegis toggle */}
        <button
          onClick={() => void handleAegisToggle()}
          disabled={!walletAddress}
          className={`w-full rounded-xl py-3 font-semibold transition ${
            riskState.aegisActive
              ? "bg-aegis-red/20 text-aegis-red hover:bg-aegis-red/30"
              : "bg-aegis-accent text-white hover:opacity-90"
          } disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {riskState.aegisActive ? "Deactivate Aegis" : "Activate Aegis Protection"}
        </button>

        {/* Demo trigger — only visible in dev mode */}
        {devMode.enabled && (
          <div className="w-full space-y-2">
            <button
              onClick={() => void handleDemoTrigger()}
              disabled={demoLoading || !walletAddress}
              className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 py-2.5 text-sm font-semibold text-amber-400 hover:bg-amber-500/20 disabled:opacity-50"
            >
              {demoLoading ? "Placing hedge..." : "Force Trigger Hedge (Demo)"}
            </button>
            {demoResult && (
              <p className="rounded-lg bg-aegis-bg px-3 py-2 text-center text-xs text-aegis-muted">
                {demoResult}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
