/**
 * Vault dashboard — TVL, user share, yield earned, builder leaderboard.
 * All property access uses snake_case to match backend wire format.
 */

import { useQuery } from "@tanstack/react-query";
import { useSolanaWallet } from "@/hooks/useSolanaWallet";
import { builderApi, vaultApi } from "@/services/api";
import type { VaultShare, VaultState } from "@/types";

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-aegis-border bg-aegis-surface p-4">
      <p className="text-xs text-aegis-muted">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-aegis-muted">{sub}</p>}
    </div>
  );
}

function formatUsdc(val: string | undefined): string {
  const n = parseFloat(val ?? "0");
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function VaultDashboard() {
  const { address: walletAddress } = useSolanaWallet();

  const { data: vaultState } = useQuery<VaultState>({
    queryKey: ["vault-state"],
    queryFn: vaultApi.getState,
    refetchInterval: 15_000,
  });

  const { data: userShare } = useQuery<VaultShare>({
    queryKey: ["vault-share", walletAddress],
    queryFn: () => vaultApi.getUserShare(walletAddress),
    enabled: !!walletAddress,
    refetchInterval: 15_000,
  });

  const { data: trades = [] } = useQuery<unknown[]>({
    queryKey: ["builder-trades"],
    queryFn: () => builderApi.getTrades(10),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      {/* Vault overview */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-aegis-muted">
          Protection Vault
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Total TVL"
            value={formatUsdc(vaultState?.total_tvl)}
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
            value={formatUsdc(vaultState?.total_yield_distributed)}
          />
        </div>
      </div>

      {/* User share */}
      {userShare && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-aegis-muted">
            Your Position
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard
              label="Deposited"
              value={formatUsdc(userShare.deposited_usdc)}
              sub="Protection premium"
            />
            <StatCard
              label="Yield Earned"
              value={formatUsdc(userShare.yield_earned)}
              sub="Funding rate yield"
            />
            <StatCard
              label="Active Hedges"
              value={String(userShare.active_hedges)}
            />
          </div>
        </div>
      )}

      {/* Builder trades — on-chain proof */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-aegis-muted">
            On-Chain Activity
          </h2>
          <span className="rounded border border-aegis-accent/30 px-2 py-0.5 text-xs text-aegis-accent">
            builder_code=AEGIS
          </span>
        </div>
        <div className="rounded-xl border border-aegis-border bg-aegis-surface">
          {trades.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-aegis-muted">
              No Aegis trades yet — hedges will appear here once triggered
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-aegis-border text-aegis-muted">
                    {["Symbol", "Side", "Amount", "Price", "PnL"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2 text-left font-medium"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-aegis-border font-mono">
                  {(trades as Record<string, string>[]).map((t, i) => (
                    <tr key={i} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-2 text-white">{t["symbol"]}</td>
                      <td className="px-4 py-2 text-aegis-muted">{t["side"]}</td>
                      <td className="px-4 py-2 text-aegis-muted">{t["amount"]}</td>
                      <td className="px-4 py-2 text-aegis-muted">
                        ${t["price"]}
                      </td>
                      <td
                        className={`px-4 py-2 ${
                          parseFloat(t["pnl"] ?? "0") >= 0
                            ? "text-aegis-green"
                            : "text-aegis-red"
                        }`}
                      >
                        {t["pnl"]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
