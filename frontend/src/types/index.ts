/**
 * Shared TypeScript types for the Aegis frontend.
 * snake_case to exactly match backend wire format.
 */

// ── Pacifica ──────────────────────────────────────────────────────────────────

export interface AccountInfo {
  balance: string;
  account_equity: string;
  available_to_spend: string;
  total_margin_used: string;
  cross_mmr: string;
  positions_count: number;
  updated_at: number;
}

export interface Position {
  symbol: string;
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
  crossMmrPct: number;
  tier: RiskTier;
  aegisActive: boolean;
  threshold: number;
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
  score: number;
  sentiment: SentimentLabel;
  raw_mentions?: number;
}

// ── Intelligence (Elfa v2 features) ──────────────────────────────────────────

export interface NarrativeItem {
  title?: string;
  summary?: string;
  tweet_ids?: string[];
  [key: string]: unknown;
}

export interface TrendingCA {
  token?: string;
  symbol?: string;
  contract_address?: string;
  mention_count?: number;
  platform?: string;
  [key: string]: unknown;
}

export interface NewsItem {
  content?: string;
  text?: string;
  author?: string;
  username?: string;
  timestamp?: number;
  created_at?: number;
  url?: string;
  [key: string]: unknown;
}

export interface CrashAlert {
  symbol: string;
  alert: boolean;
  keywords_hit: string[];
  mention_count: number;
}

export interface SymbolIntelligence {
  news: NewsItem[];
  crash_alert: CrashAlert;
}

export interface IntelligenceSnapshot {
  macro: string;
  narratives: NarrativeItem[];
  trending_twitter: TrendingCA[];
  trending_telegram: TrendingCA[];
  symbols: Record<string, SymbolIntelligence>;
  timestamp_ms: number;
}

// ── Vault ─────────────────────────────────────────────────────────────────────

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

export type WsEventType = "mmr_update" | "hedge_opened" | "hedge_closed" | "alert";

export interface WsEvent {
  type: WsEventType;
  wallet: string;
  payload: Record<string, unknown>;
  timestamp_ms: number;
}

// ── Activity log ──────────────────────────────────────────────────────────────

export interface ActivityEvent {
  id: string;
  type: WsEventType;
  timestamp_ms: number;
  payload: Record<string, unknown>;
}

// ── Dev mode ──────────────────────────────────────────────────────────────────

export interface DevModeState {
  enabled: boolean;
  simulatedPriceDrop: number;
}
