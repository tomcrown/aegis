/**
 * Fuul referral + conversion tracking.
 *
 * Two responsibilities:
 *   1. Page-level tracking: sendPageview() on app load (no signature needed)
 *   2. Referral detection: read ?ref= from URL on load, store in localStorage
 *      so the backend can attribute the conversion when the user activates.
 *
 * The heavy conversion event (activate_protection) is fired server-side
 * via the FUUL_TRIGGER_KEY — never from the browser — so the trigger key
 * is never exposed to the client.
 *
 * VITE_FUUL_API_KEY must be a send:tracking_event key (safe for browser).
 */

import { Fuul } from "@fuul/sdk";

const REFERRAL_STORAGE_KEY = "aegis:referral_code";

export function initFuul(): void {
  const apiKey = import.meta.env.VITE_FUUL_API_KEY;
  if (!apiKey) return;
  try {
    Fuul.init({ apiKey });
  } catch {
    // non-fatal — tracking failure must never break the app
  }
}

export async function trackPageview(): Promise<void> {
  try {
    await Fuul.sendPageview();
  } catch {
    // non-fatal
  }
}

/**
 * Call once on app load. Reads ?ref=<code> from the current URL and
 * persists it to localStorage. Once stored, the code survives navigation
 * so it can be sent to the backend when the user completes activation.
 */
export function detectReferralCode(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      localStorage.setItem(REFERRAL_STORAGE_KEY, ref);
    }
  } catch {
    // non-fatal
  }
}

export function getStoredReferralCode(): string | null {
  try {
    return localStorage.getItem(REFERRAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearReferralCode(): void {
  try {
    localStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {
    // non-fatal
  }
}
