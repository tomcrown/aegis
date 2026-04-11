/**
 * Positions table — shows live open positions fetched from backend.
 * Displays: symbol, side, size, entry price, unrealized PnL, liquidation distance.
 */

import { useQuery } from "@tanstack/react-query";
import { useSolanaWallet } from "@/hooks/useSolanaWallet";
import { accountApi } from "@/services/api";
import type { Position } from "@/types";

function formatAmount(amount: string, symbol: string): string {
  const n = parseFloat(amount);
  return `${n.toFixed(4)} ${symbol}`;
}

function formatPrice(price: string): string {
  return `$${parseFloat(price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function SideChip({ side }: { side: Position["side"] }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${
        side === "long"
          ? "bg-aegis-green/10 text-aegis-green"
          : "bg-aegis-red/10 text-aegis-red"
      }`}
    >
      {side.toUpperCase()}
    </span>
  );
}

export function PositionsTable() {
  const { address: walletAddress } = useSolanaWallet();

  const { data: positions = [], isLoading } = useQuery({
    queryKey: ["positions", walletAddress],
    queryFn: () => accountApi.getPositions(walletAddress),
    enabled: !!walletAddress,
    refetchInterval: 5_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-aegis-border bg-aegis-surface p-6">
        <div className="animate-pulse space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-10 rounded-lg bg-aegis-border" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-aegis-border bg-aegis-surface">
      <div className="border-b border-aegis-border px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Open Positions</h2>
      </div>

      {positions.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-aegis-muted">
          No open positions
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-aegis-border text-aegis-muted">
                {["Symbol", "Side", "Size", "Entry Price", "Margin"].map((h) => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-aegis-border">
              {positions.map((pos) => (
                <tr
                  key={`${pos.symbol}-${pos.side}`}
                  className="hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3 font-mono font-medium text-white">
                    {pos.symbol}-PERP
                  </td>
                  <td className="px-4 py-3">
                    <SideChip side={pos.side} />
                  </td>
                  <td className="px-4 py-3 font-mono text-aegis-muted">
                    {formatAmount(pos.amount, pos.symbol)}
                  </td>
                  <td className="px-4 py-3 font-mono text-aegis-muted">
                    {formatPrice(pos.entry_price)}
                  </td>
                  <td className="px-4 py-3 font-mono text-aegis-muted">
                    {pos.isolated ? (
                      <span className="text-xs">{formatPrice(pos.margin)}</span>
                    ) : (
                      <span className="text-xs text-aegis-muted">Cross</span>
                    )}
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
