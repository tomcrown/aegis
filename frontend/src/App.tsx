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
          <svg width="40" height="40" viewBox="0 0 80 80" fill="none" className="animate-pulse">
            <path d="M40 6L10 18V40C10 56 24 68 40 74C56 68 70 56 70 40V18L40 6Z"
              stroke="#4F8EF7" strokeWidth="2.5" fill="none" />
            <path d="M29 40L36 47L51 33" stroke="#4F8EF7" strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-mono text-xs text-aegis-muted">Initialising Aegis...</span>
        </div>
      </div>
    );
  }

  return authenticated || connected ? <DashboardPage /> : <LandingPage />;
}
