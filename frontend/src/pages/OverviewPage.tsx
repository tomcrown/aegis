/**
 * Overview page — the one-glance dashboard.
 * Plain English labels, no jargon.
 */
import { useQuery } from "@tanstack/react-query";
import { useAegisStore } from "@/stores/useAegisStore";
import { useSolanaWallet } from "@/hooks/useSolanaWallet";
import { accountApi } from "@/services/api";
import { RingMeter } from "@/components/shared/RingMeter";
import { Sparkline } from "@/components/shared/Sparkline";
import { TierBadge } from "@/components/shared/Badge";

function SafetyScoreCard() {
  const riskState = useAegisStore((s) => s.riskState);
  const { address } = useSolanaWallet();

  const { data: sparklineData } = useQuery({
    queryKey: ["sparkline", address],
    queryFn: () => accountApi.getSparkline(address!),
    enabled: !!address,
    refetchInterval: 2_000,
  });

  const isHedge = riskState.tier === "hedge";
  const isWatch = riskState.tier === "watch";

  // Safety margin = how far from triggering auto-hedge
  const marginRatio = 200 - riskState.crossMmrPct;
  const triggerAt = 200 - riskState.threshold;
  const safetyBuffer = Math.max(0, marginRatio - triggerAt);

  return (
    <div className="card overflow-hidden">
      <div className={`flex items-center justify-between border-b border-aegis-border px-5 py-3 ${
        isHedge ? "bg-aegis-red/5" : isWatch ? "bg-aegis-amber/5" : "bg-aegis-green/5"
      }`}>
        <div className="flex items-center gap-2">
          <span className={isHedge ? "dot-red" : isWatch ? "dot-amber" : "dot-green"} />
          <span className="font-display text-xs font-semibold text-aegis-text">Account Safety</span>
        </div>
        <TierBadge tier={riskState.tier} />
      </div>

      <div className="flex flex-col items-center gap-5 p-6">
        <div className={isHedge || isWatch ? "animate-pulse-ring" : ""}>
          <RingMeter pct={riskState.crossMmrPct} size={200} thickness={14} tier={riskState.tier} />
        </div>

        {/* Plain-English stats */}
        <div className="grid w-full grid-cols-3 gap-2 rounded-xl border border-aegis-border bg-aegis-surface2 p-3">
          <div className="text-center">
            <div className="label mb-0.5">Margin Ratio</div>
            <div className="font-mono text-sm font-semibold text-aegis-text">{marginRatio.toFixed(1)}%</div>
            <div className="font-mono text-[9px] text-aegis-muted">current</div>
          </div>
          <div className="text-center border-x border-aegis-border">
            <div className="label mb-0.5">Auto-Hedge At</div>
            <div className="font-mono text-sm font-semibold text-aegis-text">{triggerAt.toFixed(0)}%</div>
            <div className="font-mono text-[9px] text-aegis-muted">trigger</div>
          </div>
          <div className="text-center">
            <div className="label mb-0.5">Safety Buffer</div>
            <div className={`font-mono text-sm font-semibold ${
              safetyBuffer < 5 ? "text-aegis-red" : safetyBuffer < 15 ? "text-aegis-amber" : "text-aegis-green"
            }`}>{safetyBuffer.toFixed(1)}%</div>
            <div className="font-mono text-[9px] text-aegis-muted">remaining</div>
          </div>
        </div>

        {/* 30s trend */}
        <div className="w-full rounded-xl border border-aegis-border bg-aegis-surface2 px-3 py-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="label">30s Trend</span>
            <span className="font-mono text-[10px] text-aegis-muted">margin ratio history</span>
          </div>
          <Sparkline values={sparklineData?.values ?? []} width={260} height={36} />
        </div>

        {/* Status message */}
        <div className={`w-full rounded-xl border px-4 py-3 text-center text-xs leading-relaxed ${
          isHedge
            ? "border-aegis-red/20 bg-aegis-red/5 text-aegis-red"
            : isWatch
            ? "border-aegis-amber/20 bg-aegis-amber/5 text-aegis-amber"
            : "border-aegis-green/20 bg-aegis-green/5 text-aegis-muted"
        }`}>
          {isHedge
            ? "⚡ Aegis is actively hedging your positions to prevent liquidation."
            : isWatch
            ? "⚠ Your margin is getting thin. Aegis is monitoring closely."
            : "✓ Your account is well-protected. Aegis is watching in the background."}
        </div>
      </div>
    </div>
  );
}

