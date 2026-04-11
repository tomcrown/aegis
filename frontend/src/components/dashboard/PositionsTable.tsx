/**
 * Positions table — live open positions with liquidation distance.
 */
import { useQuery } from "@tanstack/react-query";
import { useSolanaWallet } from "@/hooks/useSolanaWallet";
import { accountApi } from "@/services/api";
import type { Position } from "@/types";

function fmt(n: string, decimals = 2) {
  return parseFloat(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function SideChip({ side }: { side: Position["side"] }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-display text-xs font-semibold ${
      side === "long"
        ? "bg-aegis-green/10 text-aegis-green"
        : "bg-aegis-red/10 text-aegis-red"
    }`}>
      {side === "long" ? "↑" : "↓"} {side.toUpperCase()}
    </span>
  );
}

function LiqBar({ entry, liq, side }: { entry: string; liq: string; side: string }) {
  const e = parseFloat(entry);
  const l = parseFloat(liq);
  if (!l || !e) return <span className="text-aegis-muted">—</span>;

  const dist = side === "long"
    ? ((e - l) / e) * 100
    : ((l - e) / e) * 100;

  const clamped = Math.max(0, Math.min(100, dist));
  const color = clamped < 5 ? "bg-aegis-red" : clamped < 15 ? "bg-aegis-amber" : "bg-aegis-green";

  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-16 overflow-hidden rounded-full bg-aegis-border">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.min(clamped, 100)}%` }} />
      </div>
      <span className={`font-mono text-xs ${clamped < 5 ? "text-aegis-red" : clamped < 15 ? "text-aegis-amber" : "text-aegis-muted"}`}>
        {clamped.toFixed(1)}%
      </span>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr>
      {[1,2,3,4,5].map(i => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 animate-pulse rounded bg-aegis-border" style={{ width: `${40 + i * 10}%` }} />
        </td>
      ))}
    </tr>
  );
}

export function PositionsTable() {
  const { address } = useSolanaWallet();

  const { data: positions = [], isLoading } = useQuery({
    queryKey: ["positions", address],
    queryFn: () => accountApi.getPositions(address),
    enabled: !!address,
    refetchInterval: 5_000,
  });

  return (
    <div className="card animate-fade-in delay-200" style={{ animationFillMode: "backwards" }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-aegis-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="dot-blue" />
          <h2 className="font-display text-sm font-semibold text-aegis-text">Open Positions</h2>
        </div>
        {positions.length > 0 && (
          <span className="rounded-full border border-aegis-border bg-aegis-surface2 px-2.5 py-0.5 font-mono text-xs text-aegis-muted">
            {positions.length} active
          </span>
        )}
      </div>

      {isLoading ? (
        <table className="w-full text-sm">
          <tbody>
            <SkeletonRow />
            <SkeletonRow />
          </tbody>
        </table>
      ) : positions.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <rect x="4" y="4" width="28" height="28" rx="4" stroke="#1C2333" strokeWidth="2" />
            <path d="M12 18h12M18 12v12" stroke="#374151" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <p className="text-sm text-aegis-muted">No open positions</p>
          <p className="text-xs text-aegis-muted opacity-60">Open a position on Pacifica to see it here</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-aegis-border">
                {["Symbol", "Side", "Size", "Entry Price", "Margin", "Liq. Distance"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left">
                    <span className="label">{h}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-aegis-border/50">
              {positions.map((pos) => (
                <tr key={`${pos.symbol}-${pos.side}`} className="group transition-colors hover:bg-aegis-surface2">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-aegis-border bg-aegis-surface2 font-display text-[10px] font-bold text-aegis-accent">
                        {pos.symbol.slice(0, 2)}
                      </span>
                      <span className="font-display text-sm font-semibold text-aegis-text">
                        {pos.symbol}-PERP
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <SideChip side={pos.side} />
                  </td>
                  <td className="px-4 py-3.5 font-mono text-sm text-aegis-text">
                    {fmt(pos.amount, 5)} <span className="text-aegis-muted">{pos.symbol}</span>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-sm text-aegis-text">
                    ${fmt(pos.entry_price)}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-sm text-aegis-muted">
                    {pos.isolated ? `$${fmt(pos.margin)}` : <span className="rounded bg-aegis-surface2 px-1.5 py-0.5 text-xs">Cross</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    <LiqBar entry={pos.entry_price} liq={pos.liquidation_price} side={pos.side} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
