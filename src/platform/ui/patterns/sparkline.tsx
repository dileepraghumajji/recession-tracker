import { cn } from "../cn";

/** Tiny inline trend line (SVG, no JS). Colour follows the net direction unless `tone` is given. */
export function Sparkline({ data, width = 96, height = 28, tone, className, area = true, reference }: { data: number[]; width?: number; height?: number; tone?: "up" | "down" | "accent" | "muted"; className?: string; area?: boolean; reference?: number }) {
  const pts = data.filter((v) => Number.isFinite(v));
  if (pts.length < 2) return <div style={{ width, height }} className={className} aria-hidden />;
  let min = Math.min(...pts, reference ?? Infinity);
  let max = Math.max(...pts, reference ?? -Infinity);
  if (min === max) [min, max] = [min - 1, max + 1];
  const x = (i: number) => (i / (pts.length - 1)) * (width - 2) + 1;
  const y = (v: number) => height - 2 - ((v - min) / (max - min)) * (height - 4);
  const d = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const t = tone ?? (pts[pts.length - 1] >= pts[0] ? "up" : "down");
  const color = t === "up" ? "var(--up)" : t === "down" ? "var(--down)" : t === "accent" ? "var(--accent)" : "var(--muted)";
  const id = `sp${Math.abs(Math.round(pts.reduce((a, b) => a * 31 + b, 7))) % 1e9}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("overflow-visible", className)} aria-hidden>
      {area && (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${d}L${x(pts.length - 1).toFixed(1)},${height}L${x(0).toFixed(1)},${height}Z`} fill={`url(#${id})`} />
        </>
      )}
      {reference !== undefined && <line x1="0" x2={width} y1={y(reference)} y2={y(reference)} stroke="var(--axis)" strokeDasharray="2 2" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1])} r="2" fill={color} />
    </svg>
  );
}
