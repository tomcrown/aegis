/**
 * Root application component.
 * Auth gate: checks Privy auth OR native Solana wallet connection.
 * Either login path leads to DashboardPage.
 */
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@solana/wallet-adapter-react";
import ConnectPage from "@/pages/ConnectPage";
import DashboardPage from "@/pages/DashboardPage";

export default function App() {
  const { ready, authenticated } = usePrivy();
  const { connected } = useWallet();

  // Show spinner until Privy has resolved its auth state
  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-aegis-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-aegis-accent border-t-transparent" />
      </div>
    );
  }

  // Either login path unlocks the dashboard
  return authenticated || connected ? <DashboardPage /> : <ConnectPage />;
}
