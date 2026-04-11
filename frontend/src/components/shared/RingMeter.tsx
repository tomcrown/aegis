/**
 * Animated SVG ring meter for cross_mmr display.
 * Danger scale: 0 = perfectly safe, 100 = liquidation.
 * Solid colors only — no gradients.
 */

interface RingMeterProps {
  pct: number;        // 0–100 danger scale
  size?: number;
  thickness?: number;
  tier?: "safe" | "watch" | "hedge";
}

function colorForPct(pct: number): string {
  if (pct >= 90) return "#EF4444"; // red — hedge
  if (pct >= 80) return "#F59E0B"; // amber — watch
  return "#22C55E";                // green — safe
}

function glowForPct(pct: number): string {
  if (pct >= 90) return "rgba(239,68,68,0.2)";
  if (pct >= 80) return "rgba(245,158,11,0.2)";
  return "rgba(34,197,94,0.2)";
}

export function RingMeter({ pct, size = 200, thickness = 14 }: RingMeterProps) {
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const dashOffset = circumference * (1 - clamped / 100);
  const color = colorForPct(clamped);
  const glow = glowForPct(clamped);
  const center = size / 2;

  const label =
    clamped >= 90 ? "DANGER" :
    clamped >= 80 ? "WATCH" :
    "PROTECTED";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Outer glow ring */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full transition-all duration-700"
        style={{ boxShadow: `0 0 40px ${glow}` }}
      />

      <svg width={size} height={size} className="-rotate-90" style={{ filter: "drop-shadow(0 0 8px " + glow + ")" }}>
        {/* Track */}
        <circle
          cx={center} cy={center} r={r}
          fill="none"
          stroke="#1C2333"
          strokeWidth={thickness}
        />
        {/* Tick marks */}
        {[0, 25, 50, 75].map((tick) => {
          const angle = (tick / 100) * 360 - 90;
          const rad = (angle * Math.PI) / 180;
          const x1 = center + (r - thickness / 2 - 4) * Math.cos(rad);
          const y1 = center + (r - thickness / 2 - 4) * Math.sin(rad);
          const x2 = center + (r + thickness / 2 + 4) * Math.cos(rad);
          const y2 = center + (r + thickness / 2 + 4) * Math.sin(rad);
          return (
            <line key={tick} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#242D42" strokeWidth="1.5" />
          );
        })}
        {/* Progress arc */}
        <circle
          cx={center} cy={center} r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1), stroke 0.5s ease" }}
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <span
          className="font-display text-3xl font-bold tabular-nums leading-none transition-all duration-500"
          style={{ color }}
        >
          {clamped.toFixed(1)}%
        </span>
        <span className="font-mono text-[10px] tracking-widest" style={{ color, opacity: 0.7 }}>
          {label}
        </span>
      </div>
    </div>
  );
}
