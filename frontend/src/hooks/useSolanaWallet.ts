import { useWallet } from "@solana/wallet-adapter-react";
import { useWallets } from "@privy-io/react-auth";

export function useSolanaWallet() {
  const { publicKey, connected, signMessage: adapterSignMessage } = useWallet();
  const { wallets: privyWallets } = useWallets();

  if (connected && publicKey) {
    return {
      address: publicKey.toBase58(),
      wallet: null,
      signMessage: adapterSignMessage,
    };
  }

  // Privy v3 types wallets as Ethereum-only but the embedded Solana wallet
  // is present at runtime — cast through unknown to access it
  const allWallets = privyWallets as unknown as {
    address: string;
    chainType?: string;
  }[];
  const privySolana = allWallets.find((w) => w.chainType === "solana") ?? null;

  return {
    address: privySolana?.address ?? "",
    wallet: privySolana,
    signMessage: undefined,
  };
}
