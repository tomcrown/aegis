/**
 * Vault dashboard — TVL, user share, hedge history, builder on-chain activity.
 */
import { useQuery } from "@tanstack/react-query";
import { useSolanaWallet } from "@/hooks/useSolanaWallet";
import { builderApi, vaultApi } from "@/services/api";
import type { VaultShare, VaultState } from "@/types";

function fmt(val: string | undefined, decimals = 2) {
  const n = parseFloat(val ?? "0");
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={`card p-5 ${accent ? "border-aegis-accent/30" : ""}`}>
      <div className="label mb-1">{label}</div>
      <div
        className={`font-display text-2xl font-bold ${accent ? "text-aegis-accent" : "text-aegis-text"}`}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 font-mono text-xs text-aegis-muted">{sub}</div>
      )}
    </div>
  );
}

function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-aegis-border bg-aegis-surface2">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M10 2L3 5.5V10C3 14 6.2 17.6 10 18.5C13.8 17.6 17 14 17 10V5.5L10 2Z"
            stroke="#374151"
            strokeWidth="1.5"
            fill="none"
          />
        </svg>
      </div>
      <p className="text-sm font-medium text-aegis-muted">{message}</p>
      {sub && <p className="text-xs text-aegis-muted opacity-60">{sub}</p>}
    </div>
  );
}

export function VaultDashboard() {
  const { address } = useSolanaWallet();

  const { data: vaultState } = useQuery<VaultState>({
    queryKey: ["vault-state"],
    queryFn: vaultApi.getState,
    refetchInterval: 15_000,
  });

  const { data: userShare } = useQuery<VaultShare>({
    queryKey: ["vault-share", address],
    queryFn: () => vaultApi.getUserShare(address),
    enabled: !!address,
    refetchInterval: 15_000,
  });

  const { data: trades = [] } = useQuery<unknown[]>({
    queryKey: ["builder-trades"],
    queryFn: () => builderApi.getTrades(20),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Protocol Overview ── */}
      <div>
        <p className="section-title mb-3">Protection Vault</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Total Value Locked"
            value={fmt(vaultState?.total_tvl)}
            accent
          />
          <StatCard
            label="Active Protections"
            value={String(vaultState?.active_protections ?? 0)}
          />
          <StatCard
            label="Users Protected"
            value={String(vaultState?.user_count ?? 0)}
          />
          <StatCard
            label="Yield Distributed"
            value={fmt(vaultState?.total_yield_distributed)}
          />
        </div>
      </div>

      {/* ── Your Position ── */}
      <div>
        <p className="section-title mb-3">Your Position</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="card p-5">
            <div className="label mb-1">Protection Premium</div>
            <div className="font-display text-2xl font-bold text-aegis-text">
              {fmt(userShare?.deposited_usdc)}
            </div>
            <div className="mt-0.5 font-mono text-xs text-aegis-muted">
              0.1% of notional
            </div>
          </div>
          <div className="card p-5">
            <div className="label mb-1">Yield Earned</div>
            <div className="font-display text-2xl font-bold text-aegis-green">
              {fmt(userShare?.yield_earned)}
            </div>
            <div className="mt-0.5 font-mono text-xs text-aegis-muted">
              Funding rate yield
            </div>
          </div>
          <div className="card p-5">
            <div className="label mb-1">Active Hedges</div>
            <div className="font-display text-2xl font-bold text-aegis-text">
              {userShare?.active_hedges ?? 0}
            </div>
            <div className="mt-0.5 font-mono text-xs text-aegis-muted">
              Open hedge orders
            </div>
          </div>
        </div>
      </div>

      {/* ── On-Chain Activity ── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="section-title">On-Chain Activity</p>
          <div className="flex items-center gap-2 rounded-full border border-aegis-accent/20 bg-aegis-accent/5 px-3 py-1">
            <span className="dot-blue" />
            <span className="font-mono text-[10px] text-aegis-accent">
              builder_code=AEGIS
            </span>
          </div>
        </div>
        <div className="card overflow-hidden">
          {trades.length === 0 ? (
            <EmptyState
              message="No Aegis trades yet"
              sub="Hedges will appear here once triggered on Pacifica"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-aegis-border">
                    {[
                      "Symbol",
                      "Action",
                      "Amount",
                      "Price",
                      "Notional",
                      "PnL",
                    ].map((h) => (
                      <th key={h} className="px-4 py-3 text-left">
                        <span className="label">{h}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-aegis-border/50">
                  {(trades as Record<string, string>[]).map((t, i) => {
                    const pnl = parseFloat(t["pnl"] ?? "0");
                    const notional =
                      parseFloat(t["amount"] ?? "0") *
                      parseFloat(t["price"] ?? "0");
                    return (
                      <tr
                        key={i}
                        className="group hover:bg-aegis-surface2 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded border border-aegis-border bg-aegis-surface2 font-display text-[9px] font-bold text-aegis-accent">
                              {(t["symbol"] ?? "?").slice(0, 2)}
                            </span>
                            <span className="font-display font-semibold text-aegis-text">
                              {t["symbol"]}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded px-2 py-0.5 font-display text-[10px] font-semibold bg-aegis-red/10 text-aegis-red">
                            ↓ HEDGE
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-aegis-text">
                          {t["amount"]}
                        </td>
                        <td className="px-4 py-3 font-mono text-aegis-text">
                          ${t["price"]}
                        </td>
                        <td className="px-4 py-3 font-mono text-aegis-muted">
                          {fmt(t["builder_fee"])}
                        </td>
                        <td
                          className={`px-4 py-3 font-mono font-semibold ${pnl >= 0 ? "text-aegis-green" : "text-aegis-red"}`}
                        >
                          {pnl >= 0 ? "+" : ""}
                          {pnl.toFixed(2)}
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

      {/* ── How the vault works ── */}
      <div className="card p-6">
        <p className="section-title mb-4">How the Vault Works</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              step: "01",
              title: "Premium Collection",
              desc: "When you activate Aegis, a 0.1% protection premium on your notional position value enters the vault.",
            },
            {
              step: "02",
              title: "Yield Generation",
              desc: "When Aegis places hedge orders, the position earns funding rate yield. This accrues to vault participants.",
            },
            {
              step: "03",
              title: "Verifiable On-Chain",
              desc: "Every hedge trade is attributed to builder_code=AEGIS on Pacifica. Full audit trail visible in the table above.",
            },
          ].map(({ step, title, desc }) => (
            <div key={step} className="space-y-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-aegis-accent/30 bg-aegis-accent/10 font-display text-xs font-bold text-aegis-accent">
                {step}
              </div>
              <h3 className="font-display text-sm font-semibold text-aegis-text">
                {title}
              </h3>
              <p className="text-xs leading-relaxed text-aegis-muted">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
