import { useWallet } from "@solana/wallet-adapter-react";

export function usePhantomConnect() {
  const { select, connect, wallets } = useWallet();

  const connectPhantom = async () => {
    // If Phantom injected window.solana directly, use it — most reliable
    const solana = (window as any).solana;
    if (solana?.isPhantom) {
      try {
        await solana.connect();
        // Now sync the adapter so useWallet().publicKey works
        const phantomWallet = wallets.find((w) => w.adapter.name === "Phantom");
        if (phantomWallet) {
          select(phantomWallet.adapter.name);
        }
        return;
      } catch (err) {
        console.error("Phantom connect failed", err);
        return;
      }
    }

    // Fallback: try via adapter
    const phantomWallet = wallets.find((w) => w.adapter.name === "Phantom");
    if (!phantomWallet) {
      alert("Phantom wallet not found. Please install it from phantom.app");
      return;
    }
    select(phantomWallet.adapter.name);
    try {
      await connect();
    } catch (err) {
      console.error("Wallet connect failed", err);
    }
  };

  return { connectPhantom };
}
