/**
 * Liquidation Guard — shows liquidation price, USD distance, and safety buffer bar per position.
 * Updates in real-time via positions refetch.
 */
import { useQuery } from "@tanstack/react-query";
import { useSolanaWallet } from "@/hooks/useSolanaWallet";
import { useAegisStore } from "@/stores/useAegisStore";
import { accountApi } from "@/services/api";
import type { Position } from "@/types";

function fmt(n: string, decimals = 2) {
  return parseFloat(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function GuardRow({ pos, markPrice }: { pos: Position; markPrice?: number }) {
  const entry = parseFloat(pos.entry_price);
  const liq = parseFloat(pos.liquidation_price || "0");
  // Use live mark price if available, fall back to entry
  const current = markPrice ?? entry;

  const distPct =
    liq && current
      ? pos.side === "long"
        ? ((current - liq) / current) * 100
        : ((liq - current) / current) * 100
      : null;

  const distUsd = liq && current ? Math.abs(current - liq) : null;

  const danger = distPct !== null && distPct < 5;
  const warn = distPct !== null && distPct >= 5 && distPct < 15;
  const safe = distPct !== null && distPct >= 15;

  const barColor = danger
    ? "bg-aegis-red"
    : warn
      ? "bg-aegis-amber"
      : "bg-aegis-green";
  const textColor = danger
    ? "text-aegis-red"
    : warn
      ? "text-aegis-amber"
      : "text-aegis-green";
  const dotClass = danger ? "dot-red" : warn ? "dot-amber" : "dot-green";

  return (
    <div className="rounded-lg border border-aegis-border bg-aegis-surface2 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={dotClass} />
          <span className="font-display text-sm font-semibold text-aegis-text">
            {pos.symbol}-PERP
          </span>
          <span
            className={`rounded px-1.5 py-0.5 font-display text-[10px] font-semibold ${
              pos.side === "long"
                ? "bg-aegis-green/10 text-aegis-green"
                : "bg-aegis-red/10 text-aegis-red"
            }`}
          >
            {pos.side === "long" ? "↑ LONG" : "↓ SHORT"}
          </span>
        </div>
        {distPct !== null && (
          <span className={`font-display text-xs font-bold ${textColor}`}>
            {distPct.toFixed(2)}% buffer
          </span>
        )}
      </div>

      {/* Key numbers */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-md border border-aegis-border bg-aegis-surface px-2.5 py-2 text-center">
          <div className="label mb-0.5">
            {markPrice ? "Mark Price" : "Entry"}
          </div>
          <div className="font-mono text-xs font-semibold text-aegis-text">
            ${fmt(markPrice ? markPrice.toString() : pos.entry_price)}
            {markPrice && (
              <span className="ml-1 inline-block h-1 w-1 rounded-full bg-aegis-green animate-pulse" />
            )}
          </div>
        </div>
        <div
          className={`rounded-md border px-2.5 py-2 text-center ${danger ? "border-aegis-red/30 bg-aegis-red/5" : "border-aegis-border bg-aegis-surface"}`}
        >
          <div className="label mb-0.5">Liquidation</div>
          <div
            className={`font-mono text-xs font-semibold ${danger ? "text-aegis-red" : "text-aegis-text"}`}
          >
            {liq ? `$${fmt(pos.liquidation_price ?? "0")}` : "—"}
          </div>
        </div>
        <div className="rounded-md border border-aegis-border bg-aegis-surface px-2.5 py-2 text-center">
          <div className="label mb-0.5">Distance</div>
          <div className={`font-mono text-xs font-semibold ${textColor}`}>
            {distUsd ? `$${fmt(distUsd.toString(), 0)}` : "—"}
          </div>
        </div>
      </div>

      {/* Buffer bar */}
      {distPct !== null && (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-aegis-border">
            <div
              className={`h-full rounded-full transition-all duration-700 ${barColor}`}
              style={{ width: `${Math.min(distPct * 2, 100)}%` }}
            />
          </div>
          <div className="flex justify-between font-mono text-[10px] text-aegis-muted">
            <span className="text-aegis-red">Liquidation</span>
            <span className="text-aegis-green">Safe Zone</span>
          </div>
        </div>
      )}

      {danger && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-aegis-red/30 bg-aegis-red/5 px-3 py-2">
          <span className="dot-red animate-blink" />
          <span className="font-display text-xs font-semibold text-aegis-red">
            Critically close to liquidation — Aegis will hedge automatically
          </span>
        </div>
      )}
    </div>
  );
}

export function LiquidationGuard() {
  const { address } = useSolanaWallet();
  const markPrices = useAegisStore((s) => s.markPrices);

  const { data: positions = [], isLoading } = useQuery({
    queryKey: ["positions", address],
    queryFn: () => accountApi.getPositions(address),
    enabled: !!address,
    refetchInterval: 10_000, // positions are fairly static; mark prices come via WS
  });

  return (
    <div
      className="card animate-fade-in delay-200"
      style={{ animationFillMode: "backwards" }}
    >
      <div className="flex items-center gap-2 border-b border-aegis-border px-5 py-3.5">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 1L2 4V8C2 11.3 4.7 14.4 8 15C11.3 14.4 14 11.3 14 8V4L8 1Z"
            stroke="#EF4444"
            strokeWidth="1.5"
            fill="none"
          />
          <path
            d="M8 6v3M8 11v.5"
            stroke="#EF4444"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <h2 className="font-display text-sm font-semibold text-aegis-text">
          Liquidation Guard
        </h2>
        <span className="ml-auto font-mono text-[10px] text-aegis-muted">
          live · 500ms via WS
        </span>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-lg bg-aegis-border"
              />
            ))}
          </div>
        ) : positions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path
                d="M16 2L4 8V16C4 22.6 9.4 28.8 16 30C22.6 28.8 28 22.6 28 16V8L16 2Z"
                stroke="#1C2333"
                strokeWidth="2"
                fill="none"
              />
              <path
                d="M11 16L14 19L21 12"
                stroke="#374151"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="text-sm text-aegis-muted">No positions to guard</p>
          </div>
        ) : (
          <div className="space-y-3">
            {positions.map((pos) => (
              <GuardRow
                key={`${pos.symbol}-${pos.side}`}
                pos={pos}
                markPrice={markPrices[pos.symbol]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
