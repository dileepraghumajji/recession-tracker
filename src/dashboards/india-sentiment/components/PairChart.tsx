"use client";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface PairPoint {
  date: string;
  value: number;
}

const tooltipStyle = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12 },
  labelStyle: { color: "var(--ink-2)" },
  itemStyle: { color: "var(--ink)" },
};

/**
 * "A vs B" as two stacked panels sharing the time axis (synchronised crosshair),
 * instead of a dual-axis chart. The bottom panel can be a line or signed bars.
 */
export function PairChart({
  top,
  bottom,
  topLabel,
  bottomLabel,
  bars = false,
  intraday = false,
  bottomRef,
  bottomDomain,
}: {
  top: PairPoint[];
  bottom: PairPoint[];
  topLabel: string;
  bottomLabel: string;
  bars?: boolean;
  intraday?: boolean;
  bottomRef?: number;
  bottomDomain?: [number, number];
}) {
  // Align both panels on the union of dates so the crosshair lines up.
  const dates = [...new Set([...top.map((p) => p.date), ...bottom.map((p) => p.date)])].sort();
  const tm = new Map(top.map((p) => [p.date, p.value]));
  const bm = new Map(bottom.map((p) => [p.date, p.value]));
  const rows = dates.map((d) => ({ date: d, a: tm.get(d) ?? null, b: bm.get(d) ?? null }));
  if (!rows.length) return <div className="flex h-40 items-center justify-center text-sm text-muted">No data available for this period.</div>;
  const span = (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86_400_000;
  const tick = (d: string) => (intraday ? new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : span > 3 * 365 ? d.slice(0, 4) : span > 120 ? d.slice(0, 7) : d.slice(5, 10));
  const fmt = (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : v.toLocaleString("en-IN", { maximumFractionDigits: 2 }));
  const axis = { stroke: "var(--axis)", tick: { fill: "var(--muted)", fontSize: 11 } };
  const x = <XAxis dataKey="date" tickFormatter={tick} minTickGap={48} {...axis} />;
  const tip = <Tooltip {...tooltipStyle} labelFormatter={(l) => (intraday ? new Date(String(l)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : String(l))} formatter={(v) => (typeof v === "number" ? fmt(v) : "—")} />;
  return (
    <div className="space-y-1">
      <div className="text-xs text-ink-2">{topLabel}</div>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <LineChart data={rows} syncId="pair" margin={{ top: 6, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            {x}
            <YAxis domain={["auto", "auto"]} width={64} tickFormatter={fmt} {...axis} />
            {tip}
            <Line dataKey="a" name={topLabel} stroke="var(--accent)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="pt-2 text-xs text-ink-2">{bottomLabel}</div>
      <div style={{ width: "100%", height: 170 }}>
        <ResponsiveContainer>
          {bars ? (
            <BarChart data={rows} syncId="pair" margin={{ top: 6, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              {x}
              <YAxis width={64} tickFormatter={fmt} {...axis} />
              {tip}
              <ReferenceLine y={0} stroke="var(--axis)" />
              <Bar dataKey="b" name={bottomLabel} isAnimationActive={false} radius={[2, 2, 0, 0]}>
                {rows.map((r) => (
                  <Cell key={r.date} fill={(r.b ?? 0) >= 0 ? "var(--good)" : "var(--serious)"} />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <LineChart data={rows} syncId="pair" margin={{ top: 6, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              {x}
              <YAxis domain={bottomDomain ?? ["auto", "auto"]} width={64} tickFormatter={fmt} {...axis} />
              {tip}
              {bottomRef !== undefined && <ReferenceLine y={bottomRef} stroke="var(--axis)" strokeDasharray="3 3" />}
              <Line dataKey="b" name={bottomLabel} stroke="var(--series-2)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
