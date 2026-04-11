/**
 * Typed API service layer — all backend calls go through here.
 * No raw fetch() calls in components or hooks.
 *
 * All Pacifica decimal values arrive as strings and stay as strings
 * until the rendering layer formats them for display.
 */

import type {
  AccountInfo,
  Position,
  SentimentData,
  VaultShare,
  VaultState,
} from "@/types";

const BASE = import.meta.env.VITE_API_BASE_URL as string;

class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => resp.statusText);
    throw new ApiError(resp.status, body);
  }

  return resp.json() as Promise<T>;
}

// ── Account ───────────────────────────────────────────────────────────────────

export const accountApi = {
  getInfo: (wallet: string) =>
    request<AccountInfo>(`/api/v1/account/info?wallet=${encodeURIComponent(wallet)}`),

  getPositions: (wallet: string) =>
    request<Position[]>(`/api/v1/account/positions?wallet=${encodeURIComponent(wallet)}`),

  getAegisStatus: (wallet: string) =>
    request<{ wallet: string; active: boolean; threshold: number }>(
      `/api/v1/account/aegis/status?wallet=${encodeURIComponent(wallet)}`
    ),

  activateAegis: (wallet: string, threshold: number, referralCode?: string) =>
    request<{ activated: boolean; wallet: string; deposited_usdc: string; threshold: number }>(
      "/api/v1/account/aegis/activate",
      {
        method: "POST",
        body: JSON.stringify({
          wallet,
          threshold,
          ...(referralCode ? { referral_code: referralCode } : {}),
        }),
      }
    ),

  deactivateAegis: (wallet: string) =>
    request<{ status: string }>(`/api/v1/account/aegis/deactivate?wallet=${encodeURIComponent(wallet)}`, {
      method: "POST",
    }),

  demoTriggerHedge: (wallet: string) =>
    request<{ triggered: boolean; symbol: string; side: string; amount: string; order_id: number }>(
      `/api/v1/account/aegis/demo-trigger?wallet=${encodeURIComponent(wallet)}`,
      { method: "POST" }
    ),
};

// ── Vault ─────────────────────────────────────────────────────────────────────

export const vaultApi = {
  getState: () => request<VaultState>("/api/v1/vault/state"),

  getUserShare: (wallet: string) =>
    request<VaultShare>(`/api/v1/vault/share/${encodeURIComponent(wallet)}`),
};

// ── Builder ───────────────────────────────────────────────────────────────────

export const builderApi = {
  getTrades: (limit = 100) =>
    request<unknown[]>(`/api/v1/builder/trades?limit=${limit}`),

  getLeaderboard: () => request<unknown[]>("/api/v1/builder/leaderboard"),
};

// ── Sentiment ─────────────────────────────────────────────────────────────────

export const sentimentApi = {
  get: (symbol: string) =>
    request<SentimentData>(`/api/v1/sentiment/${encodeURIComponent(symbol.toUpperCase())}`),
};

// ── Onboarding ────────────────────────────────────────────────────────────────

export interface AgentKeyInfo {
  agent_public_key: string;
  permissions: string[];
  cannot_do: string[];
}

export const onboardingApi = {
  getAgentKeyInfo: () => request<AgentKeyInfo>("/api/v1/onboarding/agent-key-info"),

  approveBuilderCode: (signedPayload: Record<string, unknown>) =>
    request<{ status: string }>("/api/v1/onboarding/approve-builder", {
      method: "POST",
      body: JSON.stringify(signedPayload),
    }),

  bindAgentKey: (signedPayload: Record<string, unknown>) =>
    request<{ status: string }>("/api/v1/onboarding/bind-agent-key", {
      method: "POST",
      body: JSON.stringify(signedPayload),
    }),
};

export { ApiError };
