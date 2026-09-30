import { cn } from "../cn";

/**
 * Signed change with direction glyph. Direction is never colour-only:
 * ▲/▼/▶ + sign + an accessible label accompany the up/down colour.
 * `goodWhen` flips colours for metrics where down is good (e.g. VIX, spreads).
 */
export function Delta({
  value,
  dp = 1,
  suffix = "",
  goodWhen = "up",
  neutralBand = 0,
  className,
  label,
}: {
  value: number | null | undefined;
  dp?: number;
  suffix?: string;
  goodWhen?: "up" | "down" | "none";
  neutralBand?: number;
  className?: string;
  label?: string;
}) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className={cn("text-muted tabular-nums", className)}>—</span>;
  const dir = value > neutralBand ? 1 : value < -neutralBand ? -1 : 0;
  const good = goodWhen === "none" ? 0 : dir * (goodWhen === "up" ? 1 : -1);
  const color = good > 0 ? "text-up-fg" : good < 0 ? "text-down-fg" : "text-ink-2";
  const glyph = dir > 0 ? "▲" : dir < 0 ? "▼" : "▶";
  const text = `${value > 0 ? "+" : value < 0 ? "−" : "±"}${Math.abs(value).toFixed(dp)}${suffix}`;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap tabular-nums", color, className)} aria-label={`${label ? label + " " : ""}${dir > 0 ? "up" : dir < 0 ? "down" : "unchanged"} ${text}`}>
      <span aria-hidden className="text-[0.7em]">
        {glyph}
      </span>
      <span aria-hidden>{text}</span>
    </span>
  );
}
