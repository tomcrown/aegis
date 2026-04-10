import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        aegis: {
          bg: "#0a0b0e",
          surface: "#12141a",
          border: "#1e2130",
          accent: "#6366f1",
          green: "#22c55e",
          amber: "#f59e0b",
          red: "#ef4444",
          muted: "#6b7280",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
