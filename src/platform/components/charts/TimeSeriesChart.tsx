"use client";
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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

/**
 * Single-axis line chart. Rows are {date, [key]: value}. Optional `bands` are
 * shaded (dashboards use this for recessions, stress periods, etc.).
 */
export function TimeSeriesChart({
  rows,
  series,
  refLines = [],
  height = 260,
  yDomain,
  decimals = 2,
  bands = [],
}: {
  rows: Record<string, number | string | null>[];
  series: ChartSeries[];
  refLines?: RefLine[];
  height?: number;
  yDomain?: [number | "auto" | "dataMin" | "dataMax", number | "auto" | "dataMin" | "dataMax"];
  decimals?: number;
  bands?: ShadedBand[];
}) {
  const format = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (!rows.length) return <div className="flex h-40 items-center justify-center text-sm text-muted">No data available for this period.</div>;
  const first = String(rows[0].date);
  const last = String(rows[rows.length - 1].date);
  const spanDays = (Date.parse(last) - Date.parse(first)) / 86_400_000;
  const tick = (d: string) => (spanDays > 8 * 365 ? d.slice(0, 4) : spanDays > 120 ? d.slice(0, 7) : d.slice(5));
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={tick} stroke="var(--axis)" tick={{ fill: "var(--muted)", fontSize: 11 }} minTickGap={40} />
          <YAxis
            domain={yDomain ?? ["auto", "auto"]}
            stroke="var(--axis)"
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            tickFormatter={(v: number) => format(v)}
            width={56}
          />
          {bands.map((s) =>
            s.x1 && s.x2 ? <ReferenceArea key={s.name} x1={s.x1} x2={s.x2} fill="var(--muted)" fillOpacity={0.15} ifOverflow="hidden" /> : null,
          )}
          {refLines.map((r) => (
            <ReferenceLine
              key={r.label}
              y={r.y}
              stroke="var(--axis)"
              label={{ value: r.label, position: "insideTopLeft", fill: "var(--muted)", fontSize: 10 }}
            />
          ))}
          <Tooltip
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12 }}
            labelStyle={{ color: "var(--ink-2)" }}
            itemStyle={{ color: "var(--ink)" }}
            formatter={(v, name) => [typeof v === "number" ? format(v) : "—", name]}
          />
          {series.length > 1 && <Legend itemSorter={null} wrapperStyle={{ fontSize: 12, color: "var(--ink-2)" }} />}
          {series.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dash}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PeriodSelector<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1" role="group" aria-label="Period">
      {options.map((o) => (
        <button key={o} className="btn" aria-pressed={o === value} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}
