/**
 * Animated SVG ring meter for cross_mmr display.
 * Color shifts: green → amber → red based on percentage.
 */

interface RingMeterProps {
  pct: number;       // 0–100
  size?: number;     // px, default 200
  thickness?: number; // px, default 16
}

function colorForPct(pct: number): string {
  if (pct >= 85) return "#ef4444"; // red
  if (pct >= 70) return "#f59e0b"; // amber
  return "#22c55e";                // green
}

export function RingMeter({ pct, size = 200, thickness = 16 }: RingMeterProps) {
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const dashOffset = circumference * (1 - clamped / 100);
  const color = colorForPct(clamped);
  const center = size / 2;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="#1e2130"
          strokeWidth={thickness}
        />
        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease" }}
        />
      </svg>
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-3xl font-bold tabular-nums"
          style={{ color }}
        >
          {clamped.toFixed(1)}%
        </span>
        <span className="mt-1 text-xs text-aegis-muted">Risk Level</span>
      </div>
    </div>
  );
}
