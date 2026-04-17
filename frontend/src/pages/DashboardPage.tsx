import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppSidebar, MobileBottomNav } from "@/components/layout/AppSidebar";
import { AppNav, type AppPage } from "@/components/layout/AppNav";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { useAegisWebSocket } from "@/hooks/useAegisWebSocket";
import { useDevModeSimulation } from "@/hooks/useDevModeSimulation";
import { useWsEventNotifications } from "@/hooks/useWsEventNotifications";
import { useAegisStore } from "@/stores/useAegisStore";
import { useSolanaWallet } from "@/hooks/useSolanaWallet";
import { accountApi, onboardingApi } from "@/services/api";

import OverviewPage from "@/pages/OverviewPage";
import ProtectionPage from "@/pages/ProtectionPage";
import IntelligencePage from "@/pages/IntelligencePage";
import VaultPage from "@/pages/VaultPage";

export default function DashboardPage({
  onDisconnect,
}: {
  onDisconnect: () => void;
}) {
  const [page, setPage] = useState<AppPage>("overview");
  const [onboarded, setOnboarded] = useState(
    () => localStorage.getItem("aegis:onboarded") === "true",
  );

  const { address } = useSolanaWallet();
  const walletAddress = address || null;

  const setRiskState = useAegisStore((s) => s.setRiskState);
  const setPositions = useAegisStore((s) => s.setPositions);

  useAegisWebSocket(walletAddress);
  useDevModeSimulation();
  useWsEventNotifications();

  const { data: agentKeyInfo } = useQuery({
    queryKey: ["agent-key-info"],
    queryFn: () => onboardingApi.getAgentKeyInfo(),
    staleTime: Infinity,
  });

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
    return (
      <OnboardingFlow
        onComplete={() => setOnboarded(true)}
        agentPublicKey={agentKeyInfo?.agent_public_key}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-aegis-bg">
      <AppNav onDisconnect={onDisconnect} />
      <div className="flex flex-1">
        <AppSidebar page={page} onNavigate={setPage} />
        <main className="flex-1 px-4 py-4 pb-20 sm:px-6 sm:py-6 sm:pb-6">
          {page === "overview" && <OverviewPage />}
          {page === "protection" && <ProtectionPage />}
          {page === "intelligence" && <IntelligencePage />}
          {page === "vault" && <VaultPage />}
        </main>
      </div>
      <MobileBottomNav page={page} onNavigate={setPage} />
    </div>
  );
}
