/**
 * Root application component.
 * Auth gate: unauthenticated → ConnectPage, authenticated → DashboardPage.
 * Onboarding gate lives inside DashboardPage.
 */
import { usePrivy } from "@privy-io/react-auth";
import ConnectPage from "@/pages/ConnectPage";
import DashboardPage from "@/pages/DashboardPage";

export default function App() {
  const { ready, authenticated } = usePrivy();

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-aegis-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-aegis-accent border-t-transparent" />
      </div>
    );
  }

  return authenticated ? <DashboardPage /> : <ConnectPage />;
}
