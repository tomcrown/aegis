import type { RiskTier, SentimentLabel } from "@/types";

interface TierBadgeProps { tier: RiskTier; }

const TIER_CONFIG: Record<RiskTier, { dot: string; text: string; bg: string; border: string; label: string }> = {
  safe:  { dot: "dot-green", text: "text-aegis-green",  bg: "bg-aegis-green/10",  border: "border-aegis-green/20",  label: "Safe"     },
  watch: { dot: "dot-amber", text: "text-aegis-amber",  bg: "bg-aegis-amber/10",  border: "border-aegis-amber/20",  label: "Watching" },
  hedge: { dot: "dot-red",   text: "text-aegis-red",    bg: "bg-aegis-red/10",    border: "border-aegis-red/20",    label: "Hedging"  },
};

export function TierBadge({ tier }: TierBadgeProps) {
  const c = TIER_CONFIG[tier];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-display text-xs font-semibold ${c.bg} ${c.border} ${c.text}`}>
      <span className={c.dot} />
      {c.label}
    </span>
  );
}

const SENTIMENT_CONFIG: Record<SentimentLabel, { color: string; bg: string; border: string; arrow: string }> = {
  bearish: { color: "text-aegis-red",   bg: "bg-aegis-red/10",   border: "border-aegis-red/20",   arrow: "↓" },
  neutral: { color: "text-aegis-amber", bg: "bg-aegis-amber/10", border: "border-aegis-amber/20", arrow: "→" },
  bullish: { color: "text-aegis-green", bg: "bg-aegis-green/10", border: "border-aegis-green/20", arrow: "↑" },
};

export function SentimentBadge({ sentiment, score }: { sentiment: SentimentLabel; score?: number }) {
  const c = SENTIMENT_CONFIG[sentiment];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-display text-xs font-semibold ${c.bg} ${c.border} ${c.color}`}>
      <span>{c.arrow}</span>
      {sentiment.charAt(0).toUpperCase() + sentiment.slice(1)}
      {score !== undefined && <span className="opacity-50 font-normal ml-0.5">({score.toFixed(0)})</span>}
    </span>
  );
}
