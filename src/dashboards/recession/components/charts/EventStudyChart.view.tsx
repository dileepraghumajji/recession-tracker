"use client";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function EventStudyChart({ rows, threshold }: { rows: { offset: number; mean: number | null; min: number | null; max: number | null }[]; threshold: number }) {
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="offset" stroke="var(--axis)" tick={{ fill: "var(--muted)", fontSize: 11 }} tickFormatter={(v: number) => (v === 0 ? "Peak" : `${v > 0 ? "+" : ""}${v}m`)} />
          <YAxis domain={[0, 100]} stroke="var(--axis)" tick={{ fill: "var(--muted)", fontSize: 11 }} width={40} />
          <ReferenceLine x={0} stroke="var(--axis)" label={{ value: "NBER peak", fill: "var(--muted)", fontSize: 10, position: "insideTopRight" }} />
          <ReferenceLine y={threshold} stroke="var(--axis)" label={{ value: `Threshold ${threshold}`, fill: "var(--muted)", fontSize: 10, position: "insideTopLeft" }} />
          <Tooltip
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12 }}
            labelFormatter={(v) => `${v} months from peak`}
            formatter={(v, n) => [typeof v === "number" ? v.toFixed(0) : "—", n]}
          />
          <Legend itemSorter={null} wrapperStyle={{ fontSize: 12 }} />
          <Line dataKey="mean" name="Average across recessions" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="max" name="Highest" stroke="var(--series-2)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          <Line dataKey="min" name="Lowest" stroke="var(--series-3)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
