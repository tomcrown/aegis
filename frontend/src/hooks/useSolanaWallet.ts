import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";

export function useSolanaWallet() {
  const { publicKey, connected, signMessage } = useWallet();
  const [phantomAddress, setPhantomAddress] = useState<string>("");

  useEffect(() => {
    const solana = (window as any).solana;
    if (!solana) return;

    // Already connected (e.g. page refresh)
    if (solana.isConnected && solana.publicKey) {
      setPhantomAddress(solana.publicKey.toBase58());
    }

    const onConnect = () => {
      if (solana.publicKey) setPhantomAddress(solana.publicKey.toBase58());
    };
    const onDisconnect = () => setPhantomAddress("");

    solana.on("connect", onConnect);
    solana.on("disconnect", onDisconnect);
    return () => {
      solana.off("connect", onConnect);
      solana.off("disconnect", onDisconnect);
    };
  }, []);

  // Wallet adapter takes priority if connected through it
  if (connected && publicKey) {
    return {
      address: publicKey.toBase58(),
      signMessage,
    };
  }

  // Fallback: direct window.solana connection
  return {
    address: phantomAddress,
    signMessage: undefined,
  };
}
