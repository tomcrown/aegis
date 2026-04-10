/**
 * Shared TypeScript types for the Aegis frontend.
 *
 * IMPORTANT — naming convention:
 *   Pacifica API and Aegis backend both return snake_case JSON.
 *   All types here use snake_case to exactly match wire format.
 *   No transformation layer needed — parse once, use directly.
 *
 *   Decimal values from Pacifica are always strings. Never coerce to number
 *   until the display layer (use parseFloat only for rendering).
 */

// ── Pacifica ──────────────────────────────────────────────────────────────────

export interface AccountInfo {
  balance: string;
  account_equity: string;
  available_to_spend: string;
  total_margin_used: string;
  /**
   * Raw cross_mmr from Pacifica — e.g. "0.8432".
   * Multiply by 100 for display percentage.
   */
  cross_mmr: string;
  positions_count: number;
  updated_at: number;
}

export interface Position {
  symbol: string;
  /** "long" or "short" — NOT "bid"/"ask" (those are order sides) */
  side: "long" | "short";
  amount: string;
  entry_price: string;
  margin: string;
  funding: string;
  isolated: boolean;
  created_at: number;
  updated_at: number;
}

// ── Risk ─────────────────────────────────────────────────────────────────────

export type RiskTier = "safe" | "watch" | "hedge";

export interface RiskState {
  crossMmrPct: number; // derived from cross_mmr * 100, lives only in store
  tier: RiskTier;
  aegisActive: boolean;
  threshold: number; // user-configured trigger, default 75
}

// ── Elfa sentiment ────────────────────────────────────────────────────────────

export const Sentiment = {
  BEARISH: "bearish",
  NEUTRAL: "neutral",
  BULLISH: "bullish",
} as const;
export type Sentiment = (typeof Sentiment)[keyof typeof Sentiment];
export type SentimentLabel = Sentiment;

export interface SentimentData {
  symbol: string;
  score: number;      // 0–100 normalised
  sentiment: SentimentLabel;
  raw_mentions?: number;
}

// ── Vault — snake_case to match backend wire format ───────────────────────────

export interface VaultState {
  total_tvl: string;
  active_protections: number;
  total_yield_distributed: string;
  user_count: number;
}

export interface VaultShare {
  wallet: string;
  deposited_usdc: string;
  share_fraction: string;
  yield_earned: string;
  active_hedges: number;
  joined_at_ms: number;
}

// ── WebSocket events ──────────────────────────────────────────────────────────

export type WsEventType =
  | "mmr_update"
  | "hedge_opened"
  | "hedge_closed"
  | "alert";

export interface WsEvent {
  type: WsEventType;
  wallet: string;
  payload: Record<string, unknown>;
  timestamp_ms: number;
}

// ── Dev mode — FRONTEND ONLY, never sent to backend ──────────────────────────

export interface DevModeState {
  enabled: boolean;
  simulatedPriceDrop: number; // default 4 (%)
}
