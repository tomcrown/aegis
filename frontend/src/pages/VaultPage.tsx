import { useQuery } from "@tanstack/react-query";
import { builderApi } from "@/services/api";

function fmt(val: string | undefined, decimals = 2) {
  const n = parseFloat(val ?? "0");
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function ProtectionImpact() {
  const { data: trades = [] } = useQuery<unknown[]>({
    queryKey: ["builder-trades"],
    queryFn: () => builderApi.getTrades(20),
    refetchInterval: 30_000,
  });

  if (trades.length === 0) return null;

  const tradeRecords = trades as Record<string, string>[];
  const LIQUIDATION_BUFFER = 0.08;

  const totalNotional = tradeRecords.reduce((sum, t) => {
    return sum + parseFloat(t["amount"] ?? "0") * parseFloat(t["price"] ?? "0");
  }, 0);

  const estimatedSaved = totalNotional * LIQUIDATION_BUFFER;

  const bySymbol = tradeRecords.reduce<
    Record<string, { amount: number; price: number; count: number }>
  >((acc, t) => {
    const sym = t["symbol"] ?? "?";
    const amount = parseFloat(t["amount"] ?? "0");
    const price = parseFloat(t["price"] ?? "0");

    if (!acc[sym]) {
      acc[sym] = { amount: 0, price: 0, count: 0 };
    }

    acc[sym].amount += amount;
    acc[sym].price = price;
    acc[sym].count += 1;

    return acc;
  }, {});

  return (
    <div className="space-y-3">
      <h3 className="section-title">Protection Impact</h3>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card p-5 border-aegis-green/20 bg-aegis-green/[0.03]">
          <div className="label mb-1">Capital Protected</div>
          <div className="font-display text-2xl font-bold text-aegis-green">
            $
            {totalNotional.toLocaleString("en-US", {
              maximumFractionDigits: 0,
            })}
          </div>
          <div className="mt-0.5 font-mono text-xs text-aegis-muted">
            Total notional Aegis acted on
          </div>
        </div>
        <div className="card p-5 border-aegis-green/20 bg-aegis-green/[0.03]">
          <div className="label mb-1">Est. Loss Avoided</div>
          <div className="font-display text-2xl font-bold text-aegis-green">
            ~$
            {estimatedSaved.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="mt-0.5 font-mono text-xs text-aegis-muted">
            Based on ~8% liquidation buffer
          </div>
        </div>
        <div className="card p-5">
          <div className="label mb-1">Protective Actions</div>
          <div className="font-display text-2xl font-bold text-aegis-text">
            {tradeRecords.length}
          </div>
          <div className="mt-0.5 font-mono text-xs text-aegis-muted">
            Autonomous risk decisions
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {Object.entries(bySymbol).map(([symbol, data]) => {
          const executionPrice = data.price;
          const estimatedLiqPrice = executionPrice * (1 - LIQUIDATION_BUFFER);
          const buffer = executionPrice - estimatedLiqPrice;
          const symbolSaved = data.amount * executionPrice * LIQUIDATION_BUFFER;

          return (
            <div
              key={symbol}
              className="card p-4 border-aegis-green/10 bg-aegis-green/[0.03]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-aegis-green/30 bg-aegis-green/10 text-sm">
                    🛡
                  </div>
                  <div>
                    <div className="font-display text-sm font-semibold text-aegis-text">
                      {symbol} — Deleveraged {data.count}x
                    </div>
                    <div className="mt-1 font-mono text-xs text-aegis-muted leading-relaxed">
                      Aegis reduced {symbol} exposure by{" "}
                      <span className="text-aegis-text font-semibold">
                        {data.amount.toFixed(2)} {symbol}
                      </span>{" "}
                      at avg ${executionPrice.toFixed(3)}. Estimated liquidation
                      was ~$
                      {estimatedLiqPrice.toFixed(3)} — ${buffer.toFixed(3)}{" "}
                      lower. Aegis protected approximately{" "}
                      <span className="text-aegis-green font-semibold">
                        ${symbolSaved.toFixed(2)}
                      </span>{" "}
                      in capital across the protocol.
                    </div>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-display text-lg font-bold text-aegis-green">
                    +${symbolSaved.toFixed(2)}
                  </div>
                  <div className="font-mono text-[10px] text-aegis-muted">
                    saved
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="font-mono text-[10px] text-aegis-muted opacity-60">
        * Estimates based on ~8% buffer from execution price. Actual savings
        depend on leverage and margin configuration.
      </p>
    </div>
  );
}

function OnChainActivity() {
  const { data: trades = [] } = useQuery<unknown[]>({
    queryKey: ["builder-trades"],
    queryFn: () => builderApi.getTrades(20),
    refetchInterval: 30_000,
  });

  function timeAgo(ms: number): string {
    const diff = Date.now() - ms;
    const m = Math.floor(diff / 60_000);
    const h = Math.floor(diff / 3_600_000);
    const d = Math.floor(diff / 86_400_000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${d}d ago`;
  }

  function shortWallet(addr: string): string {
    if (!addr || addr.length < 10) return addr;
    return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="section-title">On-Chain Activity</h3>
        <div className="flex items-center gap-2 rounded-full border border-aegis-accent/20 bg-aegis-accent/5 px-3 py-1">
          <span className="dot-blue" />
          <span className="font-mono text-[10px] text-aegis-accent">
            builder_code=AEGIS
          </span>
        </div>
      </div>

      <div className="card overflow-hidden">
        {trades.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <img
              src="/aegis.png"
              alt="Aegis Logo"
              className="h-20 w-20 object-contain"
            />

            <p className="text-sm font-medium text-aegis-muted">
              No trades yet
            </p>
            <p className="text-xs text-aegis-muted opacity-60">
              Aegis hedge trades will appear here once triggered
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-aegis-border bg-aegis-surface2">
                  {[
                    "Token",
                    "Wallet",
                    "Size",
                    "Avg Price",
                    "Value",
                    "Builder Fee",
                    "Time",
                  ].map((h) => (
                    <th key={h} className="px-4 py-3 text-left">
                      <span className="label">{h}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-aegis-border/50">
                {(trades as Record<string, string>[]).map((t, i) => {
                  const notional =
                    parseFloat(t["amount"] ?? "0") *
                    parseFloat(t["price"] ?? "0");

                  return (
                    <tr
                      key={t["history_id"] ?? i}
                      className="group hover:bg-aegis-surface2 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded border border-aegis-border bg-aegis-surface2 font-display text-[9px] font-bold text-aegis-accent">
                            {(t["symbol"] ?? "?")
                              .replace("USDT", "")
                              .slice(0, 3)}
                          </span>
                          <span className="font-display font-semibold text-aegis-text">
                            {(t["symbol"] ?? "?").replace("USDT", "")}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-aegis-muted">
                        {shortWallet(t["address"] ?? "")}
                      </td>
                      <td className="px-4 py-3 font-mono text-aegis-text">
                        {t["amount"]}
                      </td>
                      <td className="px-4 py-3 font-mono text-aegis-text">
                        ${t["price"]}
                      </td>
                      <td className="px-4 py-3 font-mono text-aegis-muted">
                        $
                        {notional.toLocaleString("en-US", {
                          maximumFractionDigits: 0,
                        })}
                      </td>
                      <td className="px-4 py-3 font-mono text-aegis-muted">
                        {fmt(t["builder_fee"])}
                      </td>
                      <td className="px-4 py-3 font-mono text-aegis-muted">
                        {t["created_at"]
                          ? timeAgo(parseInt(t["created_at"]))
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VaultPage() {
  return (
    <div className="space-y-8 animate-fade-in">
      <ProtectionImpact />
      <OnChainActivity />
    </div>
  );
}
