/**
 * Root application component.
 * Unauthenticated → LandingPage (with connect options built in)
 * Authenticated   → DashboardPage
 */
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@solana/wallet-adapter-react";
import LandingPage from "@/pages/LandingPage";
import DashboardPage from "@/pages/DashboardPage";

export default function App() {
  const { ready, authenticated } = usePrivy();
  const { connected } = useWallet();

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-aegis-bg">
        <div className="flex flex-col items-center gap-4">
          <img
            src="/aegis.png"
            alt="Aegis Logo"
            className="h-20 w-20 object-contain"
          />
          <span className="font-mono text-xs text-aegis-muted">
            Initialising Aegis...
          </span>
        </div>
      </div>
    );
  }

  return authenticated || connected ? <DashboardPage /> : <LandingPage />;
}
