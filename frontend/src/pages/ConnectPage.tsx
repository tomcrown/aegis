import { usePhantomConnect } from "@/hooks/usePhantomConnect";

export default function ConnectPage() {
  const { connectPhantom } = usePhantomConnect();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-aegis-bg px-4">
      {/* Logo */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-aegis-accent/10 text-4xl">
          🛡
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-white">Aegis</h1>
        <p className="text-center text-lg text-aegis-muted">
          Never get liquidated again.
        </p>
      </div>

      {/* Feature bullets */}
      <div className="w-full max-w-sm space-y-3 rounded-2xl border border-aegis-border bg-aegis-surface p-6">
        {[
          ["Autonomous", "Risk engine monitors 24/7"],
          ["Intelligent", "Elfa AI sentiment context"],
          ["Pooled", "Shared vault capital protects everyone"],
          ["Provable", "Every action on-chain via builder code"],
        ].map(([title, desc]) => (
          <div key={title} className="flex items-start gap-3">
            <span className="mt-0.5 text-aegis-accent">◆</span>
            <div>
              <span className="text-sm font-medium text-white">{title} </span>
              <span className="text-sm text-aegis-muted">{desc}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Connect */}
      <div className="flex w-full max-w-sm flex-col gap-3">
        <button
          onClick={() => void connectPhantom()}
          className="w-full rounded-xl bg-aegis-accent px-8 py-3.5 font-semibold text-white transition hover:opacity-90"
        >
          Connect Wallet
        </button>
      </div>

      <p className="text-center text-xs text-aegis-muted">
        Built natively on Pacifica perpetuals infrastructure
      </p>
    </div>
  );
}
