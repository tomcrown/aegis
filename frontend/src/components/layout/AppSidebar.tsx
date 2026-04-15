/**
 * Left sidebar — page navigation.
 */
import {
  LayoutDashboard,
  ShieldCheck,
  BrainCircuit,
  History,
  type LucideIcon,
} from "lucide-react";
import type { AppPage } from "@/components/layout/AppNav";

interface AppSidebarProps {
  page: AppPage;
  onNavigate: (p: AppPage) => void;
}

const NAV_ITEMS: {
  id: AppPage;
  label: string;
  Icon: LucideIcon;
  description: string;
}[] = [
  {
    id: "overview",
    label: "Overview",
    Icon: LayoutDashboard,
    description: "Account health",
  },
  {
    id: "protection",
    label: "Protection",
    Icon: ShieldCheck,
    description: "Hedge controls",
  },
  {
    id: "intelligence",
    label: "Intelligence",
    Icon: BrainCircuit,
    description: "Elfa AI signals",
  },
  {
    id: "vault",
    label: "Activity",
    Icon: History,
    description: "Hedge history",
  },
];

export function AppSidebar({ page, onNavigate }: AppSidebarProps) {
  return (
    <aside
      className="flex w-52 shrink-0 flex-col border-r border-aegis-border"
      style={{
        background:
          "linear-gradient(180deg, rgba(13,17,28,0.95) 0%, rgba(9,12,20,0.98) 100%)",
        boxShadow: "1px 0 0 0 rgba(255,255,255,0.03)",
      }}
    >
      <nav className="flex flex-col gap-1 p-3 pt-4">
        {NAV_ITEMS.map(({ id, label, Icon, description }) => {
          const isActive = page === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className="group relative w-full overflow-hidden rounded-lg px-3 py-2.5 text-left transition-all duration-200"
              style={
                isActive
                  ? {
                      background: "rgba(79,142,247,0.07)",
                      borderLeft: "2px solid #4F8EF7",
                      paddingLeft: "10px",
                      boxShadow:
                        "inset 0 1px 0 rgba(255,255,255,0.04), 0 0 20px rgba(79,142,247,0.06)",
                    }
                  : {
                      borderLeft: "2px solid transparent",
                      paddingLeft: "10px",
                    }
              }
            >
              {/* Hover background */}
              {!isActive && (
                <span
                  className="absolute inset-0 rounded-lg opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  style={{ background: "rgba(255,255,255,0.025)" }}
                />
              )}

              <span className="relative flex items-center gap-3">
                {/* Icon */}
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-all duration-200"
                  style={
                    isActive
                      ? {
                          background: "rgba(79,142,247,0.15)",
                          boxShadow: "0 0 10px rgba(79,142,247,0.2)",
                          color: "#4F8EF7",
                        }
                      : {
                          background: "rgba(255,255,255,0.04)",
                          color: "#4B5675",
                        }
                  }
                >
                  <Icon size={14} strokeWidth={2} />
                </span>

                {/* Label + description */}
                <span className="flex flex-col">
                  <span
                    className="font-display text-sm font-semibold leading-tight transition-colors duration-200"
                    style={{ color: isActive ? "#E2E8F0" : "#4B5675" }}
                  >
                    {label}
                  </span>
                  <span
                    className="font-mono text-[9px] leading-tight transition-colors duration-200"
                    style={{
                      color: isActive
                        ? "rgba(79,142,247,0.7)"
                        : "rgba(75,86,117,0.6)",
                    }}
                  >
                    {description}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      {/* Bottom status indicator */}
      <div className="mt-auto p-3">
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2.5"
          style={{
            background: "rgba(34,197,94,0.05)",
            border: "1px solid rgba(34,197,94,0.1)",
          }}
        >
          <span
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-aegis-green"
            style={{ boxShadow: "0 0 6px rgba(34,197,94,0.8)" }}
          />
          <div className="flex flex-col">
            <span className="font-display text-[10px] font-semibold text-aegis-green">
              Engine Online
            </span>
            <span className="font-mono text-[9px] text-aegis-muted">
              500ms · monitoring
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
