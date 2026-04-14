import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        aegis: {
          bg: "#07090F",
          surface: "#0E1117",
          surface2: "#131720",
          border: "#1C2333",
          border2: "#242D42",
          accent: "#4F8EF7",
          "accent-dim": "#3B6FCC",
          green: "#22C55E",
          "green-dim": "#16A34A",
          amber: "#F59E0B",
          red: "#EF4444",
          "red-dim": "#DC2626",
          muted: "#6B7280",
          subtle: "#374151",
          text: "#E2E8F0",
        },
      },
      fontFamily: {
        display: ["Syne", "system-ui", "sans-serif"],
        sans: ["DM Sans", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },

      fontSize: {
        "2xs": ["0.65rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        "card-lg": "0 4px 16px rgba(0,0,0,0.5)",
        "glow-accent": "0 0 20px rgba(79,142,247,0.15)",
        "glow-green": "0 0 20px rgba(34,197,94,0.15)",
        "glow-red": "0 0 20px rgba(239,68,68,0.15)",
      },

      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-slow": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(24px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(16px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "pulse-ring": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.6" },
          "50%": { transform: "scale(1.06)", opacity: "0.2" },
        },
        "shield-float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "count-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
        "draw-line": {
          from: { strokeDashoffset: "1000" },
          to: { strokeDashoffset: "0" },
        },
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        ticker: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease both",
        "fade-in-slow": "fade-in-slow 0.8s ease both",
        "slide-up": "slide-up 0.5s ease both",
        "slide-in-right": "slide-in-right 0.3s ease both",
        "pulse-ring": "pulse-ring 2s ease-in-out infinite",
        "shield-float": "shield-float 4s ease-in-out infinite",
        blink: "blink 2s ease-in-out infinite",
        "spin-slow": "spin-slow 8s linear infinite",
        ticker: "ticker 30s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
