/**
 * Protection page — hedge settings, threshold, activate/deactivate, hedge history.
 */
import { useRef, useState } from "react";
import { useAegisStore } from "@/stores/useAegisStore";
import { useSolanaWallet } from "@/hooks/useSolanaWallet";
import { accountApi } from "@/services/api";
import { LiquidationGuard } from "@/components/dashboard/LiquidationGuard";
import type { ActivityEvent } from "@/types";

function HedgeControls() {
  const riskState = useAegisStore((s) => s.riskState);
  const setRiskState = useAegisStore((s) => s.setRiskState);
  const devMode = useAegisStore((s) => s.devMode);
  const { address } = useSolanaWallet();

  const [demoLoading, setDemoLoading] = useState(false);
  const [demoResult, setDemoResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  async function handleDemoTrigger() {
    if (!address) return;
    setDemoLoading(true);
    setDemoResult(null);
    try {
      const r = await accountApi.demoTriggerHedge(address);
      setDemoResult({
        ok: true,
        msg: `Order #${r.order_id} — ${r.amount} ${r.symbol} ${r.side.toUpperCase()}`,
      });
    } catch (err) {
      setDemoResult({
        ok: false,
        msg: err instanceof Error ? err.message : "Trigger failed",
      });
    } finally {
      setDemoLoading(false);
    }
  }

  const triggerAt = 200 - riskState.threshold;

  return (
    <div className="card p-6">
      <div className="mb-5">
        <h3 className="font-display text-base font-bold text-aegis-text">
          Aegis Protection
        </h3>
        <p className="mt-1 text-sm text-aegis-muted">
          Set when Aegis automatically hedges your positions.
        </p>
      </div>

      {/* Status banner */}
      <div
        className={`mb-5 flex items-center gap-3 rounded-xl border px-4 py-3 ${
          riskState.aegisActive
            ? "border-aegis-green/20 bg-aegis-green/5"
            : "border-aegis-border bg-aegis-surface2"
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${riskState.aegisActive ? "bg-aegis-green animate-pulse" : "bg-aegis-muted"}`}
        />
        <div>
          <p
            className={`font-display text-sm font-semibold ${riskState.aegisActive ? "text-aegis-green" : "text-aegis-muted"}`}
          >
            {riskState.aegisActive
              ? "Protection Active"
              : "Protection Inactive"}
          </p>
          <p className="font-mono text-xs text-aegis-muted">
            {riskState.aegisActive
              ? "Aegis is monitoring your account 24/7 and will hedge automatically."
              : "Enable protection to start automated risk management."}
          </p>
        </div>
      </div>

      {/* Threshold slider */}
      <div className="mb-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display text-sm font-semibold text-aegis-text">
              Auto-Hedge Trigger
            </div>
            <div className="font-mono text-xs text-aegis-muted">
              When margin ratio drops below this, Aegis hedges
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-lg font-bold text-aegis-accent">
              {triggerAt.toFixed(0)}%
            </div>
            <div className="font-mono text-[10px] text-aegis-muted">
              margin ratio
            </div>
          </div>
        </div>

        <input
          type="range"
          min={50}
          max={95}
          step={5}
          value={riskState.threshold}
          onChange={(e) => {
            const val = Number(e.target.value);
            setRiskState({ threshold: val });
            // Debounce-save to backend (500ms after last change)
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            if (address && riskState.aegisActive) {
              saveTimerRef.current = setTimeout(() => {
                void accountApi.updateThreshold(address, val);
              }, 500);
            }
          }}
          className="w-full cursor-pointer accent-aegis-accent"
        />

        <div className="flex justify-between font-mono text-[10px] text-aegis-muted">
          <span>Conservative (trigger early)</span>
          <span>Aggressive (trigger late)</span>
        </div>

        {/* Visual scale */}
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-aegis-border bg-aegis-surface2 p-3 text-center font-mono text-xs">
          <div>
            <div className="text-aegis-green font-semibold">
              &gt;{triggerAt}%
            </div>
            <div className="text-aegis-muted text-[10px]">Safe — no action</div>
          </div>
          <div className="border-x border-aegis-border">
            <div className="text-aegis-amber font-semibold">
              {(triggerAt - 10).toFixed(0)}–{triggerAt}%
            </div>
            <div className="text-aegis-muted text-[10px]">Warning zone</div>
          </div>
          <div>
            <div className="text-aegis-red font-semibold">&lt;{triggerAt}%</div>
            <div className="text-aegis-muted text-[10px]">Auto-hedge fires</div>
          </div>
        </div>
      </div>

      {/* Toggle button */}
      <button
        onClick={() => void handleToggle()}
        disabled={!address}
        className={`w-full rounded-xl py-3.5 font-display text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-40 ${
          riskState.aegisActive ? "btn-danger" : "btn-primary"
        }`}
      >
        {riskState.aegisActive
          ? "Deactivate Protection"
          : "Activate Protection"}
      </button>

      {/* Demo trigger — dev only */}
      {devMode.enabled && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="h-px flex-1 bg-aegis-border" />
            <span className="font-mono text-[10px] text-aegis-amber">
              Dev Mode
            </span>
            <span className="h-px flex-1 bg-aegis-border" />
          </div>
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
            ) : (
              "Test Protection (Place Hedge)"
            )}
          </button>
          {demoResult && (
            <div
              className={`rounded-lg border px-3 py-2 text-center font-mono text-xs ${
                demoResult.ok
                  ? "border-aegis-green/20 bg-aegis-green/5 text-aegis-green"
                  : "border-aegis-red/20 bg-aegis-red/5 text-aegis-red"
              }`}
            >
              {demoResult.msg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HedgeMultiplierInfo() {
  const signals = [
    {
      sentiment: "Bearish",
      pct: 75,
      color: "#EF4444",
      bg: "rgba(239,68,68,0.06)",
      border: "rgba(239,68,68,0.15)",
      glow: "rgba(239,68,68,0.3)",
      desc: "Social sentiment is negative — large hedge to absorb downside.",
    },
    {
      sentiment: "Neutral",
      pct: 50,
      color: "#F59E0B",
      bg: "rgba(245,158,11,0.06)",
      border: "rgba(245,158,11,0.15)",
      glow: "rgba(245,158,11,0.3)",
      desc: "No strong signal — balanced hedge, half position size.",
    },
    {
      sentiment: "Bullish",
      pct: 25,
      color: "#22C55E",
      bg: "rgba(34,197,94,0.06)",
      border: "rgba(34,197,94,0.15)",
      glow: "rgba(34,197,94,0.3)",
      desc: "Social is positive — light hedge, preserve upside exposure.",
    },
  ];

  return (
    <div className="card p-6">
      <h3 className="font-display text-base font-bold text-aegis-text mb-1">
        How Aegis Hedges
      </h3>
      <p className="text-sm text-aegis-muted mb-5">
        Aegis reads social signals to size your hedge intelligently — not a
        one-size-fits-all approach.
      </p>

      <div className="space-y-3">
        {signals.map(({ sentiment, pct, color, bg, border, glow, desc }) => (
          <div
            key={sentiment}
            className="rounded-xl p-4 transition-all duration-200"
            style={{ background: bg, border: `1px solid ${border}` }}
          >
            <div className="flex items-center gap-4">
              {/* Bar + percentage */}
              <div className="flex w-24 shrink-0 flex-col gap-1.5">
                <div className="flex items-baseline gap-1">
                  <span
                    className="font-display text-xl font-bold tabular-nums"
                    style={{ color, textShadow: `0 0 12px ${glow}` }}
                  >
                    {pct}%
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1 w-full overflow-hidden rounded-full bg-aegis-surface2">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${pct}%`,
                      background: color,
                      boxShadow: `0 0 6px ${glow}`,
                    }}
                  />
                </div>
              </div>

              {/* Divider */}
              <div
                className="h-8 w-px shrink-0"
                style={{ background: border }}
              />

              {/* Text */}
              <div className="min-w-0 flex-1">
                <div
                  className="font-display text-sm font-semibold"
                  style={{ color }}
                >
                  {sentiment} Signal
                </div>
                <div className="mt-0.5 text-xs leading-relaxed text-aegis-muted">
                  {desc}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Scale legend */}
      <div className="mt-4 flex items-center justify-between rounded-lg border border-aegis-border bg-aegis-surface2 px-3 py-2">
        <span className="font-mono text-[10px] text-aegis-muted">
          Hedge size scale
        </span>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-aegis-green">Light</span>
          <div
            className="h-1 w-16 rounded-full"
            style={{
              background: "linear-gradient(90deg, #22C55E, #F59E0B, #EF4444)",
            }}
          />
          <span className="font-mono text-[10px] text-aegis-red">Heavy</span>
        </div>
      </div>
    </div>
  );
}

function ActivityLog() {
  const activityLog = useAegisStore((s) => s.activityLog);

  const getIcon = (type: ActivityEvent["type"]) => {
    switch (type) {
      case "hedge_opened":
        return {
          icon: "⚡",
          color: "text-aegis-accent",
          bg: "bg-aegis-accent/10",
        };
      case "hedge_closed":
        return {
          icon: "✓",
          color: "text-aegis-green",
          bg: "bg-aegis-green/10",
        };
      case "alert":
        return {
          icon: "⚠",
          color: "text-aegis-amber",
          bg: "bg-aegis-amber/10",
        };
      default:
        return {
          icon: "·",
          color: "text-aegis-muted",
          bg: "bg-aegis-surface2",
        };
    }
  };

  const getLabel = (e: ActivityEvent) => {
    const p = e.payload as Record<string, unknown>;
    switch (e.type) {
      case "hedge_opened":
        return `Hedge opened — ${String(p.symbol ?? "")} ${String(p.side ?? "")} ${String(p.amount ?? "")}`;
      case "hedge_closed":
        return `Hedge closed — ${String(p.symbol ?? "")}`;
      case "alert":
        return String(p.message ?? "Alert received");
      default:
        return "Event received";
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-aegis-border px-5 py-3 flex items-center justify-between">
        <h3 className="font-display text-xs font-semibold text-aegis-text">
          Protection Activity
        </h3>
        {activityLog.length > 0 && (
          <span className="rounded-full bg-aegis-accent/10 px-2 py-0.5 font-mono text-[10px] text-aegis-accent">
            {activityLog.length} events
          </span>
        )}
      </div>

      {activityLog.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-aegis-border bg-aegis-surface2 text-xl">
            🛡
          </div>
          <p className="text-sm text-aegis-muted">No activity yet</p>
          <p className="text-xs text-aegis-muted opacity-60">
            Hedge events and alerts will appear here in real-time
          </p>
        </div>
      ) : (
        <div className="divide-y divide-aegis-border/40 max-h-80 overflow-y-auto">
          {activityLog.map((e) => {
            const { icon, color, bg } = getIcon(e.type);
            const narrative = (e.payload as Record<string, unknown>)
              .narrative as string | undefined;
            return (
              <div
                key={e.id}
                className="flex items-start gap-3 px-5 py-3.5 hover:bg-aegis-surface2 transition-colors"
              >
                <div
                  className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg ${bg} ${color} text-xs`}
                >
                  {icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-aegis-text">
                    {getLabel(e)}
                  </p>
                  {narrative && (
                    <p className="mt-0.5 text-xs leading-relaxed text-aegis-muted italic">
                      {narrative}
                    </p>
                  )}
                </div>
                <span className="flex-shrink-0 font-mono text-[10px] text-aegis-muted">
                  {new Date(e.timestamp_ms).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ProtectionPage() {
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left column */}
        <div className="space-y-5 lg:col-span-5">
          <HedgeControls />
          <LiquidationGuard />
        </div>

        {/* Right column */}
        <div className="space-y-5 lg:col-span-7">
          <HedgeMultiplierInfo />
          <ActivityLog />
        </div>
      </div>
    </div>
  );
}
