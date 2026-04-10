/**
 * Agent Key info panel — the trust center.
 * Shows what the Agent Key CAN do and explicitly what it CANNOT do.
 */

import { useQuery } from "@tanstack/react-query";
import { onboardingApi } from "@/services/api";

function truncate(key: string, chars = 8): string {
  if (key.length <= chars * 2 + 3) return key;
  return `${key.slice(0, chars)}...${key.slice(-chars)}`;
}

export function AgentKeyPanel() {
  const { data: agentKeyInfo, isLoading } = useQuery({
    queryKey: ["agent-key-info"],
    queryFn: onboardingApi.getAgentKeyInfo,
    staleTime: Infinity, // never changes during runtime
  });

  return (
    <div className="rounded-xl border border-aegis-border bg-aegis-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-white">
        Agent Key — Security
      </h2>

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-lg bg-aegis-border" />
      ) : agentKeyInfo ? (
        <div className="space-y-3">
          {/* Public key */}
          <div className="rounded-lg bg-aegis-bg p-3">
            <p className="mb-1 text-xs text-aegis-muted">Agent Public Key</p>
            <p className="font-mono text-xs text-white">
              {truncate(agentKeyInfo.agent_public_key, 12)}
            </p>
          </div>

          {/* Permissions */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-aegis-green">
              Permitted
            </p>
            <ul className="space-y-1">
              {agentKeyInfo.permissions.map((p) => (
                <li key={p} className="flex items-center gap-2 text-xs text-aegis-muted">
                  <span className="text-aegis-green">✓</span>
                  {p.replace(/_/g, " ")}
                </li>
              ))}
            </ul>
          </div>

          {/* Cannot do */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-aegis-red">
              Cannot do — ever
            </p>
            <ul className="space-y-1">
              {agentKeyInfo.cannot_do.map((p) => (
                <li key={p} className="flex items-center gap-2 text-xs text-aegis-muted">
                  <span className="text-aegis-red">✗</span>
                  {p.replace(/_/g, " ")}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="text-xs text-aegis-muted">Unable to load agent key info</p>
      )}
    </div>
  );
}
