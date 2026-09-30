"use client";
import dynamic from "next/dynamic";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "../cn";
import type { ChartPane, ChartSeriesSpec } from "./chart-types";
import { EmptyState } from "./empty-state";
import { ChartSkeleton } from "./skeletons";

export type { ChartPane, ChartPoint, ChartSeriesSpec } from "./chart-types";

// The chart library is ~45 kB gz; load it only when a chart is on screen.
const LwChart = dynamic(() => import("./lw-chart"), { ssr: false, loading: () => <ChartSkeleton height={220} /> });

function fmt(v: number | null | undefined, f: ChartSeriesSpec["format"]) {
  if (v === null || v === undefined) return "—";
  if (f === "percent") return `${v.toFixed(2)}%`;
  if (f === "crore") return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`;
  if (f === "ratio") return v.toFixed(2);
  return Math.abs(v) >= 1000 ? v.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/**
 * Time-series chart with stacked panes on one time axis (the answer to "A vs B"
 * without dual y-axes), a crosshair legend that doubles as the tooltip, and a
 * data-table fallback for screen readers.
 */
export function ChartPanel({ panes, height = 360, timeOffsetSec, header, className, emptyText = "No data for this period." }: { panes: ChartPane[]; height?: number; timeOffsetSec?: number; header?: ReactNode; className?: string; emptyText?: string }) {
  const [hover, setHover] = useState<{ vals: Record<string, number | null>; time: string } | null>(null);
  const all = panes.flatMap((p) => p.series);
  const hasData = all.some((s) => s.data.some((d) => d.value !== null));
  const last = useMemo(() => Object.fromEntries(all.map((s) => [s.id, [...s.data].reverse().find((d) => d.value !== null)?.value ?? null])), [all]);
  const shown = hover?.vals ?? last;
  // Screen-reader / keyboard fallback: last 60 timestamps across all series, aligned by time.
  const tableRows = useMemo(() => {
    const maps = all.map((s) => new Map(s.data.map((d) => [String(d.time), d.value])));
    const times = [...new Set(all.flatMap((s) => s.data.map((d) => String(d.time))))].sort().slice(-60);
    return times.map((t) => ({ t, vals: maps.map((m) => m.get(t) ?? null) }));
  }, [all]);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {header}
        {all.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: s.type === "histogram" || s.type === "baseline" ? "linear-gradient(90deg,var(--up) 50%,var(--down) 50%)" : `var(--${s.color ?? "accent"})` }} />
            <span className="text-ink-2">{s.label}</span>
            <span className="font-medium text-ink tabular-nums">{fmt(shown[s.id], s.format)}</span>
          </span>
        ))}
        <span className="ml-auto text-2xs text-muted tabular-nums">{hover ? hover.time.replace("T", " ").slice(0, 16) : "latest"}</span>
      </div>
      {hasData ? (
        <div role="img" aria-label={`Chart: ${all.map((s) => s.label).join(", ")}`}>
          <LwChart panes={panes} height={height} timeOffsetSec={timeOffsetSec} onHover={(vals, time) => setHover(vals && time ? { vals, time } : null)} />
        </div>
      ) : (
        <EmptyState title={emptyText} />
      )}
      {hasData && (
        <details className="text-2xs text-muted">
          <summary className="w-fit cursor-pointer hover:text-ink">Data table</summary>
          <div className="mt-1 max-h-48 overflow-auto">
            <table className="w-full text-left tabular-nums">
              <thead>
                <tr>
                  <th className="pr-3">Time</th>
                  {all.map((s) => (
                    <th key={s.id} className="pr-3">
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => (
                  <tr key={r.t}>
                    <td className="pr-3">{r.t.replace("T", " ").slice(0, 16)}</td>
                    {all.map((s, k) => (
                      <td key={s.id} className="pr-3">
                        {fmt(r.vals[k], s.format)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
