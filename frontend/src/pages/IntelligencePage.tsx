import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSolanaWallet } from "@/hooks/useSolanaWallet";
import { intelligenceApi } from "@/services/api";
import { MarkdownBlock } from "@/components/shared/MarkdownBlock";
import type {
  IntelligenceSnapshot,
  NewsItem,
  TrendingCA,
  NarrativeItem,
} from "@/types";

function SectionHeader({
  title,
  sub,
  badge,
}: {
  title: string;
  sub?: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="font-display text-base font-bold text-aegis-text">
          {title}
        </h3>
        {sub && <p className="text-xs text-aegis-muted mt-0.5">{sub}</p>}
      </div>
      {badge && (
        <span className="rounded-full border border-aegis-accent/20 bg-aegis-accent/5 px-2.5 py-1 font-mono text-[10px] text-aegis-accent">
          {badge}
        </span>
      )}
    </div>
  );
}

function MacroContextCard({ context }: { context: string }) {
  const [expanded, setExpanded] = useState(false);

  const tldrMatch = context.match(/^#[^#](.+?)(?=\n---|\n##|$)/s);
  const tldr = tldrMatch ? tldrMatch[1].trim() : "";
  const hasTldr = tldr.length > 0;

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-aegis-border px-5 py-3 flex items-center justify-between">
        <div>
          <h3 className="font-display text-sm font-bold text-aegis-text">
            Market Climate
          </h3>
          <p className="font-mono text-[10px] text-aegis-muted">
            Elfa AI macro overview · refreshes every 30 min
          </p>
        </div>
        <span className="rounded-full border border-aegis-accent/20 bg-aegis-accent/5 px-2.5 py-1 font-mono text-[10px] text-aegis-accent">
          Elfa AI
        </span>
      </div>

      {!context ? (
        <div className="flex items-center gap-3 px-5 py-6">
          <span className="h-3 w-3 animate-spin rounded-full border border-aegis-accent border-t-transparent" />
          <span className="text-sm text-aegis-muted">
            Fetching market overview...
          </span>
        </div>
      ) : (
        <div className="p-5 space-y-3">
          {/* TL;DR summary pill */}
          {hasTldr && (
            <div className="rounded-xl border border-aegis-accent/20 bg-aegis-accent/5 px-4 py-3">
              <div className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-aegis-accent">
                TL;DR
              </div>
              <p className="text-sm leading-relaxed text-aegis-text">
                {tldr.replace(/^#+\s*/, "").replace(/TL;DR:\s*/i, "")}
              </p>
            </div>
          )}

          {/* Full breakdown — expandable */}
          <div
            className={`overflow-hidden transition-all duration-300 ${expanded ? "max-h-[2000px]" : "max-h-0"}`}
          >
            <MarkdownBlock content={context} className="pt-1" />
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 font-mono text-[10px] text-aegis-muted hover:text-aegis-accent transition-colors"
          >
            <span
              className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            >
              ▼
            </span>
            {expanded ? "Collapse full breakdown" : "Read full breakdown"}
          </button>
        </div>
      )}
    </div>
  );
}

function NarrativesCard({ narratives }: { narratives: NarrativeItem[] }) {
  if (!narratives || narratives.length === 0) {
    return (
      <div className="card p-6">
        <SectionHeader
          title="Trending Narratives"
          sub="Dominant themes forming across crypto social"
        />
        <div className="rounded-xl border border-aegis-border bg-aegis-surface2 px-4 py-8 text-center">
          <p className="text-sm text-aegis-muted">No narratives available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <SectionHeader
        title="Trending Narratives"
        sub="Dominant themes forming across crypto social"
        badge={`${narratives.length} narratives`}
      />
      <div className="space-y-3">
        {narratives.map((n, i) => {
          const title = String(
            n.narrative ?? n.title ?? n.summary ?? `Narrative ${i + 1}`,
          );
          const links: string[] = Array.isArray(n.source_links)
            ? (n.source_links as string[])
            : [];
          return (
            <div
              key={i}
              className="flex gap-3 rounded-xl border border-aegis-border bg-aegis-surface2 px-4 py-3 hover:border-aegis-accent/30 transition-colors"
            >
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-aegis-accent/10 font-display text-xs font-bold text-aegis-accent">
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-aegis-text">{title}</p>
                {links.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {links.slice(0, 2).map((link, j) => {
                      const handle = link.split("/")[3] ?? "";
                      return (
                        <a
                          key={j}
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded border border-aegis-border px-1.5 py-0.5 font-mono text-[9px] text-aegis-muted hover:text-aegis-accent transition-colors"
                        >
                          @{handle}
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CrashAlertsCard({ snapshot }: { snapshot: IntelligenceSnapshot }) {
  const alerts = Object.entries(snapshot.symbols)
    .filter(([, v]) => v.crash_alert?.alert)
    .map(([sym, v]) => ({
      symbol: sym,
      alert: v.crash_alert.alert,
      keywords_hit: v.crash_alert.keywords_hit,
      mention_count: v.crash_alert.mention_count,
    }));

  if (alerts.length === 0) return null;

  return (
    <div className="card p-6 border-aegis-red/30 bg-aegis-red/5">
      <SectionHeader
        title="⚠ Crash Signals Detected"
        sub="Social mentions of exploit/hack/rug terms for your holdings"
        badge={`${alerts.length} alert${alerts.length > 1 ? "s" : ""}`}
      />
      <div className="space-y-3">
        {alerts.map((a, i) => (
          <div
            key={i}
            className="rounded-xl border border-aegis-red/20 bg-aegis-red/5 px-4 py-3"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-display text-sm font-bold text-aegis-red">
                {a.symbol}
              </span>
              <span className="font-mono text-xs text-aegis-red">
                {a.mention_count} mentions
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {(a.keywords_hit ?? []).map((kw) => (
                <span
                  key={kw}
                  className="rounded border border-aegis-red/20 bg-aegis-red/10 px-2 py-0.5 font-mono text-[10px] text-aegis-red"
                >
                  {kw}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TokenNewsCard({ symbol, news }: { symbol: string; news: NewsItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? news : news.slice(0, 5);

  if (!news || news.length === 0) return null;

  const ticker = symbol.replace("USDT", "").replace("PERP", "");

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-aegis-border px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded border border-aegis-border bg-aegis-surface2 font-display text-[9px] font-bold text-aegis-accent">
            {ticker.slice(0, 3)}
          </div>
          <span className="font-display text-xs font-semibold text-aegis-text">
            {ticker} Social Signals
          </span>
        </div>
        <span className="font-mono text-[10px] text-aegis-muted">
          {news.length} posts · 24h
        </span>
      </div>
      <div className="divide-y divide-aegis-border/40">
        {visible.map((item, i) => {
          const link = String(item.link ?? item.url ?? "");
          const author = String(item.author ?? item.username ?? "unknown");
          const ts = item.timestamp ?? item.created_at ?? item.mentionedAt;
          const likes = Number(item.like_count ?? item.likeCount ?? 0);
          const reposts = Number(item.repost_count ?? item.repostCount ?? 0);
          const views = Number(item.view_count ?? item.viewCount ?? 0);
          const smartScore = Number(item.smart_score ?? 0);
          const postType = String(item.type ?? "post");

          return (
            <div
              key={i}
              className="px-5 py-3.5 hover:bg-aegis-surface2 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-aegis-border bg-aegis-surface2 font-mono text-[8px] text-aegis-muted">
                    {author.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <span className="font-mono text-xs text-aegis-accent">
                      @{author}
                    </span>
                    {smartScore > 0 && (
                      <span className="ml-2 rounded bg-aegis-accent/10 px-1.5 py-0.5 font-mono text-[9px] text-aegis-accent">
                        ★ Smart
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="rounded border border-aegis-border px-1.5 py-0.5 font-mono text-[9px] text-aegis-muted capitalize">
                    {postType}
                  </span>
                </div>
              </div>

              {/* Engagement stats */}
              <div className="mt-2 flex items-center gap-3 font-mono text-[10px] text-aegis-muted">
                {views > 0 && <span>👁 {views.toLocaleString()}</span>}
                {likes > 0 && <span>♥ {likes.toLocaleString()}</span>}
                {reposts > 0 && <span>↩ {reposts.toLocaleString()}</span>}
                {ts !== undefined && ts !== null && (
                  <>
                    <span>·</span>
                    <span>
                      {new Date(String(ts)).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </>
                )}
                {link && (
                  <>
                    <span>·</span>
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-aegis-accent hover:underline"
                    >
                      View post ↗
                    </a>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {news.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full py-2.5 font-mono text-xs text-aegis-muted hover:text-aegis-accent transition-colors border-t border-aegis-border"
        >
          {expanded ? "Show less" : `Show ${news.length - 5} more`}
        </button>
      )}
    </div>
  );
}

function SentimentHistoryCard({ symbol }: { symbol: string }) {
  const { data } = useQuery({
    queryKey: ["sentiment-history", symbol],
    queryFn: () => intelligenceApi.getSentimentHistory(symbol),
    refetchInterval: 60_000,
  });

  const scores = data?.scores ?? [];
  if (scores.length < 2) return null;

  const latest = scores[0];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;
  const w = 200;
  const h = 40;
  const pad = 3;

  const pts = scores
    .map((v, i) => {
      const x =
        pad + ((scores.length - 1 - i) / (scores.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (v - min) / range) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const color = latest < 35 ? "#EF4444" : latest >= 65 ? "#22C55E" : "#F59E0B";
  const label = latest < 35 ? "Bearish" : latest >= 65 ? "Bullish" : "Neutral";

  return (
    <div className="rounded-xl border border-aegis-border bg-aegis-surface2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] text-aegis-muted">
          Sentiment trend
        </span>
        <span className="font-mono text-[10px]" style={{ color }}>
          {label} {latest.toFixed(0)}/100
        </span>
      </div>
      <svg width={w} height={h} className="overflow-visible">
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function PerSymbolSection({ snapshot }: { snapshot: IntelligenceSnapshot }) {
  const symbols = Object.keys(snapshot.symbols);
  if (symbols.length === 0) return null;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Per-Token Intelligence"
        sub="News and sentiment history for your positions"
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {symbols.map((sym) => {
          const { news } = snapshot.symbols[sym];
          return (
            <div key={sym} className="space-y-3">
              <SentimentHistoryCard symbol={sym} />
              <TokenNewsCard symbol={sym} news={news} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrendingTokensCard() {
  const { data } = useQuery({
    queryKey: ["trending-tokens-intel"],
    queryFn: () =>
      fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/v1/intelligence/trending-named-tokens`,
      ).then(
        (r) =>
          r.json() as Promise<{
            tokens: {
              symbol: string;
              score: number;
              mentions: number;
              change_pct: number;
            }[];
          }>,
      ),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const tokens = data?.tokens ?? [];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* Named trending tokens — the useful one */}
      <div className="card overflow-hidden">
        <div className="border-b border-aegis-border px-5 py-3 flex items-center justify-between">
          <div>
            <h3 className="font-display text-sm font-bold text-aegis-text">
              Trending Tokens
            </h3>
            <p className="font-mono text-[10px] text-aegis-muted">
              Most mentioned on crypto social · 24h
            </p>
          </div>
          <span className="font-mono text-[10px] text-aegis-muted">
            Elfa AI
          </span>
        </div>

        {tokens.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-8">
            <span className="h-3 w-3 animate-spin rounded-full border border-aegis-accent border-t-transparent" />
            <span className="text-sm text-aegis-muted">
              Loading token data...
            </span>
          </div>
        ) : (
          <div className="divide-y divide-aegis-border/40 max-h-80 overflow-y-auto">
            {tokens.slice(0, 20).map((t, i) => {
              const isUp = t.change_pct >= 0;
              const sentimentColor =
                t.score >= 65
                  ? "text-aegis-green"
                  : t.score < 35
                    ? "text-aegis-red"
                    : "text-aegis-muted";
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-aegis-surface2 transition-colors"
                >
                  <span className="w-5 flex-shrink-0 text-center font-mono text-xs text-aegis-muted">
                    {i + 1}
                  </span>
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-aegis-border bg-aegis-surface2 font-display text-[10px] font-bold text-aegis-accent">
                    {t.symbol.toUpperCase().slice(0, 3)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-sm font-semibold text-aegis-text">
                      {t.symbol.toUpperCase()}
                    </p>
                    <p className="font-mono text-[10px] text-aegis-muted">
                      {t.mentions.toLocaleString()} mentions
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p
                      className={`font-mono text-xs font-semibold ${isUp ? "text-aegis-green" : "text-aegis-red"}`}
                    >
                      {isUp ? "+" : ""}
                      {t.change_pct.toFixed(1)}%
                    </p>
                    <p className={`font-mono text-[9px] ${sentimentColor}`}>
                      {t.score >= 65
                        ? "bullish"
                        : t.score < 35
                          ? "bearish"
                          : "neutral"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* On-chain contract address signals */}
      <OnChainSignalsCard />
    </div>
  );
}

function OnChainSignalsCard() {
  const [platform, setPlatform] = useState<"twitter" | "telegram">("twitter");
  const { data: twitterData } = useQuery({
    queryKey: ["trending-cas", "twitter"],
    queryFn: () => intelligenceApi.getTrendingCAs("twitter"),
    refetchInterval: 1800_000,
    staleTime: 1800_000,
  });
  const { data: telegramData } = useQuery({
    queryKey: ["trending-cas", "telegram"],
    queryFn: () => intelligenceApi.getTrendingCAs("telegram"),
    refetchInterval: 1800_000,
    staleTime: 1800_000,
  });

  const cas = ((platform === "twitter"
    ? twitterData?.tokens
    : telegramData?.tokens) ?? []) as TrendingCA[];

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-aegis-border px-5 py-3 flex items-center justify-between">
        <div>
          <h3 className="font-display text-sm font-bold text-aegis-text">
            On-Chain Signals
          </h3>
          <p className="font-mono text-[10px] text-aegis-muted">
            Contract addresses gaining traction
          </p>
        </div>
        <div className="flex rounded-lg border border-aegis-border overflow-hidden">
          {(["twitter", "telegram"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={`px-3 py-1.5 font-mono text-[10px] transition-colors ${
                platform === p
                  ? "bg-aegis-accent/10 text-aegis-accent"
                  : "text-aegis-muted hover:text-aegis-text"
              }`}
            >
              {p === "twitter" ? "𝕏" : "TG"}
            </button>
          ))}
        </div>
      </div>

      {cas.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-aegis-muted">No signals · cached 30 min</p>
        </div>
      ) : (
        <div className="divide-y divide-aegis-border/40 max-h-80 overflow-y-auto">
          {cas.slice(0, 10).map((t: TrendingCA, i) => {
            const ca = String(t.contractAddress ?? t.contract_address ?? "—");
            const chain = String(t.chain ?? "");
            const mentions = Number(t.mentionCount ?? t.mention_count ?? 0);
            const shortCa =
              ca.length > 16 ? `${ca.slice(0, 6)}…${ca.slice(-6)}` : ca;
            return (
              <div
                key={i}
                className="flex items-center gap-3 px-5 py-3 hover:bg-aegis-surface2 transition-colors"
              >
                <span className="w-5 flex-shrink-0 text-center font-mono text-xs text-aegis-muted">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs text-aegis-text">{shortCa}</p>
                  <p className="font-mono text-[9px] text-aegis-muted capitalize">
                    {chain}
                  </p>
                </div>
                {mentions > 0 && (
                  <span className="font-mono text-xs text-aegis-muted flex-shrink-0">
                    {mentions}×
                  </span>
                )}
                <span className="flex-shrink-0 rounded-full bg-aegis-accent/10 px-2 py-0.5 font-mono text-[9px] text-aegis-accent">
                  Hot
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function IntelligencePage() {
  const { address } = useSolanaWallet();

  const { data: snapshot, isLoading } = useQuery({
    queryKey: ["intelligence-snapshot", address],
    queryFn: () => intelligenceApi.getSnapshot(address!),
    enabled: !!address,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (isLoading || !snapshot) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 animate-fade-in">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-aegis-accent border-t-transparent" />
        <p className="font-mono text-sm text-aegis-muted">
          Loading intelligence data...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Crash alerts — top priority if present */}
      <CrashAlertsCard snapshot={snapshot} />

      {/* Top row — macro + narratives */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <MacroContextCard context={snapshot.macro} />
        <NarrativesCard narratives={snapshot.narratives} />
      </div>

      {/* Trending tokens + on-chain signals */}
      <TrendingTokensCard />

      {/* Per-symbol */}
      <PerSymbolSection snapshot={snapshot} />
    </div>
  );
}
