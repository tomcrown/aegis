import { useQuery } from "@tanstack/react-query";
import { useSolanaWallet } from "@/hooks/useSolanaWallet";
import { accountApi, sentimentApi } from "@/services/api";
import { useAegisStore } from "@/stores/useAegisStore";
import type { SentimentData } from "@/types";

const SENTIMENT_COLOR = {
  bearish: {
    bar: "bg-aegis-red",
    text: "text-aegis-red",
    bg: "bg-aegis-red/10",
    arrow: "↓",
    label: "Bearish",
  },
  neutral: {
    bar: "bg-aegis-amber",
    text: "text-aegis-amber",
    bg: "bg-aegis-amber/10",
    arrow: "→",
    label: "Neutral",
  },
  bullish: {
    bar: "bg-aegis-green",
    text: "text-aegis-green",
    bg: "bg-aegis-green/10",
    arrow: "↑",
    label: "Bullish",
  },
};

const HEDGE_MULTIPLIER = { bearish: 75, neutral: 50, bullish: 25 };

function SentimentRow({ data }: { data: SentimentData }) {
  const c = SENTIMENT_COLOR[data.sentiment];
  const multiplier = HEDGE_MULTIPLIER[data.sentiment];

  return (
    <div className="group rounded-lg border border-aegis-border bg-aegis-surface2 p-4 transition-all hover:border-aegis-border2">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-aegis-border bg-aegis-surface font-display text-xs font-bold text-aegis-accent">
            {data.symbol.slice(0, 2)}
          </span>
          <div>
            <div className="font-display text-sm font-semibold text-aegis-text">
              {data.symbol}
            </div>
            {data.raw_mentions !== undefined && (
              <div className="font-mono text-[10px] text-aegis-muted">
                {data.raw_mentions.toLocaleString()} mentions / 24h
              </div>
            )}
          </div>
        </div>
        <div
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-display text-xs font-semibold ${c.bg} ${c.text} border-current/20`}
        >
          <span className="text-base leading-none">{c.arrow}</span>
          {c.label}
        </div>
      </div>

      {/* Score bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between font-mono text-[10px] text-aegis-muted">
          <span>Sentiment Score</span>
          <span className={c.text}>{data.score.toFixed(0)} / 100</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-aegis-border">
          <div
            className={`h-full rounded-full transition-all duration-700 ${c.bar}`}
            style={{ width: `${data.score}%` }}
          />
        </div>
        <div className="flex justify-between font-mono text-[10px] text-aegis-muted">
          <span>Bearish</span>
          <span>Neutral</span>
          <span>Bullish</span>
        </div>
      </div>

      {/* Hedge impact */}
      <div className="mt-3 flex items-center justify-between rounded-md border border-aegis-border bg-aegis-surface px-3 py-2">
        <span className="font-mono text-[10px] text-aegis-muted">
          Aegis hedge multiplier
        </span>
        <span className={`font-display text-xs font-bold ${c.text}`}>
          {multiplier}% of position
        </span>
      </div>
    </div>
  );
}

export function SentimentPanel() {
  const { address } = useSolanaWallet();
  const devMode = useAegisStore((s) => s.devMode);
  const storeSentiment = useAegisStore((s) => s.sentimentMap);

  const { data: positions = [] } = useQuery({
    queryKey: ["positions", address],
    queryFn: () => accountApi.getPositions(address),
    enabled: !!address,
    refetchInterval: 10_000,
  });

  const symbols = [...new Set(positions.map((p) => p.symbol))];

  const { data: sentimentResults = {}, dataUpdatedAt } = useQuery<
    Record<string, SentimentData>
  >({
    queryKey: ["sentiment-batch", symbols.sort().join(",")],
    queryFn: async () => {
      if (symbols.length === 0) return {};
      const entries = await Promise.all(
        symbols.map(async (s) => [s, await sentimentApi.get(s)] as const),
      );
      return Object.fromEntries(entries);
    },
    enabled: symbols.length > 0 && !devMode.enabled,
    refetchInterval: 60_000,
    staleTime: 55_000,
  });

  const displayData: SentimentData[] = symbols.map((symbol) => {
    if (devMode.enabled && storeSentiment[symbol])
      return storeSentiment[symbol];
    return (
      sentimentResults[symbol] ?? {
        symbol,
        score: 50,
        sentiment: "neutral" as const,
      }
    );
  });

  const lastUpdate = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  return (
    <div
      className="card animate-fade-in delay-100"
      style={{ animationFillMode: "backwards" }}
    >
      <div className="flex items-center justify-between border-b border-aegis-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="dot-blue" />
          <h2 className="font-display text-sm font-semibold text-aegis-text">
            Elfa AI Sentiment
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {devMode.enabled && (
            <span className="rounded border border-aegis-amber/30 px-2 py-0.5 font-mono text-[10px] text-aegis-amber">
              SIM
            </span>
          )}
          {lastUpdate && !devMode.enabled && (
            <span className="font-mono text-[10px] text-aegis-muted">
              Updated {lastUpdate}
            </span>
          )}
          <span className="rounded border border-aegis-border px-2 py-0.5 font-mono text-[10px] text-aegis-muted">
            60s refresh
          </span>
        </div>
      </div>

      <div className="p-4">
        {displayData.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="12" stroke="#1C2333" strokeWidth="2" />
              <path
                d="M10 16h12M16 10v12"
                stroke="#374151"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <p className="text-sm text-aegis-muted">
              Open a position to see sentiment
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayData.map((d) => (
              <SentimentRow key={d.symbol} data={d} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