function PositionSummaryCard() {
  const positions = useAegisStore((s) => s.positions);
  const sentimentMap = useAegisStore((s) => s.sentimentMap);

  if (positions.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="section-title mb-4">Open Positions</h3>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-aegis-border bg-aegis-surface2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 12h6M12 9v6" />
            </svg>
          </div>
          <p className="text-sm text-aegis-muted">No open positions</p>
          <p className="text-xs text-aegis-muted opacity-60">Open a position on Pacifica to start protection</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-aegis-border px-5 py-3 flex items-center justify-between">
        <h3 className="font-display text-xs font-semibold text-aegis-text">Open Positions</h3>
        <span className="rounded-full bg-aegis-accent/10 px-2 py-0.5 font-mono text-[10px] text-aegis-accent">
          {positions.length} active
        </span>
      </div>
      <div className="divide-y divide-aegis-border/50">
        {positions.map((pos) => {
          const sentiment = sentimentMap[pos.symbol];
          const notional = parseFloat(pos.amount) * parseFloat(pos.entry_price);
          const liqDist = Math.random() * 20 + 5; // will be real from liquidation guard data
          return (
            <div key={pos.symbol} className="flex items-center justify-between px-5 py-3.5 hover:bg-aegis-surface2 transition-colors">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-aegis-border bg-aegis-surface2 font-display text-[10px] font-bold text-aegis-accent">
                  {pos.symbol.replace("USDT", "").slice(0, 3)}
                </div>
                <div>
                  <div className="font-display text-sm font-semibold text-aegis-text">{pos.symbol.replace("USDT", "")}</div>
                  <div className="flex items-center gap-1.5 font-mono text-[10px] text-aegis-muted">
                    <span className={pos.side === "long" ? "text-aegis-green" : "text-aegis-red"}>
                      {pos.side === "long" ? "↑ Long" : "↓ Short"}
                    </span>
                    <span>·</span>
                    <span>{pos.amount} units</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm font-semibold text-aegis-text">
                  ${notional.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </div>
                <div className="flex items-center justify-end gap-1 font-mono text-[10px]">
                  {sentiment && (
                    <span className={
                      sentiment.sentiment === "bearish" ? "text-aegis-red" :
                      sentiment.sentiment === "bullish" ? "text-aegis-green" :
                      "text-aegis-muted"
                    }>
                      {sentiment.sentiment === "bearish" ? "↓" : sentiment.sentiment === "bullish" ? "↑" : "→"}
                      {" "}{sentiment.sentiment}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AccountValueCard() {
  const { address } = useSolanaWallet();
  const { data: accountInfo } = useQuery({
    queryKey: ["account-info", address],
    queryFn: () => accountApi.getInfo(address!),
    enabled: !!address,
    refetchInterval: 5_000,
  });

  const equity = parseFloat(accountInfo?.account_equity ?? "0");
  const available = parseFloat(accountInfo?.available_to_spend ?? "0");
  const marginUsed = parseFloat(accountInfo?.total_margin_used ?? "0");

  return (
    <div className="card p-5">
      <div className="label mb-3">Account Overview</div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-aegis-muted">Total Equity</span>
          <span className="font-mono text-sm font-semibold text-aegis-text">
            ${equity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-aegis-muted">Available to Trade</span>
          <span className="font-mono text-sm font-semibold text-aegis-green">
            ${available.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-aegis-muted">Margin In Use</span>
          <span className="font-mono text-sm font-semibold text-aegis-amber">
            ${marginUsed.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        {marginUsed > 0 && equity > 0 && (
          <div className="pt-1">
            <div className="mb-1 flex justify-between font-mono text-[10px] text-aegis-muted">
              <span>Margin utilization</span>
              <span>{((marginUsed / equity) * 100).toFixed(1)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-aegis-surface2">
              <div
                className="h-full rounded-full bg-aegis-amber transition-all"
                style={{ width: `${Math.min(100, (marginUsed / equity) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AegisStatusCard() {
  const riskState = useAegisStore((s) => s.riskState);
  const activityLog = useAegisStore((s) => s.activityLog);
  const recentHedges = activityLog.filter((e) => e.type === "hedge_opened").slice(0, 3);

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="label">Aegis Engine</div>
        <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold ${
          riskState.aegisActive
            ? "bg-aegis-green/10 text-aegis-green"
            : "bg-aegis-muted/10 text-aegis-muted"
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${riskState.aegisActive ? "bg-aegis-green animate-pulse" : "bg-aegis-muted"}`} />
          {riskState.aegisActive ? "Active" : "Inactive"}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-lg bg-aegis-surface2 px-3 py-2">
          <span className="text-xs text-aegis-muted">Scan interval</span>
          <span className="font-mono text-xs text-aegis-text">500ms</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-aegis-surface2 px-3 py-2">
          <span className="text-xs text-aegis-muted">Hedges today</span>
          <span className="font-mono text-xs text-aegis-text">{recentHedges.length}</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-aegis-surface2 px-3 py-2">
          <span className="text-xs text-aegis-muted">Social signals</span>
          <span className="font-mono text-xs text-aegis-accent">Elfa AI</span>
        </div>
      </div>

      {recentHedges.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="label mb-1">Recent Actions</div>
          {recentHedges.map((e) => {
            const p = e.payload as Record<string, unknown>;
            return (
              <div key={e.id} className="flex items-center gap-2 rounded-lg border border-aegis-border px-2.5 py-2">
                <span className="text-[10px]">⚡</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[10px] text-aegis-text">
                    {String(p.symbol ?? "—")} hedge {String(p.side ?? "")} {String(p.amount ?? "")}
                  </div>
                </div>
                <span className="flex-shrink-0 font-mono text-[9px] text-aegis-muted">
                  {new Date(e.timestamp_ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function OverviewPage() {
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">

        {/* Left — Safety Score (main card) */}
        <div className="space-y-4 lg:col-span-5">
          <SafetyScoreCard />
        </div>

        {/* Right — stats + positions */}
        <div className="space-y-4 lg:col-span-7">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AccountValueCard />
            <AegisStatusCard />
          </div>
          <PositionSummaryCard />
        </div>

      </div>
    </div>
  );
}
