"use client";
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { buttonVariants } from "../primitives/button";
import { InView } from "./in-view";
import { ChartSkeleton } from "./skeletons";
import type View from "./time-series-chart.view";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  dash?: string;
}

export interface RefLine {
  y: number;
  label: string;
}

/** A shaded x-range (dates must exist in `rows`). */
export interface ShadedBand {
  x1?: string;
  x2?: string;
  name: string;
}

// Recharts (~110 kB gz) loads only when a chart approaches the viewport.
const Impl = dynamic(() => import("./time-series-chart.view"), { ssr: false, loading: () => <ChartSkeleton height={260} /> });

/**
 * Single-axis line chart. Rows are {date, [key]: value}. Optional `bands` are
 * shaded (dashboards use this for recessions, stress periods, etc.).
 */
export function TimeSeriesChart(props: ComponentProps<typeof View>) {
  const height = props.height ?? 260;
  if (!props.rows.length) return <div className="flex h-40 items-center justify-center text-sm text-muted">No data available for this period.</div>;
  return (
    <InView style={{ width: "100%", height }} fallback={<ChartSkeleton height={height} />}>
      <Impl {...props} />
    </InView>
  );
}

export function PeriodSelector<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1" role="group" aria-label="Period">
      {options.map((o) => (
        <button key={o} className={buttonVariants({ size: "sm" })} aria-pressed={o === value} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}
