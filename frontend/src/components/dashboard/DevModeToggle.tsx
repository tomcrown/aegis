/**
 * Dev Mode Toggle — top-right corner of dashboard.
 * Clearly marked as a simulation tool. Never affects backend.
 *
 * When VITE_DEV_MODE_ENABLED is false, this component renders nothing.
 */

import { useAegisStore } from "@/stores/useAegisStore";

const DEV_MODE_ALLOWED = import.meta.env.VITE_DEV_MODE_ENABLED === "true";

export function DevModeToggle() {
  const devMode = useAegisStore((s) => s.devMode);
  const setDevMode = useAegisStore((s) => s.setDevMode);

  if (!DEV_MODE_ALLOWED) return null;

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
        devMode.enabled
          ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
          : "border-aegis-border bg-aegis-surface text-aegis-muted"
      }`}
    >
      <span className="font-mono uppercase tracking-widest">Simulate</span>
      {/* Toggle switch */}
      <button
        role="switch"
        aria-checked={devMode.enabled}
        aria-label="Toggle price drop simulation"
        onClick={() => setDevMode({ enabled: !devMode.enabled })}
        className={`relative h-4 w-8 rounded-full transition-colors ${
          devMode.enabled ? "bg-amber-500" : "bg-aegis-border"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${
            devMode.enabled ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
      {devMode.enabled && (
        <span className="text-amber-400/70">
          −{devMode.simulatedPriceDrop}% price
        </span>
      )}
    </div>
  );
}
