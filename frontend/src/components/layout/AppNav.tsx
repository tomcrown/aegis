import { useWallet } from "@solana/wallet-adapter-react";
import { useAegisStore } from "@/stores/useAegisStore";
import { useSolanaWallet } from "@/hooks/useSolanaWallet";
import { DevModeToggle } from "@/components/dashboard/DevModeToggle";

export type AppPage = "overview" | "protection" | "intelligence" | "vault";

export function AppNav({ onDisconnect }: { onDisconnect: () => void }) {
  const { disconnect } = useWallet();
  const { address } = useSolanaWallet();

  async function handleDisconnect() {
    sessionStorage.removeItem("aegis:connected");

    // Disconnect wallet adapter
    try {
      await disconnect();
    } catch {
      /* not connected via adapter */
      onDisconnect();
    }
    // Also disconnect direct window.solana connection
    try {
      const solana = (window as any).solana;
      if (solana?.isConnected) await solana.disconnect();
    } catch {
      /* ignore */
    }
    // Force page reload so App re-evaluates auth state cleanly
    window.location.reload();
  }

  const riskState = useAegisStore((s) => s.riskState);

  const truncatedAddr = address
    ? `${address.slice(0, 4)}...${address.slice(-4)}`
    : "";

  const statusColor =
    riskState.tier === "hedge"
      ? "bg-aegis-red"
      : riskState.tier === "watch"
        ? "bg-aegis-amber"
        : "bg-aegis-green";

  const statusLabel =
    riskState.tier === "hedge"
      ? "Hedging"
      : riskState.tier === "watch"
        ? "Watching"
        : "Protected";

  const statusText =
    riskState.tier === "hedge"
      ? "text-aegis-red"
      : riskState.tier === "watch"
        ? "text-aegis-amber"
        : "text-aegis-green";

  return (
    <header className="sticky top-0 z-30 border-b border-aegis-border bg-aegis-bg/95 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-2.5 sm:px-6">
        {/* Left — logo */}
        <div className="flex items-center gap-2">
          <img
            src="/aegis.png"
            alt="Aegis Logo"
            className="h-10 w-10 object-contain"
          />
          <span className="font-display text-sm font-bold tracking-tight text-aegis-text">
            Aegis
          </span>
        </div>

        {/* Right — status + wallet */}
        <div className="flex items-center gap-2">
          {/* Live status pill */}
          <div className="hidden items-center gap-2 rounded-lg border border-aegis-border bg-aegis-surface px-3 py-1.5 sm:flex">
            <span
              className={`h-1.5 w-1.5 rounded-full ${statusColor} ${riskState.tier !== "safe" ? "animate-pulse" : ""}`}
            />
            <span
              className={`font-display text-xs font-semibold ${statusText}`}
            >
              {statusLabel}
            </span>
            <span className="font-mono text-xs text-aegis-muted">
              {(200 - riskState.crossMmrPct).toFixed(1)}% ratio
            </span>
          </div>

          <DevModeToggle />

          {/* Wallet pill */}
          <div className="flex items-center gap-1.5 rounded-lg border border-aegis-border bg-aegis-surface px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-aegis-accent" />
            <span className="font-mono text-xs text-aegis-muted">
              {truncatedAddr}
            </span>
            <button
              onClick={() => void handleDisconnect()}
              className="ml-1 rounded px-1 text-[10px] text-aegis-muted transition hover:text-aegis-red"
              title="Disconnect"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
