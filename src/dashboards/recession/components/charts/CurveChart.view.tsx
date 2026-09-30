"use client";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function CurveChart({ rows }: { rows: { tenor: string; now: number | null; m3: number | null; m12: number | null }[] }) {
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="tenor" stroke="var(--axis)" tick={{ fill: "var(--muted)", fontSize: 11 }} />
          <YAxis domain={["auto", "auto"]} stroke="var(--axis)" tick={{ fill: "var(--muted)", fontSize: 11 }} tickFormatter={(v: number) => `${v.toFixed(1)}%`} width={48} />
          <Tooltip
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12 }}
            formatter={(v, n) => [typeof v === "number" ? `${v.toFixed(2)}%` : "—", n]}
          />
          <Legend itemSorter={null} wrapperStyle={{ fontSize: 12 }} />
          <Line dataKey="now" name="Today" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} connectNulls />
          <Line dataKey="m3" name="3 months ago" stroke="var(--series-2)" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} connectNulls />
          <Line dataKey="m12" name="12 months ago" stroke="var(--series-3)" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
