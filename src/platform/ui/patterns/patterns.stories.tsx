import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useMemo, useState } from "react";
import { Badge } from "../primitives/badge";
import { Button } from "../primitives/button";
import { BarList, CategoryBar, DivergingBars } from "./bars";
import { ChartPanel, type ChartPane } from "./chart-panel";
import { DataTable, type ColumnDef } from "./data-table";
import { Delta } from "./delta";
import { EmptyState } from "./empty-state";
import { FilterBar, FilterField, TimeRangeSelector, type TimeRange } from "./filter-bar";
import { ChartSkeleton, StatSkeleton, TableSkeleton } from "./skeletons";
import { StatCard } from "./stat-card";
import { WidgetShell } from "./widget-shell";

const meta: Meta = { title: "Patterns" };
export default meta;

const walk = (n: number, seed: number, start: number, vol: number) => {
  let s = seed;
  let v = start;
  return Array.from({ length: n }, () => {
    s = (s * 9301 + 49297) % 233280;
    return (v += (s / 233280 - 0.48) * vol);
  });
};

export const StatCards: StoryObj = {
  render: () => (
    <div className="grid max-w-5xl grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="India Market Sentiment" value="68" unit="/ 100" delta={{ value: -5.4, label: "1W" }} badge={<Badge tone="up">🟢 Greed</Badge>} spark={walk(30, 4, 60, 3)} accent="up" />
      <StatCard label="India VIX" value="13.42" delta={{ value: 6.1, suffix: "%", label: "1D", goodWhen: "down" }} spark={walk(30, 8, 13, 0.6)} sparkTone="muted" info="Implied volatility" />
      <StatCard label="No data" value="—" footnote="Source unavailable" />
      <StatCard label="Loading" value="" loading />
    </div>
  ),
};

export const WidgetStates: StoryObj = {
  render: () => (
    <div className="grid max-w-5xl auto-rows-[190px] grid-cols-3 gap-3">
      <WidgetShell title="Ready" status="LIVE" asOf="2026-09-30" info="Tooltip text">
        <p className="text-[13px]">Content</p>
      </WidgetShell>
      <WidgetShell title="Loading" loading />
      <WidgetShell title="Empty" empty={{ title: "No data", description: "Connect a source.", action: <Button size="sm">Settings</Button> }} />
      <WidgetShell title="Error" error="Upstream returned HTTP 503." />
      <WidgetShell title="Stale" status="STALE" asOf="2026-08-01">
        <p className="text-[13px]">Old but usable data</p>
      </WidgetShell>
      <WidgetShell title="Unavailable" status="UNAVAILABLE" empty={{ title: "Unavailable" }} />
    </div>
  ),
};

export const Bars: StoryObj = {
  render: () => (
    <div className="grid max-w-4xl gap-6">
      <CategoryBar
        marker={62}
        segments={[
          { from: 0, to: 35, label: "Fear", color: "var(--down)" },
          { from: 35, to: 65, label: "Neutral", color: "var(--surface-3)" },
          { from: 65, to: 100, label: "Greed", color: "var(--up)" },
        ]}
      />
      <DivergingBars items={[{ id: "a", label: "Breadth", value: 72, secondary: "+2.1" }, { id: "b", label: "Valuation", value: 28, secondary: "−0.9" }, { id: "c", label: "Credit", value: null }]} />
      <BarList tone="up" items={[{ key: "a", label: "Liquidity", value: 2.1 }, { key: "b", label: "Earnings", value: 1.2 }]} format={(v) => `+${v}`} />
      <div className="flex gap-4 text-sm">
        <Delta value={1.2} suffix="%" />
        <Delta value={-0.4} suffix="%" />
        <Delta value={3} goodWhen="down" suffix=" VIX" />
      </div>
    </div>
  ),
};

export const Chart: StoryObj = {
  render: function Render() {
    const panes = useMemo<ChartPane[]>(() => {
      const d = Array.from({ length: 200 }, (_, i) => new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10));
      const a = walk(200, 3, 24000, 150);
      const b = walk(200, 9, 50, 3);
      return [
        { id: "a", weight: 2, series: [{ id: "a", label: "NIFTY", type: "area", color: "series-1", data: d.map((t, i) => ({ time: t, value: a[i] })) }] },
        { id: "b", series: [{ id: "b", label: "Sentiment", type: "baseline", baseline: 50, referenceLine: 50, data: d.map((t, i) => ({ time: t, value: b[i] })) }] },
      ];
    }, []);
    return (
      <div className="max-w-4xl">
        <ChartPanel panes={panes} height={320} />
      </div>
    );
  },
};

interface Row {
  id: number;
  name: string;
  value: number;
  change: number;
}
export const Table: StoryObj = {
  render: function Render() {
    const data = useMemo<Row[]>(() => Array.from({ length: 500 }, (_, i) => ({ id: i, name: `Instrument ${i + 1}`, value: (i * 7919) % 10000, change: walk(2, i + 1, 0, 6)[1] })), []);
    const cols: ColumnDef<Row, unknown>[] = [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "value", header: "Value", meta: { numeric: true, heat: (r) => r.value / 10000 } },
      { accessorKey: "change", header: "Change", meta: { numeric: true }, cell: (c) => <Delta value={c.getValue() as number} suffix="%" dp={2} /> },
    ];
    return (
      <div className="max-w-3xl rounded-[10px] border border-line bg-surface">
        <DataTable data={data} columns={cols} label="Instruments" maxHeight={400} />
      </div>
    );
  },
};

export const Filters: StoryObj = {
  render: function Render() {
    const [r, setR] = useState<TimeRange>("1Y");
    return (
      <FilterBar chips={[{ key: "a", label: "NSE", onRemove: () => {} }]} onReset={() => setR("1Y")}>
        <FilterField label="Range">
          <TimeRangeSelector value={r} onChange={setR} />
        </FilterField>
      </FilterBar>
    );
  },
};

export const EmptyAndSkeletons: StoryObj = {
  render: () => (
    <div className="grid max-w-5xl grid-cols-2 gap-6">
      <EmptyState title="No alerts yet" description="Alerts are never created automatically." action={<Button size="sm">New alert</Button>} />
      <StatSkeleton />
      <ChartSkeleton height={120} />
      <TableSkeleton rows={4} cols={3} />
    </div>
  ),
};
