/**
 * Post-login onboarding — two signing steps.
 * Step 1: Approve AEGIS builder code
 * Step 2: Authorize Agent Key
 */
import { useState } from "react";
import { useSolanaWallet } from "@/hooks/useSolanaWallet";
import { onboardingApi } from "@/services/api";
import { canonical_json_ts } from "@/lib/signing";
import { clearReferralCode } from "@/lib/fuul";
import type { JsonValue } from "@/lib/signing";

const BUILDER_CODE = "AEGIS";
const MAX_FEE_RATE = "0.0005";
const EXPIRY_WINDOW = 30000;

interface OnboardingFlowProps {
  onComplete: () => void;
  agentPublicKey?: string;
}

type Step = "intro" | "approve-builder" | "bind-agent" | "done";

function ShieldIcon({ size = 48 }: { size?: number }) {
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

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {[1, 2].map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`flex h-6 w-6 items-center justify-center rounded-full font-display text-xs font-bold transition-all ${
              s < current
                ? "bg-aegis-accent text-white"
                : s === current
                  ? "border-2 border-aegis-accent text-aegis-accent"
                  : "border border-aegis-border text-aegis-muted"
            }`}
          >
            {s < current ? "✓" : s}
          </div>
          {s < 2 && (
            <div
              className={`h-px w-8 transition-all ${s < current ? "bg-aegis-accent" : "bg-aegis-border"}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function OnboardingFlow({
  onComplete,
  agentPublicKey,
}: OnboardingFlowProps) {
  const [step, setStep] = useState<Step>("intro");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { address, signMessage } = useSolanaWallet();

  async function sign(
    payloadToSign: Record<string, JsonValue>,
  ): Promise<string> {
    if (!signMessage) {
      // Fallback: try window.solana directly
      const solana = (window as any).solana;
      if (!solana?.isConnected) throw new Error("Wallet not connected");
      const message = canonical_json_ts(payloadToSign);
      const encoded = new TextEncoder().encode(message);
      const { signature } = await solana.signMessage(encoded, "utf8");
      const { default: bs58 } = await import("bs58");
      return bs58.encode(signature);
    }

    const message = canonical_json_ts(payloadToSign);
    const encoded = new TextEncoder().encode(message);
    const result = await signMessage(encoded);
    const { default: bs58 } = await import("bs58");
    return bs58.encode(result);
  }

  async function approveBuilderCode() {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const timestamp = Date.now();
      const signature = await sign({
        type: "approve_builder_code",
        expiry_window: EXPIRY_WINDOW,
        timestamp,
        data: { builder_code: BUILDER_CODE, max_fee_rate: MAX_FEE_RATE },
      } as Record<string, JsonValue>);
      await onboardingApi.approveBuilderCode({
        account: address,
        signature,
        timestamp,
        expiry_window: EXPIRY_WINDOW,
        builder_code: BUILDER_CODE,
        max_fee_rate: MAX_FEE_RATE,
      });
      setStep("bind-agent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signing failed");
    } finally {
      setLoading(false);
    }
  }

  async function bindAgentKey() {
    if (!address || !agentPublicKey) return;
    setLoading(true);
    setError(null);
    try {
      const timestamp = Date.now();
      const signature = await sign({
        type: "bind_agent_wallet",
        expiry_window: EXPIRY_WINDOW,
        timestamp,
        data: { agent_wallet: agentPublicKey },
      } as Record<string, JsonValue>);
      await onboardingApi.bindAgentKey({
        account: address,
        signature,
        timestamp,
        expiry_window: EXPIRY_WINDOW,
        agent_wallet: agentPublicKey,
      });
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signing failed");
    } finally {
      setLoading(false);
    }
  }

  function completeOnboarding() {
    localStorage.setItem("aegis:onboarded", "true");
    clearReferralCode();
    onComplete();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-aegis-bg px-4">
      {/* Grid bg */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.02]"
        style={{
          backgroundImage:
            "linear-gradient(#4F8EF7 1px, transparent 1px), linear-gradient(90deg, #4F8EF7 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="w-full max-w-md animate-slide-up">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <img
            src="/aegis.png"
            alt="Aegis Logo"
            className="h-20 w-20 object-contain"
          />

          <h1 className="font-display text-2xl font-bold text-aegis-text">
            Aegis Setup
          </h1>
          {step !== "intro" && step !== "done" && (
            <StepIndicator current={step === "approve-builder" ? 1 : 2} />
          )}
        </div>

        <div className="card p-8 shadow-card-lg">
          {/* Intro */}
          {step === "intro" && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="font-display text-xl font-bold text-aegis-text">
                  Activate Protection
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-aegis-muted">
                  Two quick wallet signatures to arm Aegis. This is a one-time
                  setup — Aegis runs autonomously after this.
                </p>
              </div>
              <div className="space-y-2 rounded-xl border border-aegis-border bg-aegis-surface2 p-4">
                {[
                  {
                    n: "①",
                    text: "Approve the Aegis builder code on Pacifica",
                  },
                  { n: "②", text: "Authorize Aegis Agent Key to sign orders" },
                  { n: "③", text: "Protection starts immediately — 24/7" },
                ].map(({ n, text }) => (
                  <div key={n} className="flex items-center gap-3 text-sm">
                    <span className="font-display font-bold text-aegis-accent">
                      {n}
                    </span>
                    <span className="text-aegis-muted">{text}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setStep("approve-builder")}
                className="btn-primary w-full py-3.5"
              >
                Get Started
              </button>
            </div>
          )}

          {/* Step 1 */}
          {step === "approve-builder" && (
            <div className="space-y-5 animate-fade-in">
              <div>
                <div className="label mb-1">Step 1 of 2</div>
                <h2 className="font-display text-xl font-bold text-aegis-text">
                  Approve Builder Code
                </h2>
                <p className="mt-2 text-sm text-aegis-muted">
                  Register Aegis as an authorized builder on your Pacifica
                  account.
                </p>
              </div>
              <div className="rounded-xl border border-aegis-border bg-aegis-surface2 p-4 font-mono text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-aegis-muted">builder_code</span>
                  <span className="text-aegis-accent">"AEGIS"</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-aegis-muted">max_fee_rate</span>
                  <span className="text-aegis-text">0.05%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-aegis-muted">signed_by</span>
                  <span className="text-aegis-text">your wallet</span>
                </div>
              </div>
              {error && (
                <div className="rounded-lg border border-aegis-red/20 bg-aegis-red/5 px-3 py-2 text-xs text-aegis-red">
                  {error}
                </div>
              )}
              <button
                onClick={() => void approveBuilderCode()}
                disabled={loading || !address}
                className="btn-primary w-full py-3.5"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
                    Signing...
                  </span>
                ) : (
                  "Sign & Continue →"
                )}
              </button>
            </div>
          )}

          {/* Step 2 */}
          {step === "bind-agent" && (
            <div className="space-y-5 animate-fade-in">
              <div>
                <div className="label mb-1">Step 2 of 2</div>
                <h2 className="font-display text-xl font-bold text-aegis-text">
                  Authorize Agent Key
                </h2>
                <p className="mt-2 text-sm text-aegis-muted">
                  Allow the Aegis engine to place and cancel orders on your
                  behalf.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-aegis-green/20 bg-aegis-green/5 p-3">
                  <p className="mb-2 font-display text-xs font-semibold text-aegis-green">
                    Can do
                  </p>
                  {["Place hedges", "Cancel orders"].map((p) => (
                    <div
                      key={p}
                      className="flex items-center gap-1.5 text-xs text-aegis-muted"
                    >
                      <span className="text-aegis-green">✓</span>
                      {p}
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-aegis-red/20 bg-aegis-red/5 p-3">
                  <p className="mb-2 font-display text-xs font-semibold text-aegis-red">
                    Cannot do
                  </p>
                  {["Withdraw funds", "Transfer assets"].map((p) => (
                    <div
                      key={p}
                      className="flex items-center gap-1.5 text-xs text-aegis-muted"
                    >
                      <span className="text-aegis-red">✗</span>
                      {p}
                    </div>
                  ))}
                </div>
              </div>
              {agentPublicKey && (
                <div className="rounded-xl border border-aegis-border bg-aegis-surface2 p-3">
                  <div className="label mb-1">Agent Key</div>
                  <p className="break-all font-mono text-xs text-aegis-text">
                    {agentPublicKey}
                  </p>
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-aegis-red/20 bg-aegis-red/5 px-3 py-2 text-xs text-aegis-red">
                  {error}
                </div>
              )}
              <button
                onClick={() => void bindAgentKey()}
                disabled={loading || !address || !agentPublicKey}
                className="btn-primary w-full py-3.5"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
                    Signing...
                  </span>
                ) : (
                  "Authorize & Start Protection →"
                )}
              </button>
            </div>
          )}

          {/* Done */}
          {step === "done" && (
            <div className="flex flex-col items-center gap-6 py-2 animate-fade-in text-center">
              <div className="relative">
                <ShieldIcon size={64} />
                <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-aegis-green font-bold text-white text-xs">
                  ✓
                </div>
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold text-aegis-text">
                  Aegis is Active
                </h2>
                <p className="mt-2 text-sm text-aegis-muted">
                  Your positions are now protected. Aegis monitors your account
                  24/7 and hedges automatically when risk rises.
                </p>
              </div>
              <div className="w-full rounded-xl border border-aegis-accent/20 bg-aegis-accent/5 p-4">
                <div className="flex items-center justify-center gap-2 font-mono text-xs text-aegis-accent">
                  <span className="dot-blue animate-blink" />
                  Protection engine running
                </div>
              </div>
              <button
                onClick={completeOnboarding}
                className="btn-primary w-full py-3.5"
              >
                Go to Dashboard →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
