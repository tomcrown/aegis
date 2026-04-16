import { useWallet } from "@solana/wallet-adapter-react";

export function usePhantomConnect() {
  const { select, connect, wallets } = useWallet();

  const connectPhantom = async () => {
    const solana = (window as any).solana;
    if (solana?.isPhantom) {
      try {
        await solana.connect();
        const phantomWallet = wallets.find((w) => w.adapter.name === "Phantom");
        if (phantomWallet) {
          select(phantomWallet.adapter.name);
        }
        return;
      } catch (err) {
        return;
      }
    }

    const phantomWallet = wallets.find((w) => w.adapter.name === "Phantom");
    if (!phantomWallet) {
      alert("Phantom wallet not found. Please install it from phantom.app");
      return;
    }
    select(phantomWallet.adapter.name);
    try {
      await connect();
    } catch (err) {}
  };

  return { connectPhantom };
}
