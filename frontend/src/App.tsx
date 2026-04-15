import { useState } from "react";
import LandingPage from "@/pages/LandingPage";
import DashboardPage from "@/pages/DashboardPage";

export default function App() {
  const [appConnected, setAppConnected] = useState(
    () => sessionStorage.getItem("aegis:connected") === "true",
  );

  return appConnected ? (
    <DashboardPage onDisconnect={() => setAppConnected(false)} />
  ) : (
    <LandingPage onConnect={() => setAppConnected(true)} />
  );
}
