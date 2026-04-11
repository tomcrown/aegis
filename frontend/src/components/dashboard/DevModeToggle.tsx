import { useAegisStore } from "@/stores/useAegisStore";

const DEV_MODE_ALLOWED = import.meta.env.VITE_DEV_MODE_ENABLED === "true";

export function DevModeToggle() {
  const devMode = useAegisStore((s) => s.devMode);
  const setDevMode = useAegisStore((s) => s.setDevMode);

  if (!DEV_MODE_ALLOWED) return null;

  return (
    <button
      role="switch"
      aria-checked={devMode.enabled}
      onClick={() => setDevMode({ enabled: !devMode.enabled })}
      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-xs transition-all ${
        devMode.enabled
          ? "border-aegis-amber/40 bg-aegis-amber/10 text-aegis-amber"
          : "border-aegis-border bg-aegis-surface2 text-aegis-muted hover:text-aegis-text"
      }`}
    >
      <span className="hidden uppercase tracking-widest sm:inline">Simulate</span>
      <span className={`relative h-4 w-7 rounded-full transition-colors ${devMode.enabled ? "bg-aegis-amber" : "bg-aegis-border"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${devMode.enabled ? "translate-x-3.5" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}
