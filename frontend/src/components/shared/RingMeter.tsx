interface RingMeterProps {
  pct: number;
  size?: number;
  thickness?: number;
  tier?: "safe" | "watch" | "hedge";
}

function colorForPct(pct: number) {
  if (pct >= 90) return "#EF4444";
  if (pct >= 80) return "#F59E0B";
  return "#22C55E";
}

function glowColorForPct(pct: number) {
  if (pct >= 90)
    return { soft: "rgba(239,68,68,0.18)", hard: "rgba(239,68,68,0.5)" };
  if (pct >= 80)
    return { soft: "rgba(245,158,11,0.15)", hard: "rgba(245,158,11,0.45)" };
  return { soft: "rgba(34,197,94,0.13)", hard: "rgba(34,197,94,0.4)" };
}

export function RingMeter({ pct, size = 200, thickness = 14 }: RingMeterProps) {
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const dashOffset = circumference * (1 - clamped / 100);
  const color = colorForPct(clamped);
  const glow = glowColorForPct(clamped);
  const center = size / 2;

  const label =
    clamped >= 90 ? "DANGER" : clamped >= 80 ? "WATCH" : "PROTECTED";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Ambient outer glow — large soft bloom */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full transition-all duration-700"
        style={{
          boxShadow: `0 0 60px 10px ${glow.soft}`,
        }}
      />

      <svg
        width={size}
        height={size}
        className="-rotate-90"
        style={{
          filter: `drop-shadow(0 0 6px ${glow.hard}) drop-shadow(0 0 2px ${color})`,
          transition: "filter 0.5s ease",
        }}
      >
        {/* Outer faint halo ring */}
        <circle
          cx={center}
          cy={center}
          r={r + thickness / 2 + 4}
          fill="none"
          stroke={color}
          strokeWidth="1"
          opacity="0.06"
        />

        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="#1A2035"
          strokeWidth={thickness}
        />

        {/* Tick marks at 0 / 25 / 50 / 75 */}
        {[0, 25, 50, 75].map((tick) => {
          const angle = (tick / 100) * 360 - 90;
          const rad = (angle * Math.PI) / 180;
          const inner = r - thickness / 2 - 3;
          const outer = r + thickness / 2 + 3;
          return (
            <line
              key={tick}
              x1={center + inner * Math.cos(rad)}
              y1={center + inner * Math.sin(rad)}
              x2={center + outer * Math.cos(rad)}
              y2={center + outer * Math.sin(rad)}
              stroke="#252F47"
              strokeWidth="1.5"
            />
          );
        })}

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
          style={{
            transition:
              "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1), stroke 0.5s ease",
          }}
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <span
          className="font-display text-3xl font-bold tabular-nums leading-none"
          style={{
            color,
            textShadow: `0 0 20px ${glow.hard}`,
            transition: "color 0.5s ease, text-shadow 0.5s ease",
          }}
        >
          {clamped.toFixed(1)}%
        </span>
        <span
          className="font-mono text-[10px] tracking-[0.2em]"
          style={{ color, opacity: 0.65 }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
