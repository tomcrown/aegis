import { useEffect } from "react";
import type { WsEvent } from "@/types";

export function useWsEventNotifications(): void {
  useEffect(() => {
    function handler(e: Event) {
      const event = (e as CustomEvent<WsEvent>).detail;
      let message = "";
      let bgClass = "bg-aegis-surface border-aegis-border";

      switch (event.type) {
        case "hedge_opened": {
          const p = event.payload as {
            symbol: string;
            amount: string;
            side: string;
          };
          message = `Hedge opened: ${p.amount} ${p.symbol} ${p.side}`;
          bgClass = "bg-aegis-red/10 border-aegis-red/30";
          break;
        }
        case "hedge_closed": {
          const p = event.payload as { symbol: string };
          message = `Hedge closed: ${p.symbol} — position recovered`;
          bgClass = "bg-aegis-green/10 border-aegis-green/30";
          break;
        }
        case "alert": {
          const p = event.payload as { message: string };
          message = p.message;
          bgClass = "bg-aegis-amber/10 border-aegis-amber/30";
          break;
        }
        default:
          return;
      }

      const toast = document.createElement("div");
      toast.className = `fixed bottom-4 right-4 z-50 rounded-xl border px-4 py-3 text-sm text-white shadow-lg transition-opacity duration-300 ${bgClass}`;
      toast.textContent = message;
      document.body.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
      }, 4_000);
    }

    window.addEventListener("aegis:ws-event", handler);
    return () => window.removeEventListener("aegis:ws-event", handler);
  }, []);
}
