import type { RiskTier, SentimentLabel } from "@/types";

interface TierBadgeProps {
  tier: RiskTier;
}

const TIER_STYLES: Record<RiskTier, string> = {
  safe: "bg-aegis-green/10 text-aegis-green border-aegis-green/20",
  watch: "bg-aegis-amber/10 text-aegis-amber border-aegis-amber/20",
  hedge: "bg-aegis-red/10 text-aegis-red border-aegis-red/20",
};

const TIER_LABELS: Record<RiskTier, string> = {
  safe: "Safe",
  watch: "Watching",
  hedge: "Hedging",
};

export function TierBadge({ tier }: TierBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${TIER_STYLES[tier]}`}
    >
      <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
      {TIER_LABELS[tier]}
    </span>
  );
}

interface SentimentBadgeProps {
  sentiment: SentimentLabel;
  score?: number;
}

const SENTIMENT_STYLES: Record<SentimentLabel, string> = {
  bearish: "bg-aegis-red/10 text-aegis-red border-aegis-red/20",
  neutral: "bg-aegis-amber/10 text-aegis-amber border-aegis-amber/20",
  bullish: "bg-aegis-green/10 text-aegis-green border-aegis-green/20",
};

export function SentimentBadge({ sentiment, score }: SentimentBadgeProps) {
  const label = sentiment.charAt(0).toUpperCase() + sentiment.slice(1);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${SENTIMENT_STYLES[sentiment]}`}
    >
      {label}
      {score !== undefined && (
        <span className="opacity-60">({score.toFixed(0)})</span>
      )}
    </span>
  );
}
