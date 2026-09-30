import type { ReactNode } from "react";
import { cn } from "../cn";
import { Tooltip } from "../primitives/tooltip";
import { Delta } from "./delta";
import { StatSkeleton } from "./skeletons";
import { Sparkline } from "./sparkline";

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  /** Change vs a reference, rendered with direction glyph. */
  delta?: { value: number | null; label?: string; suffix?: string; dp?: number; goodWhen?: "up" | "down" | "none" };
  spark?: number[];
  sparkTone?: "up" | "down" | "accent" | "muted";
  /** Short qualitative read, e.g. a band label. */
  badge?: ReactNode;
  footnote?: ReactNode;
  info?: string;
  loading?: boolean;
  /** Emphasis bar colour at the top (semantic token name). */
  accent?: "up" | "down" | "accent" | "warning" | "none";
  className?: string;
  size?: "md" | "lg";
}

/** Headline number with context: label, value, unit, delta, sparkline and a footnote. */
export function StatCard({ label, value, unit, delta, spark, sparkTone, badge, footnote, info, loading, accent = "none", className, size = "md" }: StatCardProps) {
  const bar = { up: "var(--up)", down: "var(--down)", accent: "var(--accent)", warning: "var(--warning)", none: "transparent" }[accent];
  return (
    <div className={cn("relative flex h-full flex-col justify-between gap-2 overflow-hidden rounded-[10px] border border-line bg-surface p-[var(--widget-pad)] shadow-raised", className)}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-0.5" style={{ background: bar }} />
      {loading ? (
        <StatSkeleton />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-2xs font-medium uppercase tracking-[0.06em] text-muted" title={info}>
              {info ? (
                <Tooltip content={info}>
                  <span tabIndex={0} className="cursor-help underline decoration-dotted decoration-muted/50 underline-offset-2">
                    {label}
                  </span>
                </Tooltip>
              ) : (
                label
              )}
            </span>
            {badge}
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className={cn("font-semibold tracking-tight text-ink tabular-nums", size === "lg" ? "text-[44px] leading-none" : "text-[26px] leading-none")}>{value}</span>
                {unit && <span className="text-xs text-muted">{unit}</span>}
              </div>
              {delta && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                  <Delta value={delta.value} suffix={delta.suffix} dp={delta.dp} goodWhen={delta.goodWhen} label={delta.label} />
                  {delta.label && <span className="text-muted">{delta.label}</span>}
                </div>
              )}
            </div>
            {spark && spark.length > 1 && <Sparkline data={spark} tone={sparkTone} className="shrink-0" />}
          </div>
          {footnote && <div className="text-2xs text-muted">{footnote}</div>}
        </>
      )}
    </div>
  );
}
