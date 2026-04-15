/**
 * Aegis Landing Page
 * Hero: animated ring + letter-by-letter headline
 * Sections: scroll-reveal animations via IntersectionObserver
 */
import { useEffect, useRef, useState } from "react";

// ── useInView hook ────────────────────────────────────────────────────────────
function useInView(options?: IntersectionObserverInit) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, ...options },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, inView };
}

// ── RevealSection — wraps a section with a staggered reveal ──────────────────
function RevealSection({
  children,
  className = "",
  delay = 0,
  animation = "reveal-up",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  animation?: "reveal-up" | "reveal-scale" | "reveal-left";
}) {
  const { ref, inView } = useInView();
  return (
    <div
      ref={ref}
      className={`${className} ${inView ? animation : "opacity-0"}`}
      style={{ animationDelay: inView ? `${delay}ms` : undefined }}
    >
      {children}
    </div>
  );
}

// ── StaggerGrid — children reveal one by one ─────────────────────────────────
function StaggerGrid({
  children,
  className = "",
  stagger = 80,
}: {
  children: React.ReactNode[];
  className?: string;
  stagger?: number;
}) {
  const { ref, inView } = useInView();
  return (
    <div ref={ref} className={className}>
      {children.map((child, i) => (
        <div
          key={i}
          className={inView ? "reveal-up" : "opacity-0"}
          style={{ animationDelay: inView ? `${i * stagger}ms` : undefined }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

// ── Animated counter ──────────────────────────────────────────────────────────
function Counter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        let start = 0;
        const step = target / 60;
        const timer = setInterval(() => {
          start += step;
          if (start >= target) {
            setVal(target);
            clearInterval(timer);
          } else setVal(Math.floor(start));
        }, 16);
      },
      { threshold: 0.5 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return (
    <span ref={ref}>
      {val.toLocaleString()}
      {suffix}
    </span>
  );
}

// ── AnimatedWord — letters stagger in ────────────────────────────────────────
function AnimatedWord({
  text,
  baseDelay = 0,
  color,
}: {
  text: string;
  baseDelay?: number;
  color?: string;
}) {
  return (
    <>
      {text.split("").map((char, i) => (
        <span
          key={i}
          className="letter-animate"
          style={{ animationDelay: `${baseDelay + i * 38}ms`, color }}
        >
          {char === " " ? "\u00A0" : char}
        </span>
      ))}
    </>
  );
}

// ── Hero ring ─────────────────────────────────────────────────────────────────
function HeroRing({ size = 220 }: { size?: number }) {
  const thickness = 12;
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const center = size / 2;
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setPct(18), 400);
    return () => clearTimeout(t);
  }, []);

  const dashOffset = circumference * (1 - pct / 100);
  const color = "#22C55E";
  const glow = "rgba(34,197,94,0.45)";
  const softGlow = "rgba(34,197,94,0.12)";

  return (
    <div
      className="hero-shield-float relative"
      style={{ width: size, height: size }}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ boxShadow: `0 0 80px 20px ${softGlow}` }}
      />
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        style={{
          filter: `drop-shadow(0 0 8px ${glow}) drop-shadow(0 0 2px ${color})`,
        }}
      >
        <circle
          cx={center}
          cy={center}
          r={r + thickness / 2 + 5}
          fill="none"
          stroke={color}
          strokeWidth="1"
          opacity="0.08"
        />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="#1A2035"
          strokeWidth={thickness}
        />
        {[0, 25, 50, 75].map((tick) => {
          const angle = (tick / 100) * 360 - 90;
          const rad = (angle * Math.PI) / 180;
          return (
            <line
              key={tick}
              x1={center + (r - thickness / 2 - 3) * Math.cos(rad)}
              y1={center + (r - thickness / 2 - 3) * Math.sin(rad)}
              x2={center + (r + thickness / 2 + 3) * Math.cos(rad)}
              y2={center + (r + thickness / 2 + 3) * Math.sin(rad)}
              stroke="#252F47"
              strokeWidth="1.5"
            />
          );
        })}
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1)",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
        <svg
          width="28"
          height="28"
          viewBox="0 0 80 80"
          fill="none"
          className="mb-1"
        >
          <path
            d="M40 6L10 18V40C10 56 24 68 40 74C56 68 70 56 70 40V18L40 6Z"
            stroke={color}
            strokeWidth="3"
            fill="none"
          />
          <path
            d="M29 40L36 47L51 33"
            stroke={color}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span
          className="font-display text-base font-bold"
          style={{ color, textShadow: `0 0 16px ${glow}` }}
        >
          PROTECTED
        </span>
        <span className="font-mono text-[10px] tracking-[0.2em] text-aegis-muted">
          200.0% ratio
        </span>
      </div>
      <OrbitDot radius={r + thickness / 2 + 14} size={size} color={color} />
    </div>
  );
}

