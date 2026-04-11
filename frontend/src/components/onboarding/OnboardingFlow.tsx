/**
 * Post-login onboarding — two one-time signing steps:
 *   Step 1: Approve AEGIS builder code on Pacifica
 *   Step 2: Authorize the Aegis Agent Key to sign on behalf of the user
 *
 * Both steps require the user's wallet signature.
 * After completion, onboarded=true is stored in localStorage.
 */

import { useState } from "react";
import { useSolanaWallet } from "@/hooks/useSolanaWallet";
import { onboardingApi } from "@/services/api";
import { canonical_json_ts } from "@/lib/signing";
import { clearReferralCode } from "@/lib/fuul";

const BUILDER_CODE = "AEGIS";
const MAX_FEE_RATE = "0.0005";
const EXPIRY_WINDOW = 5000;

interface OnboardingFlowProps {
  onComplete: () => void;
  agentPublicKey?: string;
}

type Step = "intro" | "approve-builder" | "bind-agent" | "done";

export function OnboardingFlow({ onComplete, agentPublicKey }: OnboardingFlowProps) {
  const [step, setStep] = useState<Step>("intro");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { address, wallet, signMessage } = useSolanaWallet();

  async function sign(payloadToSign: Record<string, unknown>): Promise<string> {
    const message = canonical_json_ts(payloadToSign);
    const encodedMessage = new TextEncoder().encode(message);
    const signFn = signMessage ?? wallet?.signMessage?.bind(wallet);
    if (!signFn) throw new Error("No signing method available");
    const signResult = await signFn(encodedMessage);
    const { default: bs58 } = await import("bs58");
    return bs58.encode(signResult);
  }

  async function approveBuilderCode() {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const timestamp = Date.now();
      // Signed payload uses nested `data` — Pacifica reconstructs this for verification
      const payloadToSign = {
        type: "approve_builder_code",
        expiry_window: EXPIRY_WINDOW,
        timestamp,
        data: { builder_code: BUILDER_CODE, max_fee_rate: MAX_FEE_RATE },
      };
      const signature = await sign(payloadToSign);
      // POST body is flat — no type/data wrapper
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
      // Signed message: header fields + agent_wallet nested in data (same pattern as approve_builder_code)
      const payloadToSign = {
        type: "bind_agent_wallet",
        expiry_window: EXPIRY_WINDOW,
        timestamp,
        data: {
          agent_wallet: agentPublicKey,
        },
      };
      const signature = await sign(payloadToSign);
      // POST body: flat — no type/data wrapper
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
      <div className="w-full max-w-md rounded-2xl border border-aegis-border bg-aegis-surface p-8">

        {/* Step: Intro */}
        {step === "intro" && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold text-white">
              Welcome to <span className="text-aegis-accent">Aegis</span>
            </h1>
            <p className="text-sm text-aegis-muted">
              Two quick signatures to activate autonomous protection. This is a
              one-time setup — Aegis runs in the background after this.
            </p>
            <div className="space-y-2 rounded-lg bg-aegis-bg p-4 text-xs text-aegis-muted">
              <p className="font-medium text-white">What happens next:</p>
              <p>① Approve the Aegis builder code on Pacifica</p>
              <p>② Authorize Aegis to place orders on your behalf</p>
              <p>③ Protection starts immediately</p>
            </div>
            <button
              onClick={() => setStep("approve-builder")}
              className="w-full rounded-xl bg-aegis-accent py-3 font-semibold text-white hover:opacity-90"
            >
              Get Started
            </button>
          </div>
        )}

        {/* Step 1: Approve builder code */}
        {step === "approve-builder" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-aegis-accent px-2.5 py-0.5 text-xs font-bold text-white">1/2</span>
              <h2 className="text-xl font-bold text-white">Approve Builder Code</h2>
            </div>
            <p className="text-sm text-aegis-muted">
              This registers Aegis as an authorized builder on your Pacifica account.
              Your wallet signs a one-time approval.
            </p>
            <div className="rounded-lg border border-aegis-border bg-aegis-bg p-3 font-mono text-xs text-aegis-muted">
              <p>builder_code: "AEGIS"</p>
              <p>max_fee_rate: 0.05%</p>
            </div>
            {error && (
              <p className="rounded-lg bg-aegis-red/10 px-3 py-2 text-xs text-aegis-red">{error}</p>
            )}
            <button
              onClick={() => void approveBuilderCode()}
              disabled={loading || !address}
              className="w-full rounded-xl bg-aegis-accent py-3 font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Signing…" : "Sign & Continue"}
            </button>
          </div>
        )}

        {/* Step 2: Bind Agent Key */}
        {step === "bind-agent" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-aegis-accent px-2.5 py-0.5 text-xs font-bold text-white">2/2</span>
              <h2 className="text-xl font-bold text-white">Authorize Agent Key</h2>
            </div>
            <p className="text-sm text-aegis-muted">
              This allows the Aegis engine to place and cancel orders on your behalf
              when your risk threshold is crossed. Your private key never leaves your wallet.
            </p>
            <div className="rounded-lg border border-aegis-green/20 bg-aegis-green/5 p-4 text-sm">
              <p className="mb-2 font-medium text-aegis-green">Agent Key can</p>
              <ul className="space-y-1 text-aegis-muted text-xs">
                <li>✓ Place protective hedge orders</li>
                <li>✓ Cancel orders when risk subsides</li>
              </ul>
            </div>
            <div className="rounded-lg border border-aegis-red/20 bg-aegis-red/5 p-4 text-sm">
              <p className="mb-2 font-medium text-aegis-red">Agent Key cannot</p>
              <ul className="space-y-1 text-aegis-muted text-xs">
                <li>✗ Withdraw funds</li>
                <li>✗ Transfer assets</li>
                <li>✗ Change leverage</li>
              </ul>
            </div>
            {agentPublicKey && (
              <div className="rounded-lg bg-aegis-bg p-3">
                <p className="mb-1 text-xs text-aegis-muted">Agent Key public key</p>
                <p className="break-all font-mono text-xs text-white">{agentPublicKey}</p>
              </div>
            )}
            {error && (
              <p className="rounded-lg bg-aegis-red/10 px-3 py-2 text-xs text-aegis-red">{error}</p>
            )}
            <button
              onClick={() => void bindAgentKey()}
              disabled={loading || !address || !agentPublicKey}
              className="w-full rounded-xl bg-aegis-accent py-3 font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Signing…" : "Authorize & Start Protection"}
            </button>
          </div>
        )}

        {/* Done */}
        {step === "done" && (
          <div className="space-y-4 text-center">
            <div className="flex justify-center text-5xl">🛡</div>
            <h2 className="text-xl font-bold text-white">Aegis is Active</h2>
            <p className="text-sm text-aegis-muted">
              Your positions are now protected. Aegis monitors your account 24/7
              and hedges automatically when risk rises.
            </p>
            <button
              onClick={completeOnboarding}
              className="w-full rounded-xl bg-aegis-accent py-3 font-semibold text-white hover:opacity-90"
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
