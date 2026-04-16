interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({
  values,
  width = 200,
  height = 40,
  color,
}: SparklineProps) {
  if (!values || values.length < 2) {
    return (
      <svg width={width} height={height}>
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="#1C2333"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
      </svg>
    );
  }

  const danger = values.map((v) => Math.max(0, Math.min(100, 200 - v)));

  const min = Math.min(...danger);
  const max = Math.max(...danger);
  const range = max - min || 1;

  const pad = 3;
  const plotW = width - pad * 2;
  const plotH = height - pad * 2;

  const pts = danger.map((v, i) => {
    const x = pad + (i / (danger.length - 1)) * plotW;
    const y = pad + (1 - (v - min) / range) * plotH;
    return `${x},${y}`;
  });

  const polyline = pts.join(" ");

  const latest = danger[0];
  const lineColor =
    color ?? (latest >= 90 ? "#EF4444" : latest >= 80 ? "#F59E0B" : "#22C55E");

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={polyline}
        fill="none"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: "all 0.5s ease" }}
      />
      {/* Latest value dot */}
      {pts[0] && (
        <circle
          cx={pts[0].split(",")[0]}
          cy={pts[0].split(",")[1]}
          r="2.5"
          fill={lineColor}
        />
      )}
    </svg>
  );
}