function OrbitDot({
  radius,
  size,
  color,
}: {
  radius: number;
  size: number;
  color: string;
}) {
  const [angle, setAngle] = useState(0);
  useEffect(() => {
    let frame: number;
    let start: number | null = null;
    const duration = 6000;
    const animate = (ts: number) => {
      if (!start) start = ts;
      const elapsed = (ts - start) % duration;
      setAngle((elapsed / duration) * 360);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  const rad = ((angle - 90) * Math.PI) / 180;
  const cx = size / 2 + radius * Math.cos(rad);
  const cy = size / 2 + radius * Math.sin(rad);

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 8px 2px ${color}`,
        left: cx - 4,
        top: cy - 4,
      }}
    />
  );
}

// ── Ticker ────────────────────────────────────────────────────────────────────
const TICKER_ITEMS = [
  "Autonomous Hedging",
  "Elfa AI Sentiment",
  "Ed25519 Agent Key Signing",
  "Real-time Risk Monitoring",
  "Pacifica Builder Code: AEGIS",
  "Zero Withdrawal Permissions",
  "500ms Polling Cadence",
  "Automatic Stop-Loss Guards",
];

function TickerBar() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div className="overflow-hidden border-y border-aegis-border bg-aegis-surface py-3">
      <div className="animate-ticker flex gap-12 whitespace-nowrap">
        {items.map((item, i) => (
          <span
            key={i}
            className="flex items-center gap-3 text-xs text-aegis-muted"
          >
            <span className="dot-blue inline-block" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Section header with line ──────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  const { ref, inView } = useInView();
  return (
    <div ref={ref} className="mb-4 flex flex-col items-center gap-3">
      <div
        className={`flex items-center gap-3 ${inView ? "reveal-up" : "opacity-0"}`}
      >
        <div className="h-px w-12 bg-gradient-to-r from-transparent to-aegis-accent/40" />
        <span className="section-title">{children}</span>
        <div className="h-px w-12 bg-gradient-to-l from-transparent to-aegis-accent/40" />
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function LandingPage({ onConnect }: { onConnect: () => void }) {
  const [heroVisible, setHeroVisible] = useState(false);

  const handleConnect = async () => {
    const solana = (window as any).solana;
    if (!solana?.isPhantom) {
      alert("Phantom wallet not found. Please install it from phantom.app");
      return;
    }
    try {
      await solana.connect();
      sessionStorage.setItem("aegis:connected", "true");
      onConnect(); // ← triggers App to swap to dashboard
    } catch (err) {
      console.error("Phantom connect failed", err);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  const neverGetDelay = 200;
  const liquidatedDelay = 600;

  return (
    <div className="min-h-screen bg-aegis-bg text-aegis-text">
      {/* ── Nav ── */}
      <nav className="fixed top-0 z-50 w-full border-b border-aegis-border bg-aegis-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <img
              src="/aegis.png"
              alt="Aegis Logo"
              className="h-20 w-20 object-contain"
            />
            <span className="font-display text-lg font-bold text-aegis-text">
              Aegis
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => void handleConnect()}
              className="btn-primary py-2 text-sm"
            >
              Launch App
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-20">
        {/* Grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(#4F8EF7 1px, transparent 1px), linear-gradient(90deg, #4F8EF7 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        {/* Corner accents */}
        <div className="pointer-events-none absolute left-0 top-0 h-px w-48 bg-aegis-accent/30" />
        <div className="pointer-events-none absolute left-0 top-0 h-48 w-px bg-aegis-accent/30" />
        <div className="pointer-events-none absolute right-0 bottom-0 h-px w-48 bg-aegis-accent/30" />
        <div className="pointer-events-none absolute right-0 bottom-0 h-48 w-px bg-aegis-accent/30" />

        <div
          className={`flex flex-col items-center gap-10 text-center transition-all duration-700 ${
            heroVisible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-8"
          }`}
        >
          <div className="relative">
            <div
              className="hero-ring-breathe pointer-events-none absolute inset-0 rounded-full"
              style={{
                boxShadow:
                  "0 0 120px 40px rgba(34,197,94,0.06), 0 0 60px 10px rgba(34,197,94,0.08)",
              }}
            />
            <HeroRing size={220} />
          </div>

          <div className="space-y-2" style={{ perspective: "600px" }}>
            <h1 className="font-display text-5xl font-bold leading-tight tracking-tight text-aegis-text sm:text-6xl lg:text-7xl">
              {heroVisible && (
                <>
                  <span>
                    <AnimatedWord text="Never " baseDelay={neverGetDelay} />
                    <AnimatedWord
                      text="Get"
                      baseDelay={neverGetDelay + 6 * 38}
                    />
                  </span>
                  <br />
                  <span>
                    <AnimatedWord
                      text="Liquidated"
                      baseDelay={liquidatedDelay}
                      color="#4F8EF7"
                    />
                  </span>
                </>
              )}
            </h1>
            <p
              className="mx-auto max-w-xl text-lg leading-relaxed text-aegis-muted"
              style={{
                opacity: heroVisible ? 1 : 0,
                transform: heroVisible ? "translateY(0)" : "translateY(10px)",
                transition: "opacity 0.6s ease 1.2s, transform 0.6s ease 1.2s",
              }}
            >
              The market doesn't sleep. Neither does Aegis. Connect your wallet,
              set your threshold, and let Aegis hedge your Pacifica positions
              automatically — before liquidation ever reaches you.
            </p>
          </div>

          <div
            className="flex flex-col items-center gap-3 sm:flex-row"
            style={{
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? "translateY(0)" : "translateY(10px)",
              transition: "opacity 0.6s ease 1.5s, transform 0.6s ease 1.5s",
            }}
          >
            <button
              onClick={() => void handleConnect()}
              className="btn-primary px-8 py-3.5 text-base"
            >
              Activate Protection
            </button>
          </div>
        </div>

        <div className="absolute bottom-10 flex flex-col items-center gap-2 animate-bounce">
          <span className="text-xs text-aegis-muted">Scroll to explore</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 6L8 11L13 6"
              stroke="#6B7280"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </section>

      {/* ── Ticker ── */}
      <TickerBar />

      {/* ── Stats ── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <SectionLabel>Aegis by the Numbers</SectionLabel>
        <StaggerGrid
          className="grid grid-cols-2 gap-4 sm:grid-cols-4"
          stagger={100}
        >
          {[
            { label: "Positions Monitored", value: 1, suffix: "" },
            { label: "Hedges Executed", value: 5, suffix: "" },
            { label: "Polling Cadence", value: 500, suffix: "ms" },
            { label: "Agent Key Permissions", value: 2, suffix: "" },
          ].map(({ label, value, suffix }) => (
            <div key={label} className="card p-6 text-center">
              <div className="font-display text-3xl font-bold text-aegis-text">
                <Counter target={value} suffix={suffix} />
              </div>
              <div className="mt-1 text-xs text-aegis-muted">{label}</div>
            </div>
          ))}
        </StaggerGrid>
      </section>

      {/* ── How it works ── */}
      <section className="border-t border-aegis-border bg-aegis-surface">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <RevealSection className="mb-12 text-center">
            <SectionLabel>Protocol</SectionLabel>
            <h2 className="mt-2 font-display text-3xl font-bold text-aegis-text">
              Three Steps Between You and Liquidation
            </h2>
          </RevealSection>

          <StaggerGrid className="grid gap-8 sm:grid-cols-3" stagger={140}>
            {[
              {
                number: "01",
                title: "Monitor",
                desc: "Aegis watches your Pacifica positions every 500 milliseconds — day and night. The moment your margin health starts declining, the risk engine knows before you do.",
              },
              {
                number: "02",
                title: "Analyse",
                desc: "Aegis reads live social signals from Elfa AI. Bearish market? Larger hedge. Bullish? Lighter protection. It even detects crash keywords on Twitter and acts before price moves.",
              },
              {
                number: "03",
                title: "Protect",
                desc: "Aegis places a real hedge order on Pacifica — signed by your delegated Agent Key, verified on-chain, with a stop-loss attached automatically. No alerts. Actual execution.",
              },
            ].map(({ number, title, desc }) => (
              <div key={number} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-aegis-accent/30 bg-aegis-accent/10 font-display text-sm font-bold text-aegis-accent">
                    {number}
                  </span>
                  <div className="h-px flex-1 border-t border-dashed border-aegis-border" />
                </div>
                <h3 className="font-display text-lg font-semibold text-aegis-text">
                  {title}
                </h3>
                <p className="text-sm leading-relaxed text-aegis-muted">
                  {desc}
                </p>
              </div>
            ))}
          </StaggerGrid>
        </div>
      </section>

      {/* ── Security ── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <RevealSection className="mb-12 text-center">
          <SectionLabel>Security Model</SectionLabel>
          <h2 className="mt-2 font-display text-3xl font-bold text-aegis-text">
            Your Money Stays Yours
          </h2>
        </RevealSection>

        <StaggerGrid
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          stagger={70}
        >
          {[
            {
              title: "Ed25519 Agent Key",
              desc: "A dedicated signing keypair handles every hedge order. Your main wallet signs once during setup and never again.",
            },
            {
              title: "Zero Custody",
              desc: "The Agent Key has one job — place hedge orders. It cannot withdraw funds, move assets, or touch anything outside of hedging.",
            },
            {
              title: "Verifiable On-Chain",
              desc: "Every hedge Aegis places is tagged builder_code=AEGIS on Pacifica. You can verify every single action yourself.",
            },
            {
              title: "Encrypted Key Storage",
              desc: "Your Agent Key is encrypted with AES-128 and stored securely. Never logged, never exposed, never accessible outside the Aegis engine.",
            },
            {
              title: "Reduce-Only Exits",
              desc: "When Aegis closes a hedge, it uses reduce-only orders — it can only close what it opened, never creating new exposure.",
            },
            {
              title: "Auto Recovery",
              desc: "When your margin ratio recovers, Aegis closes the hedge automatically. Steps back when you don't need it.",
            },
          ].map(({ title, desc }) => (
            <div
              key={title}
              className="card-hover rounded-xl border border-aegis-green/15 bg-aegis-green/[0.03] p-5"
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="font-bold text-aegis-green">✓</span>
                <span className="font-display text-sm font-semibold text-aegis-green">
                  {title}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-aegis-muted">{desc}</p>
            </div>
          ))}
        </StaggerGrid>
      </section>

      {/* ── Final CTA ── */}
      <section className="border-t border-aegis-border bg-aegis-surface">
        <RevealSection
          className="mx-auto flex max-w-2xl flex-col items-center gap-8 px-6 py-24 text-center"
          animation="reveal-scale"
        >
          <HeroRing size={180} />
          <div>
            <h2 className="font-display text-4xl font-bold text-aegis-text">
              Start Protection Now
            </h2>
            <p className="mt-3 text-aegis-muted">
              Two signatures. Thirty seconds. Then Aegis runs on its own —
              hedging, monitoring, protecting — while you get on with your life.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => void handleConnect()}
              className="btn-primary px-8 py-3.5"
            >
              Connect Wallet
            </button>
          </div>
        </RevealSection>
      </section>
    </div>
  );
}
