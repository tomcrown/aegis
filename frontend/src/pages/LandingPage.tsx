/**
 * Aegis Landing Page — animated, no gradients, Space Grotesk display font.
 * Sections: Hero → How it works → Stats → CTA
 */
import { useEffect, useRef, useState } from "react";
import { useLogin } from "@privy-io/react-auth";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

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
          if (start >= target) { setVal(target); clearInterval(timer); }
          else setVal(Math.floor(start));
        }, 16);
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
}

// ── Shield SVG (pure CSS, no gradients) ──────────────────────────────────────
function ShieldLogo({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <path
        d="M40 6L10 18V40C10 56 24 68 40 74C56 68 70 56 70 40V18L40 6Z"
        stroke="#4F8EF7"
        strokeWidth="2.5"
        fill="none"
      />
      <path
        d="M40 14L18 24V40C18 52 28 62 40 67C52 62 62 52 62 40V24L40 14Z"
        fill="#4F8EF7"
        fillOpacity="0.08"
        stroke="#4F8EF7"
        strokeWidth="1.5"
      />
      <path
        d="M29 40L36 47L51 33"
        stroke="#4F8EF7"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Section: How it works step ────────────────────────────────────────────────
function HowStep({
  number,
  title,
  desc,
  delay,
}: {
  number: string;
  title: string;
  desc: string;
  delay: string;
}) {
  return (
    <div
      className={`animate-slide-up opacity-0 ${delay} flex flex-col gap-3`}
      style={{ animationFillMode: "forwards" }}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-aegis-accent/30 bg-aegis-accent/10 font-display text-sm font-bold text-aegis-accent">
          {number}
        </span>
        <div className="h-px flex-1 border-t border-dashed border-aegis-border" />
      </div>
      <h3 className="font-display text-lg font-semibold text-aegis-text">{title}</h3>
      <p className="text-sm leading-relaxed text-aegis-muted">{desc}</p>
    </div>
  );
}

// ── Ticker bar ────────────────────────────────────────────────────────────────
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
      <div className="flex animate-ticker gap-12 whitespace-nowrap">
        {items.map((item, i) => (
          <span key={i} className="flex items-center gap-3 text-xs text-aegis-muted">
            <span className="dot-blue inline-block" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main landing page ─────────────────────────────────────────────────────────
export default function LandingPage() {
  const { login } = useLogin();
  const { setVisible } = useWalletModal();
  const [heroVisible, setHeroVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen bg-aegis-bg text-aegis-text">

      {/* ── Nav ── */}
      <nav className="fixed top-0 z-50 w-full border-b border-aegis-border bg-aegis-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <ShieldLogo size={28} />
            <span className="font-display text-lg font-bold text-aegis-text">Aegis</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={login}
              className="rounded-lg px-4 py-2 text-sm font-medium text-aegis-muted transition hover:text-aegis-text"
            >
              Email Login
            </button>
            <button
              onClick={() => setVisible(true)}
              className="btn-primary py-2 text-sm"
            >
              Launch App
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-20">

        {/* Grid background */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
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

        <div className={`flex flex-col items-center gap-8 text-center transition-all duration-700 ${heroVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>

          {/* Shield */}
          <div className="relative animate-shield-float">
            <div className="absolute inset-0 rounded-full bg-aegis-accent/5 blur-2xl" />
            <ShieldLogo size={88} />
          </div>

          {/* Badge */}
          <div className="flex items-center gap-2 rounded-full border border-aegis-accent/20 bg-aegis-accent/5 px-4 py-1.5">
            <span className="dot-blue inline-block animate-blink" />
            <span className="font-mono text-xs text-aegis-accent">
              Builder Code: AEGIS · Pacifica Testnet Live
            </span>
          </div>

          {/* Headline */}
          <div className="space-y-3">
            <h1 className="font-display text-5xl font-bold leading-tight tracking-tight text-aegis-text sm:text-6xl lg:text-7xl">
              Never Get<br />
              <span className="text-aegis-accent">Liquidated</span>
            </h1>
            <p className="mx-auto max-w-xl text-lg leading-relaxed text-aegis-muted">
              Aegis is an autonomous risk agent that monitors your Pacifica positions
              24/7 and hedges automatically before you reach liquidation.
            </p>
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <button
              onClick={() => setVisible(true)}
              className="btn-primary px-8 py-3.5 text-base"
            >
              Connect Wallet — Start Protection
            </button>
            <button
              onClick={login}
              className="btn-secondary px-8 py-3.5 text-base"
            >
              Continue with Email
            </button>
          </div>

          {/* Trust note */}
          <p className="flex items-center gap-2 text-xs text-aegis-muted">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1L1 3.5V6C1 8.8 3.2 11.2 6 12C8.8 11.2 11 8.8 11 6V3.5L6 1Z" stroke="#6B7280" strokeWidth="1" fill="none" />
            </svg>
            Agent Key cannot withdraw funds or transfer assets. Ever.
          </p>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 flex flex-col items-center gap-2 animate-bounce">
          <span className="text-xs text-aegis-muted">Scroll to explore</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 6L8 11L13 6" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </section>

      {/* ── Ticker ── */}
      <TickerBar />

      {/* ── Stats ── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-4 flex justify-center">
          <span className="section-title">Live on Pacifica Testnet</span>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="border-t border-aegis-border bg-aegis-surface">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="mb-12 text-center">
            <span className="section-title">Protocol</span>
            <h2 className="mt-2 font-display text-3xl font-bold text-aegis-text">
              How Aegis Works
            </h2>
          </div>
          <div className="grid gap-8 sm:grid-cols-3">
            <HowStep
              number="01"
              title="Monitor"
              desc="Aegis polls your Pacifica cross_mmr every 500ms. As margin health declines toward liquidation, the risk engine classifies your account as Safe, Watch, or Hedge."
              delay="delay-100"
            />
            <HowStep
              number="02"
              title="Analyse"
              desc="When risk rises, Elfa AI sentiment data is applied. Bearish market sentiment increases the hedge size. Bullish sentiment reduces it. The system adapts to market mood."
              delay="delay-300"
            />
            <HowStep
              number="03"
              title="Protect"
              desc="A market order in the opposing direction is signed by the Aegis Agent Key and submitted directly to Pacifica. A stop-loss is placed on the hedge automatically."
              delay="delay-500"
            />
          </div>
        </div>
      </section>

      {/* ── Trust / Security ── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-12 text-center">
          <span className="section-title">Security Model</span>
          <h2 className="mt-2 font-display text-3xl font-bold text-aegis-text">
            Built Without Compromises
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: "✓",
              color: "text-aegis-green border-aegis-green/20 bg-aegis-green/5",
              title: "Ed25519 Agent Key",
              desc: "Every order is signed by a dedicated keypair. Your wallet only signs once during setup.",
            },
            {
              icon: "✓",
              color: "text-aegis-green border-aegis-green/20 bg-aegis-green/5",
              title: "Zero Custody",
              desc: "The agent key cannot withdraw funds, transfer assets, or modify leverage beyond what you set.",
            },
            {
              icon: "✓",
              color: "text-aegis-green border-aegis-green/20 bg-aegis-green/5",
              title: "Verifiable On-Chain",
              desc: "Every hedge is attributed to builder_code=AEGIS on Pacifica. Full audit trail.",
            },
            {
              icon: "✓",
              color: "text-aegis-green border-aegis-green/20 bg-aegis-green/5",
              title: "Encrypted Key Storage",
              desc: "Agent key is encrypted with Fernet AES-128 and stored in Redis. Never exposed in logs.",
            },
            {
              icon: "✓",
              color: "text-aegis-green border-aegis-green/20 bg-aegis-green/5",
              title: "Reduce-Only Exits",
              desc: "Stop-loss orders are reduce-only — they can only close the hedge, never open new exposure.",
            },
            {
              icon: "✓",
              color: "text-aegis-green border-aegis-green/20 bg-aegis-green/5",
              title: "Auto Recovery",
              desc: "When your account health recovers above threshold, Aegis cancels the hedge automatically.",
            },
          ].map(({ icon, color, title, desc }) => (
            <div key={title} className={`card-hover rounded-xl border p-5 ${color}`}>
              <div className="mb-3 flex items-center gap-2">
                <span className="font-bold">{icon}</span>
                <span className="font-display text-sm font-semibold">{title}</span>
              </div>
              <p className="text-sm leading-relaxed opacity-70">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="border-t border-aegis-border bg-aegis-surface">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-8 px-6 py-24 text-center">
          <ShieldLogo size={56} />
          <div>
            <h2 className="font-display text-4xl font-bold text-aegis-text">
              Start Protection Now
            </h2>
            <p className="mt-3 text-aegis-muted">
              Two signatures. One-time setup. Aegis runs autonomously from that point forward.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => setVisible(true)}
              className="btn-primary px-8 py-3.5"
            >
              Connect Wallet
            </button>
            <button
              onClick={login}
              className="btn-secondary px-8 py-3.5"
            >
              Continue with Email
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-aegis-border px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldLogo size={20} />
            <span className="font-display text-sm font-semibold text-aegis-muted">Aegis</span>
          </div>
          <span className="font-mono text-xs text-aegis-muted">
            builder_code=AEGIS · Pacifica Hackathon 2026
          </span>
        </div>
      </footer>
    </div>
  );
}
