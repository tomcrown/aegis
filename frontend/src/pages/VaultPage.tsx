/**
 * Vault page — protocol stats, user position, on-chain activity, explainer.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSolanaWallet } from "@/hooks/useSolanaWallet";
import { accountApi, builderApi, vaultApi } from "@/services/api";
import type { VaultShare, VaultState } from "@/types";
import bs58 from "bs58";

function fmt(val: string | undefined, decimals = 2) {
  const n = parseFloat(val ?? "0");
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function StatCard({
  label,
  value,
  sub,
  accent,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  color?: string;
}) {
  return (
    <div
      className={`card p-5 ${accent ? "border-aegis-accent/30 bg-aegis-accent/[0.03]" : ""}`}
    >
      <div className="label mb-1">{label}</div>
      <div
        className={`font-display text-2xl font-bold ${color ?? (accent ? "text-aegis-accent" : "text-aegis-text")}`}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 font-mono text-xs text-aegis-muted">{sub}</div>
      )}
    </div>
  );
}

function ProtocolStats({ vaultState }: { vaultState?: VaultState }) {
  return (
    <div className="space-y-3">
      <h3 className="section-title">Protocol Overview</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total Value Protected"
          value={fmt(vaultState?.total_tvl)}
          sub="Across all users"
          accent
        />
        <StatCard
          label="Active Protections"
          value={String(vaultState?.active_protections ?? 0)}
          sub="Live hedge shields"
        />
        <StatCard
          label="Users Protected"
          value={String(vaultState?.user_count ?? 0)}
          sub="Onboarded accounts"
        />
        <StatCard
          label="Yield Distributed"
          value={fmt(vaultState?.total_yield_distributed)}
          sub="Funding rate earnings"
          color="text-aegis-green"
        />
      </div>
    </div>
  );
}

function UserPosition({ userShare }: { userShare?: VaultShare }) {
  const utilization = userShare
    ? Math.min(100, (userShare.active_hedges / 5) * 100)
    : 0;

  return (
    <div className="space-y-3">
      <h3 className="section-title">Your Position</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <div className="label mb-1">Protection Premium</div>
          <div className="font-display text-2xl font-bold text-aegis-text">
            {fmt(userShare?.deposited_usdc)}
          </div>
          <div className="mt-1 font-mono text-xs text-aegis-muted">
            0.1% of your position notional
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-aegis-surface2">
            <div
              className="h-full rounded-full bg-aegis-accent"
              style={{ width: "100%" }}
            />
          </div>
        </div>

        <div className="card p-5">
          <div className="label mb-1">Yield Earned</div>
          <div className="font-display text-2xl font-bold text-aegis-green">
            {fmt(userShare?.yield_earned)}
          </div>
          <div className="mt-1 font-mono text-xs text-aegis-muted">
            Funding rate on hedge positions
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            <span className="dot-green" />
            <span className="font-mono text-[10px] text-aegis-muted">
              Accruing in real-time
            </span>
          </div>
        </div>

        <div className="card p-5">
          <div className="label mb-1">Active Hedges</div>
          <div className="font-display text-2xl font-bold text-aegis-text">
            {userShare?.active_hedges ?? 0}
          </div>
          <div className="mt-1 font-mono text-xs text-aegis-muted">
            Open protective orders
          </div>
          <div className="mt-3">
            <div className="mb-1 flex justify-between font-mono text-[10px] text-aegis-muted">
              <span>Capacity</span>
              <span>{Math.round(utilization)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-aegis-surface2">
              <div
                className="h-full rounded-full bg-aegis-amber transition-all"
                style={{ width: `${utilization}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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
                      Aegis reduced your {symbol} exposure by{" "}
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
                      of your capital.
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
                    "Direction",
                    "Size",
                    "Avg Price",
                    "Value",
                    "Builder Fee",
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
                  const isShort = false; // Aegis protective actions reduce long exposure
                  return (
                    <tr
                      key={i}
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
                        $
                        {notional.toLocaleString("en-US", {
                          maximumFractionDigits: 0,
                        })}
                      </td>
                      <td className="px-4 py-3 font-mono text-aegis-muted">
                        {fmt(t["builder_fee"])}
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

// function HowItWorks() {
//   const steps = [
//     {
//       icon: "🔐",
//       title: "You set your safety level",
//       desc: "Choose when Aegis should step in. Conservative means it hedges early; aggressive means it waits for a bigger drop.",
//     },
//     {
//       icon: "📡",
//       title: "Aegis monitors 24/7",
//       desc: "Every 500ms, Aegis checks your margin ratio and reads social signals from Elfa AI. No sleep, no holidays.",
//     },
//     {
//       icon: "⚡",
//       title: "Automatic hedge fires",
//       desc: "When risk rises, Aegis places a counter-position on Pacifica using your Agent Key. No confirmation needed.",
//     },
//     {
//       icon: "📈",
//       title: "Hedge earns funding yield",
//       desc: "Hedge positions earn funding rate payments. This yield accrues to you via the vault.",
//     },
//     {
//       icon: "✅",
//       title: "Recovers when safe",
//       desc: "When your margin improves, Aegis closes the hedge automatically and resumes passive monitoring.",
//     },
//     {
//       icon: "🔍",
//       title: "Full audit trail",
//       desc: "Every Aegis trade is attributed to builder_code=AEGIS on Pacifica. Fully transparent and verifiable.",
//     },
//   ];

// //   return (
// //     <div className="card p-6">
// //       <h3 className="section-title mb-5">How the Vault Works</h3>
// //       <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
// //         {steps.map(({ icon, title, desc }) => (
// //           <div key={title} className="flex gap-3">
// //             <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-aegis-border bg-aegis-surface2 text-lg">
// //               {icon}
// //             </div>
// //             <div>
// //               <h4 className="font-display text-sm font-semibold text-aegis-text">
// //                 {title}
// //               </h4>
// //               <p className="mt-1 text-xs leading-relaxed text-aegis-muted">
// //                 {desc}
// //               </p>
// //             </div>
// //           </div>
// //         ))}
// //       </div>
// //     </div>
// //   );
// // }

// function sortRecursive(obj: unknown): unknown {
//   if (Array.isArray(obj)) return obj.map(sortRecursive);
//   if (obj !== null && typeof obj === "object") {
//     return Object.fromEntries(
//       Object.entries(obj as Record<string, unknown>)
//         .sort(([a], [b]) => a.localeCompare(b))
//         .map(([k, v]) => [k, sortRecursive(v)]),
//     );
//   }
//   return obj;
// }

// function canonicalJson(payload: object): string {
//   return JSON.stringify(sortRecursive(payload));
// }

// function ApiSetupCard() {
//   const { address, signMessage } = useSolanaWallet();
//   const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(
//     null,
//   );
//   const [loading, setLoading] = useState(false);

//   async function handleGenerate() {
//     if (!address || !signMessage) return;
//     setLoading(true);
//     setStatus(null);
//     try {
//       const timestamp = Date.now();
//       const expiryWindow = 30_000;

//       // Build the canonical message Pacifica expects
//       const header = {
//         expiry_window: expiryWindow,
//         timestamp,
//         type: "create_api_key",
//       };
//       const messageStr = canonicalJson({ ...header, data: {} });
//       const messageBytes = new TextEncoder().encode(messageStr);

//       // Phantom signs
//       const sigBytes = await signMessage(messageBytes);
//       const signature = bs58.encode(sigBytes);

//       const result = await accountApi.createApiConfigKey({
//         account: address,
//         signature,
//         timestamp,
//         expiry_window: expiryWindow,
//       });

//       setStatus({
//         ok: true,
//         msg: `Key saved: ${result.api_key.slice(0, 16)}...`,
//       });
//     } catch (err) {
//       setStatus({
//         ok: false,
//         msg: err instanceof Error ? err.message : "Failed",
//       });
//     } finally {
//       setLoading(false);
//     }
//   }

//   return (
//     <div className="card p-6">
//       <div className="mb-4">
//         <h3 className="font-display text-base font-bold text-aegis-text">
//           Rate Limit Key
//         </h3>
//         <p className="mt-1 text-sm text-aegis-muted">
//           Generate a Pacifica API Config Key to increase rate limits for the
//           Aegis backend. One-time setup — sign with your wallet.
//         </p>
//       </div>
//       <button
//         onClick={() => void handleGenerate()}
//         disabled={loading || !address || !signMessage}
//         className="w-full rounded-xl border border-aegis-accent/30 bg-aegis-accent/5 py-3 font-display text-sm font-semibold text-aegis-accent transition hover:bg-aegis-accent/10 active:scale-[0.98] disabled:opacity-40"
//       >
//         {loading ? (
//           <span className="flex items-center justify-center gap-2">
//             <span className="h-3 w-3 animate-spin rounded-full border border-aegis-accent border-t-transparent" />
//             Waiting for Phantom...
//           </span>
//         ) : (
//           "Generate API Config Key"
//         )}
//       </button>
//       {status && (
//         <div
//           className={`mt-3 rounded-lg border px-3 py-2 text-center font-mono text-xs ${
//             status.ok
//               ? "border-aegis-green/20 bg-aegis-green/5 text-aegis-green"
//               : "border-aegis-red/20 bg-aegis-red/5 text-aegis-red"
//           }`}
//         >
//           {status.msg}
//         </div>
//       )}
//     </div>
//   );
// }

export default function VaultPage() {
  const { address } = useSolanaWallet();

  const { data: vaultState } = useQuery<VaultState>({
    queryKey: ["vault-state"],
    queryFn: vaultApi.getState,
    refetchInterval: 15_000,
  });

  const { data: userShare } = useQuery<VaultShare>({
    queryKey: ["vault-share", address],
    queryFn: () => vaultApi.getUserShare(address!),
    enabled: !!address,
    refetchInterval: 15_000,
  });

  return (
    <div className="space-y-8 animate-fade-in">
      <ProtocolStats vaultState={vaultState} />
      <UserPosition userShare={userShare} />
      <ProtectionImpact /> {/* ← add this line */}
      <OnChainActivity />
      {/* <ApiSetupCard /> */}
      {/* <HowItWorks /> */}
    </div>
  );
}
