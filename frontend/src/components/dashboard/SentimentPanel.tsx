/**
 * Elfa sentiment panel — shows per-symbol sentiment for open positions.
 *
 * Fix vs Phase 3: useQuery is NOT called inside .map() — that violates
 * React rules of hooks. Instead, one batch query fetches all symbols
 * at once via Promise.all, then results are rendered via .map().
 *
 * Polls every 60s (matches backend Elfa refresh cadence).
 * In dev mode, reads the store override instead.
 */

import { useQuery } from "@tanstack/react-query";
import { useWallets, getEmbeddedConnectedWallet } from "@privy-io/react-auth";
import { accountApi, sentimentApi } from "@/services/api";
import { useAegisStore } from "@/stores/useAegisStore";
import { SentimentBadge } from "@/components/shared/Badge";
import type { SentimentData } from "@/types";

function SentimentRow({ data }: { data: SentimentData }) {
  const barColor =
    data.sentiment === "bearish"
      ? "bg-aegis-red"
      : data.sentiment === "bullish"
        ? "bg-aegis-green"
        : "bg-aegis-amber";

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-14 font-mono text-sm font-medium text-white">
        {data.symbol}
      </span>
      <div className="flex-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-aegis-border">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${data.score}%` }}
          />
        </div>
      </div>
      <SentimentBadge sentiment={data.sentiment} score={data.score} />
    </div>
  );
}

export function SentimentPanel() {
  const { wallets } = useWallets();
  const walletAddress = getEmbeddedConnectedWallet(wallets)?.address ?? "";
  const devMode = useAegisStore((s) => s.devMode);
  const storeSentiment = useAegisStore((s) => s.sentimentMap);

  // Fetch positions to know which symbols to show
  const { data: positions = [] } = useQuery({
    queryKey: ["positions", walletAddress],
    queryFn: () => accountApi.getPositions(walletAddress),
    enabled: !!walletAddress,
    refetchInterval: 10_000,
  });

  const symbols = [...new Set(positions.map((p) => p.symbol))];

  // ONE query that fetches sentiment for ALL symbols via Promise.all
  // This avoids calling useQuery inside .map() (rules of hooks violation)
  const { data: sentimentResults = {} } = useQuery<Record<string, SentimentData>>({
    queryKey: ["sentiment-batch", symbols.sort().join(",")],
    queryFn: async () => {
      if (symbols.length === 0) return {};
      const entries = await Promise.all(
        symbols.map(async (symbol) => {
          const data = await sentimentApi.get(symbol);
          return [symbol, data] as const;
        })
      );
      return Object.fromEntries(entries);
    },
    enabled: symbols.length > 0 && !devMode.enabled,
    refetchInterval: 60_000,
    staleTime: 55_000,
  });

  // Build display data — dev mode overrides from store
  const displayData: SentimentData[] = symbols.map((symbol) => {
    if (devMode.enabled && storeSentiment[symbol]) {
      return storeSentiment[symbol];
    }
    return (
      sentimentResults[symbol] ?? {
        symbol,
        score: 50,
        sentiment: "neutral" as const,
      }
    );
  });

  return (
    <div className="rounded-xl border border-aegis-border bg-aegis-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Market Sentiment</h2>
        <span className="text-xs text-aegis-muted">Elfa AI · 60s refresh</span>
      </div>

      {displayData.length === 0 ? (
        <p className="py-4 text-center text-xs text-aegis-muted">
          Open a position to see sentiment
        </p>
      ) : (
        <div className="divide-y divide-aegis-border/50">
          {displayData.map((d) => (
            <SentimentRow key={d.symbol} data={d} />
          ))}
        </div>
      )}

      {devMode.enabled && (
        <p className="mt-2 text-center text-xs text-amber-400/70">
          Simulated — bearish override active
        </p>
      )}
    </div>
  );
}
