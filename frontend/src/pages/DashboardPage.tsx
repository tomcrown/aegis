/**
 * Main authenticated view — full dashboard.
 * Tabs: Dashboard | Vault
 */
import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useEmbeddedSolanaWallet } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";

import { DevModeToggle } from "@/components/dashboard/DevModeToggle";
import { HealthMeter } from "@/components/dashboard/HealthMeter";
import { PositionsTable } from "@/components/dashboard/PositionsTable";
import { SentimentPanel } from "@/components/dashboard/SentimentPanel";
import { AgentKeyPanel } from "@/components/dashboard/AgentKeyPanel";
import { VaultDashboard } from "@/components/vault/VaultDashboard";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { useAegisWebSocket } from "@/hooks/useAegisWebSocket";
import { useDevModeSimulation } from "@/hooks/useDevModeSimulation";
import { useWsEventNotifications } from "@/hooks/useWsEventNotifications";
import { useAegisStore } from "@/stores/useAegisStore";
import { accountApi } from "@/services/api";

type Tab = "dashboard" | "vault";

export default function DashboardPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [onboarded, setOnboarded] = useState(
    () => localStorage.getItem("aegis:onboarded") === "true"
  );

  const { logout } = usePrivy();
  const { wallet } = useEmbeddedSolanaWallet();
  const walletAddress = wallet?.address ?? null;

  const setRiskState = useAegisStore((s) => s.setRiskState);
  const setPositions = useAegisStore((s) => s.setPositions);

  // Register hooks
  useAegisWebSocket(walletAddress);
  useDevModeSimulation();
  useWsEventNotifications();

  // Bootstrap: load initial Aegis status
  useQuery({
    queryKey: ["aegis-status", walletAddress],
    queryFn: async () => {
      if (!walletAddress) return null;
      const status = await accountApi.getAegisStatus(walletAddress);
      setRiskState({ aegisActive: status.active, threshold: status.threshold });
      return status;
    },
    enabled: !!walletAddress && onboarded,
  });

  // Bootstrap: load initial positions into store
  useQuery({
    queryKey: ["positions-bootstrap", walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      const positions = await accountApi.getPositions(walletAddress);
      setPositions(positions);
      return positions;
    },
    enabled: !!walletAddress && onboarded,
    refetchInterval: 10_000,
  });

  if (!onboarded) {
    return <OnboardingFlow onComplete={() => setOnboarded(true)} />;
  }

  return (
    <div className="min-h-screen bg-aegis-bg">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-aegis-border bg-aegis-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <span className="text-xl font-bold text-aegis-accent">Aegis</span>
            {/* Tab navigation */}
            <nav className="flex gap-1">
              {(["dashboard", "vault"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    tab === t
                      ? "bg-aegis-surface text-white"
                      : "text-aegis-muted hover:text-white"
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <DevModeToggle />
            <button
              onClick={() => void logout()}
              className="text-xs text-aegis-muted hover:text-white"
            >
              Disconnect
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        {tab === "dashboard" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Left column: Health meter */}
            <div className="space-y-4">
              <HealthMeter />
              <AgentKeyPanel />
            </div>

            {/* Right two columns: Positions + Sentiment */}
            <div className="space-y-4 lg:col-span-2">
              <SentimentPanel />
              <PositionsTable />
            </div>
          </div>
        )}

        {tab === "vault" && <VaultDashboard />}
      </main>
    </div>
  );
}
