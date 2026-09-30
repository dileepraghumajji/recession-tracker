"use client";
import { NBER_RECESSIONS } from "@/dashboards/recession/lib/nber";
import { PeriodSelector, TimeSeriesChart as BaseChart, type ChartSeries, type RefLine } from "@/platform/components/charts/TimeSeriesChart";

export { PeriodSelector, type ChartSeries, type RefLine };

type BaseProps = Parameters<typeof BaseChart>[0];

/** The platform line chart with NBER recessions shaded when `recessions` is set. */
export function TimeSeriesChart({ recessions = false, ...props }: Omit<BaseProps, "bands"> & { recessions?: boolean }) {
  const { rows } = props;
  const bands =
    recessions && rows.length
      ? (() => {
          const first = String(rows[0].date);
          const last = String(rows[rows.length - 1].date);
          return NBER_RECESSIONS.filter((r) => r.trough >= first && r.peak <= last).map((r) => ({
            x1: rows.find((x) => String(x.date) >= r.peak)?.date as string | undefined,
            x2: [...rows].reverse().find((x) => String(x.date) <= r.trough.slice(0, 8) + "28")?.date as string | undefined,
            name: r.name,
          }));
        })()
      : [];
  return <BaseChart {...props} bands={bands} />;
}
