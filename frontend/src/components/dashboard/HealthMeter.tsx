/**
 * Health meter — ring + tier badge + Aegis toggle + threshold + demo trigger.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAegisStore } from "@/stores/useAegisStore";
import { accountApi } from "@/services/api";
import { TierBadge } from "@/components/shared/Badge";
import { RingMeter } from "@/components/shared/RingMeter";
import { Sparkline } from "@/components/shared/Sparkline";
import { useSolanaWallet } from "@/hooks/useSolanaWallet";

export function HealthMeter() {
  const riskState  = useAegisStore((s) => s.riskState);
  const setRiskState = useAegisStore((s) => s.setRiskState);
  const devMode    = useAegisStore((s) => s.devMode);
  const { address } = useSolanaWallet();

  const [demoLoading, setDemoLoading] = useState(false);
  const [demoResult, setDemoResult]   = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleDemoTrigger() {
    if (!address) return;
    setDemoLoading(true);
    setDemoResult(null);
    try {
      const r = await accountApi.demoTriggerHedge(address);
      setDemoResult({ ok: true, msg: `Order #${r.order_id} placed — ${r.amount} ${r.symbol} ${r.side.toUpperCase()}` });
    } catch (err) {
      setDemoResult({ ok: false, msg: err instanceof Error ? err.message : "Trigger failed" });
    } finally {
      setDemoLoading(false);
    }
  }

  async function handleToggle() {
    if (!address) return;
    if (riskState.aegisActive) {
      await accountApi.deactivateAegis(address);
      setRiskState({ aegisActive: false });
    } else {
      await accountApi.activateAegis(address, riskState.threshold);
      setRiskState({ aegisActive: true });
    }
  }

  const { data: sparklineData } = useQuery({
    queryKey: ["sparkline", address],
    queryFn: () => accountApi.getSparkline(address!),
    enabled: !!address,
    refetchInterval: 2_000,
  });

  const isHedge = riskState.tier === "hedge";
  const isWatch = riskState.tier === "watch";

  return (
    <div className="card overflow-hidden animate-fade-in">
      {/* Status bar */}
      <div className={`flex items-center justify-between border-b border-aegis-border px-5 py-3 ${
        isHedge ? "bg-aegis-red/5" : isWatch ? "bg-aegis-amber/5" : "bg-aegis-green/5"
      }`}>
        <div className="flex items-center gap-2">
          <span className={isHedge ? "dot-red" : isWatch ? "dot-amber" : "dot-green"} />
          <span className="font-display text-xs font-semibold text-aegis-text">
            Account Health
          </span>
        </div>
        <div className="flex items-center gap-2">
          <TierBadge tier={riskState.tier} />
          {devMode.enabled && (
            <span className="rounded border border-aegis-amber/30 bg-aegis-amber/10 px-2 py-0.5 font-mono text-[10px] text-aegis-amber">
              SIM
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-5 p-6">
        {/* Ring */}
        <div className={isHedge || isWatch ? "animate-pulse-ring" : ""}>
          <RingMeter pct={riskState.crossMmrPct} size={210} thickness={14} tier={riskState.tier} />
        </div>

        {/* Sparkline — cross_mmr history */}
        <div className="w-full rounded-lg border border-aegis-border bg-aegis-surface2 px-3 py-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="label">30s History</span>
            <span className="font-mono text-[10px] text-aegis-muted">cross_mmr trend</span>
          </div>
          <Sparkline
            values={sparklineData?.values ?? []}
            width={260}
            height={36}
          />
        </div>

        {/* cross_mmr raw value */}
        <div className="flex items-center gap-4 rounded-lg border border-aegis-border bg-aegis-surface2 px-4 py-2.5 w-full justify-center">
          <div className="text-center">
            <div className="label">cross_mmr</div>
            <div className="font-mono text-sm font-semibold text-aegis-text">
              {(200 - riskState.crossMmrPct).toFixed(2)}%
            </div>
          </div>
          <div className="h-6 w-px bg-aegis-border" />
          <div className="text-center">
            <div className="label">trigger at</div>
            <div className="font-mono text-sm font-semibold text-aegis-text">
              {(200 - riskState.threshold).toFixed(0)}%
            </div>
          </div>
          <div className="h-6 w-px bg-aegis-border" />
          <div className="text-center">
            <div className="label">buffer</div>
            <div className={`font-mono text-sm font-semibold ${
              riskState.crossMmrPct >= 90 ? "text-aegis-red" :
              riskState.crossMmrPct >= 80 ? "text-aegis-amber" : "text-aegis-green"
            }`}>
              {Math.max(0, 200 - riskState.crossMmrPct - riskState.threshold + 90).toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Threshold slider */}
        <div className="w-full space-y-2">
          <div className="flex justify-between">
            <span className="label">Hedge Threshold</span>
            <span className="font-mono text-xs font-semibold text-aegis-text">
              cross_mmr ≤ {(200 - riskState.threshold).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min={50} max={95} step={5}
            value={riskState.threshold}
            onChange={(e) => setRiskState({ threshold: Number(e.target.value) })}
            className="w-full cursor-pointer accent-aegis-accent"
          />
          <div className="flex justify-between font-mono text-[10px] text-aegis-muted">
            <span>Conservative</span>
            <span>Aggressive</span>
          </div>
        </div>

        {/* Aegis toggle */}
        <button
          onClick={() => void handleToggle()}
          disabled={!address}
          className={`w-full rounded-xl py-3 font-display text-sm font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
            riskState.aegisActive
              ? "btn-danger"
              : "btn-primary"
          }`}
        >
          {riskState.aegisActive ? "Deactivate Aegis" : "Activate Protection"}
        </button>

        {/* Demo trigger — dev mode only */}
        {devMode.enabled && (
          <div className="w-full space-y-2">
            <button
              onClick={() => void handleDemoTrigger()}
              disabled={demoLoading || !address}
              className="w-full rounded-xl border border-aegis-amber/30 bg-aegis-amber/5 py-2.5 font-display text-sm font-semibold text-aegis-amber transition hover:bg-aegis-amber/10 active:scale-[0.98] disabled:opacity-50"
            >
              {demoLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-3 w-3 animate-spin rounded-full border border-aegis-amber border-t-transparent" />
                  Placing hedge...
                </span>
              ) : "Force Trigger Hedge"}
            </button>
            {demoResult && (
              <div className={`rounded-lg border px-3 py-2 text-center font-mono text-xs ${
                demoResult.ok
                  ? "border-aegis-green/20 bg-aegis-green/5 text-aegis-green"
                  : "border-aegis-red/20 bg-aegis-red/5 text-aegis-red"
              }`}>
                {demoResult.msg}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
