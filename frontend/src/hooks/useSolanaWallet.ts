import { useWallet } from "@solana/wallet-adapter-react";
import { useWallets } from "@privy-io/react-auth";

/**
 * Returns the active Solana wallet address from either:
 *   1. Native wallet adapter (Phantom, Solflare, Backpack) — checked first
 *   2. Privy embedded wallet (email / Twitter login path) — fallback
 *
 * All components use this single hook so they don't care how the user logged in.
 */
export function useSolanaWallet() {
  const { publicKey, connected, signMessage: adapterSignMessage } = useWallet();
  const { wallets: privyWallets } = useWallets();

  // Path 1: native wallet adapter (Phantom etc.)
  if (connected && publicKey) {
    return {
      address: publicKey.toBase58(),
      wallet: null,
      signMessage: adapterSignMessage,
    };
  }

  // Path 2: Privy embedded Solana wallet
  const privySolana = privyWallets.find((w) => w.chainType === "solana") ?? null;
  return {
    address: privySolana?.address ?? "",
    wallet: privySolana,
    signMessage: undefined,
  };
}
