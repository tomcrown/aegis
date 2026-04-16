import { Fuul } from "@fuul/sdk";

const REFERRAL_STORAGE_KEY = "aegis:referral_code";

export function initFuul(): void {
  const apiKey = import.meta.env.VITE_FUUL_API_KEY;
  if (!apiKey) return;
  try {
    Fuul.init({ apiKey });
  } catch {}
}

export async function trackPageview(): Promise<void> {
  try {
    await Fuul.sendPageview();
  } catch {}
}

export function detectReferralCode(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      localStorage.setItem(REFERRAL_STORAGE_KEY, ref);
    }
  } catch {}
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
  } catch {}
}
