import { useQuery } from "@tanstack/react-query";
import { onboardingApi } from "@/services/api";

function truncate(key: string, chars = 10) {
  return key.length <= chars * 2 + 3
    ? key
    : `${key.slice(0, chars)}...${key.slice(-chars)}`;
}

export function AgentKeyPanel() {
  const { data: info, isLoading } = useQuery({
    queryKey: ["agent-key-info"],
    queryFn: onboardingApi.getAgentKeyInfo,
    staleTime: Infinity,
  });

  return (
    <div
      className="card animate-fade-in delay-300"
      style={{ animationFillMode: "backwards" }}
    >
      <div className="flex items-center gap-2 border-b border-aegis-border px-5 py-3.5">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 1L2 4V8C2 11.3 4.7 14.4 8 15C11.3 14.4 14 11.3 14 8V4L8 1Z"
            stroke="#4F8EF7"
            strokeWidth="1.5"
            fill="none"
          />
          <path
            d="M5.5 8L7 9.5L10.5 6"
            stroke="#4F8EF7"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h2 className="font-display text-sm font-semibold text-aegis-text">
          Agent Key
        </h2>
      </div>

      {isLoading ? (
        <div className="p-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-4 animate-pulse rounded bg-aegis-border"
            />
          ))}
        </div>
      ) : info ? (
        <div className="p-4 space-y-3">
          {/* Key display */}
          <div className="flex items-center gap-2 rounded-lg border border-aegis-border bg-aegis-surface2 px-3 py-2.5">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle
                cx="4.5"
                cy="4.5"
                r="3"
                stroke="#6B7280"
                strokeWidth="1"
              />
              <path
                d="M7 7L11 11"
                stroke="#6B7280"
                strokeWidth="1"
                strokeLinecap="round"
              />
            </svg>
            <span className="font-mono text-xs text-aegis-muted flex-1 truncate">
              {truncate(info.agent_public_key)}
            </span>
            <button
              onClick={() =>
                void navigator.clipboard.writeText(info.agent_public_key)
              }
              className="text-[10px] text-aegis-muted hover:text-aegis-text transition"
              title="Copy full key"
            >
              copy
            </button>
          </div>

          {/* Can / Cannot */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-aegis-green/15 bg-aegis-green/5 p-3">
              <p className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-wider text-aegis-green">
                Can
              </p>
              {info.permissions.map((p) => (
                <div
                  key={p}
                  className="flex items-center gap-1.5 text-xs text-aegis-muted"
                >
                  <span className="text-aegis-green text-[10px]">✓</span>
                  {p.replace(/_/g, " ")}
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-aegis-red/15 bg-aegis-red/5 p-3">
              <p className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-wider text-aegis-red">
                Cannot
              </p>
              {info.cannot_do.slice(0, 3).map((p) => (
                <div
                  key={p}
                  className="flex items-center gap-1.5 text-xs text-aegis-muted"
                >
                  <span className="text-aegis-red text-[10px]">✗</span>
                  {p.replace(/_/g, " ")}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded-md border border-aegis-accent/15 bg-aegis-accent/5 px-3 py-2">
            <span className="dot-blue" />
            <span className="font-mono text-[10px] text-aegis-accent">
              builder_code=AEGIS · Ed25519 signed
            </span>
          </div>
        </div>
      ) : (
        <div className="p-4 text-xs text-aegis-muted">
          Unable to load agent key info
        </div>
      )}
    </div>
  );
}
