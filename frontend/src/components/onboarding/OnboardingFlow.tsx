/**
 * Post-login onboarding — two one-time signing steps:
 *   Step 1: User approves AEGIS builder code (signs payload with Privy wallet)
 *   Step 2: Agent Key info is displayed (read-only, no signing needed)
 *
 * After completion, onboarded=true is stored in localStorage.
 * The user never needs to do this again.
 *
 * Signing uses Privy's signMessage on the embedded Solana wallet.
 * The backend then forwards the signed approval to Pacifica.
 */

import { useState } from "react";
import { useWallets, getEmbeddedConnectedWallet } from "@privy-io/react-auth";
import { onboardingApi } from "@/services/api";
import { canonical_json_ts } from "@/lib/signing";
import { clearReferralCode, getStoredReferralCode } from "@/lib/fuul";

const BUILDER_CODE = "AEGIS";
const MAX_FEE_RATE = "0.0005";
const EXPIRY_WINDOW = 5000;

interface OnboardingFlowProps {
  onComplete: () => void;
}

type Step = "intro" | "approve-builder" | "agent-key" | "done";

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState<Step>("intro");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { wallets } = useWallets();
  const wallet = getEmbeddedConnectedWallet(wallets);

  async function approveBuilderCode() {
    if (!wallet) return;
    setLoading(true);
    setError(null);

    try {
      const timestamp = Date.now();
      const payload = {
        account: wallet.address,
        expiry_window: EXPIRY_WINDOW,
        timestamp,
        data: {
          builder_code: BUILDER_CODE,
          max_fee_rate: MAX_FEE_RATE,
        },
      };

      // Canonical JSON → sign with Privy embedded wallet
      const message = canonical_json_ts(payload);
      const encodedMessage = new TextEncoder().encode(message);
      const signResult = await wallet.signMessage(encodedMessage);

      // base58 encode the signature
      const { default: bs58 } = await import("bs58");
      const signatureB58 = bs58.encode(signResult);

      const signedPayload = { ...payload, signature: signatureB58 };
      await onboardingApi.approveBuilderCode(signedPayload);

      setStep("agent-key");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signing failed");
    } finally {
      setLoading(false);
    }
  }

  function completeOnboarding() {
    localStorage.setItem("aegis:onboarded", "true");
    // Referral code has been sent to backend during activation — safe to clear now
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
              Two quick steps to activate autonomous protection for your positions.
              This is a one-time setup — Aegis will run in the background after this.
            </p>
            <div className="space-y-2 rounded-lg bg-aegis-bg p-4 text-xs text-aegis-muted">
              <p className="font-medium text-white">What happens next:</p>
              <p>① You approve the Aegis builder code on Pacifica (1 signature)</p>
              <p>② We show you the Agent Key permissions — read only</p>
              <p>③ Aegis starts monitoring your positions</p>
            </div>
            <button
              onClick={() => setStep("approve-builder")}
              className="w-full rounded-xl bg-aegis-accent py-3 font-semibold text-white hover:opacity-90"
            >
              Get Started
            </button>
          </div>
        )}

        {/* Step: Approve builder code */}
        {step === "approve-builder" && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">Step 1 of 2</h2>
            <h3 className="font-semibold text-aegis-accent">
              Approve Aegis Builder Code
            </h3>
            <p className="text-sm text-aegis-muted">
              This tells Pacifica that Aegis is authorised to place orders on your
              behalf. Your wallet signs a one-time approval — Aegis never sees your
              private key.
            </p>
            <div className="rounded-lg border border-aegis-border bg-aegis-bg p-3 font-mono text-xs text-aegis-muted">
              <p>builder_code: "AEGIS"</p>
              <p>max_fee_rate: 0.0005</p>
            </div>

            {error && (
              <p className="rounded-lg bg-aegis-red/10 px-3 py-2 text-xs text-aegis-red">
                {error}
              </p>
            )}

            <button
              onClick={() => void approveBuilderCode()}
              disabled={loading || !wallet}
              className="w-full rounded-xl bg-aegis-accent py-3 font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Signing…" : "Sign & Approve"}
            </button>
          </div>
        )}

        {/* Step: Agent Key info */}
        {step === "agent-key" && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">Step 2 of 2</h2>
            <h3 className="font-semibold text-aegis-accent">Agent Key Permissions</h3>
            <p className="text-sm text-aegis-muted">
              The Aegis Agent Key can place and cancel orders on your account.
              That is all it can do.
            </p>
            <div className="rounded-lg border border-aegis-green/20 bg-aegis-green/5 p-4 text-sm">
              <p className="mb-2 font-medium text-aegis-green">Permitted</p>
              <ul className="space-y-1 text-aegis-muted">
                <li>✓ Place market orders (hedges only)</li>
                <li>✓ Cancel orders (on recovery)</li>
              </ul>
            </div>
            <div className="rounded-lg border border-aegis-red/20 bg-aegis-red/5 p-4 text-sm">
              <p className="mb-2 font-medium text-aegis-red">Cannot do — ever</p>
              <ul className="space-y-1 text-aegis-muted">
                <li>✗ Withdraw funds</li>
                <li>✗ Transfer assets</li>
                <li>✗ Change leverage above your setting</li>
              </ul>
            </div>
            <button
              onClick={completeOnboarding}
              className="w-full rounded-xl bg-aegis-accent py-3 font-semibold text-white hover:opacity-90"
            >
              Start Aegis Protection
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
