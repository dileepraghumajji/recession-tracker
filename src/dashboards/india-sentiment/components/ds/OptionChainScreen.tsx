"use client";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/platform/ui/primitives/badge";
import { Segmented } from "@/platform/ui/primitives/segmented";
import { Select } from "@/platform/ui/primitives/select";
import { BarList } from "@/platform/ui/patterns/bars";
import { ChartPanel, type ChartPane } from "@/platform/ui/patterns/chart-panel";
import { DataTable, type ColumnDef } from "@/platform/ui/patterns/data-table";
import { Delta } from "@/platform/ui/patterns/delta";
import { FilterBar, FilterField } from "@/platform/ui/patterns/filter-bar";
import { StatCard } from "@/platform/ui/patterns/stat-card";
import { WidgetShell } from "@/platform/ui/patterns/widget-shell";
import { cn } from "@/platform/ui/cn";
import type { ChainView } from "../../lib/data/service";
import type { ExpirySummary, IntradayPoint, PositioningShift, SideRow, StrikeRow } from "../../lib/engine/options";
import { API } from "../../routes";

type Heat = "off" | "oi" | "premium" | "iv" | "volume";
const WINDOWS = [
  { value: "5", label: "±5" },
  { value: "10", label: "±10" },
  { value: "15", label: "±15" },
  { value: "25", label: "±25" },
  { value: "0", label: "All" },
];
const nf = (x: number | null | undefined, dp = 0) => (x === null || x === undefined ? "—" : x.toLocaleString("en-IN", { maximumFractionDigits: dp, minimumFractionDigits: dp }));
const cr = (x: number) => (x / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const ACT: Record<string, { short: string; tone: "up" | "down" | "neutral" }> = {
  fresh_buying: { short: "Buy", tone: "up" },
  writing: { short: "Write", tone: "down" },
  short_covering: { short: "SC", tone: "up" },
  long_unwinding: { short: "LU", tone: "down" },
  indeterminate: { short: "", tone: "neutral" },
};

function heatOf(s: SideRow | null, h: Heat) {
  if (!s || h === "off") return 0;
  return h === "oi" ? s.oi : h === "premium" ? s.premium : h === "iv" ? (s.iv ?? 0) : s.volume;
}

function ActivityTag({ s }: { s: SideRow | null }) {
  if (!s || s.activity === "indeterminate") return null;
  const a = ACT[s.activity];
  return (
    <span title={s.activityText} className={cn("rounded px-1 text-2xs", a.tone === "up" ? "bg-up-subtle text-up-fg" : "bg-down-subtle text-down-fg", s.activityConfidence < 0.45 && "opacity-60")}>
      {a.short}
    </span>
  );
}

export function OptionChainScreen({ initial, expiriesSummary, shift, initialIntraday }: { initial: ChainView; expiriesSummary: ExpirySummary[]; shift: PositioningShift | null; initialIntraday: IntradayPoint[] }) {
  const [view, setView] = useState(initial);
  const [u, setU] = useState(initial.underlying);
  const [expiry, setExpiry] = useState(initial.analysis?.expiry ?? "");
  const [win, setWin] = useState(String(initial.analysis?.window ?? 10));
  const [heat, setHeat] = useState<Heat>("oi");
  const [loading, setLoading] = useState(false);
  const [frame, setFrame] = useState("15");
  const [intraday, setIntraday] = useState(initialIntraday);

  useEffect(() => {
    if (u === initial.underlying && expiry === (initial.analysis?.expiry ?? "") && win === String(initial.analysis?.window ?? 10)) {
      setView(initial);
      return;
    }
    let alive = true;
    setLoading(true);
    fetch(`${API}/chain?u=${encodeURIComponent(u)}&window=${win}${expiry ? `&expiry=${expiry}` : ""}`)
      .then((r) => r.json())
      .then((j: ChainView) => alive && setView(j))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [u, expiry, win, initial]);

  useEffect(() => {
    let alive = true;
    fetch(`${API}/intraday?u=${encodeURIComponent(u)}&m=${frame}`)
      .then((r) => r.json())
      .then((j) => alive && setIntraday(j.points ?? []));
    return () => {
      alive = false;
    };
  }, [u, frame]);

  const a = view.analysis;
  const max = useMemo(() => {
    const m = { call: 1, put: 1 };
    for (const r of a?.rows ?? []) {
      m.call = Math.max(m.call, heatOf(r.call, heat));
      m.put = Math.max(m.put, heatOf(r.put, heat));
    }
    return m;
  }, [a, heat]);

  const columns = useMemo<ColumnDef<StrikeRow, unknown>[]>(() => {
    const hl = a?.highlights;
    const callHeat = (r: StrikeRow) => (heat === "off" ? null : heatOf(r.call, heat) / max.call);
    const putHeat = (r: StrikeRow) => (heat === "off" ? null : heatOf(r.put, heat) / max.put);
    const mark = (on: boolean | undefined, v: string) => (on ? <span className="font-semibold underline decoration-dotted underline-offset-2">{v}</span> : v);
    return [
      { id: "cOi", header: "Call OI", accessorFn: (r) => r.call?.oi ?? -1, meta: { numeric: true, heat: callHeat, heatColor: "series-2" }, cell: ({ row: { original: r } }) => mark(hl?.maxCallOi === r.strike, nf(r.call?.oi)) },
      { id: "cDoi", header: "ΔOI", accessorFn: (r) => r.call?.changeInOi ?? 0, meta: { numeric: true, heat: callHeat, heatColor: "series-2" }, cell: ({ row: { original: r } }) => <Delta value={r.call?.changeInOi ?? null} dp={0} goodWhen="none" /> },
      { id: "cPrem", header: "Prem ₹Cr", accessorFn: (r) => r.call?.premium ?? 0, meta: { numeric: true, heat: callHeat, heatColor: "series-2" }, cell: ({ row: { original: r } }) => mark(hl?.maxPremium?.strike === r.strike && hl.maxPremium.type === "CE", r.call ? cr(r.call.premium) : "—") },
      { id: "cIv", header: "IV", accessorFn: (r) => r.call?.iv ?? 0, meta: { numeric: true, heat: callHeat, heatColor: "series-2" }, cell: ({ row: { original: r } }) => nf(r.call?.iv, 1) },
      { id: "cAct", header: "", enableSorting: false, meta: { align: "right" }, cell: ({ row: { original: r } }) => <ActivityTag s={r.call} /> },
      {
        id: "strike",
        header: "Strike",
        accessorKey: "strike",
        meta: { align: "center" },
        cell: ({ row: { original: r } }) => (
          <span className={cn("inline-block min-w-16 rounded px-1.5 py-0.5 font-mono text-xs tabular-nums", r.strike === a?.atmStrike ? "bg-accent text-accent-fg" : "bg-surface-2 text-ink")}>{r.strike}</span>
        ),
      },
      { id: "pAct", header: "", enableSorting: false, cell: ({ row: { original: r } }) => <ActivityTag s={r.put} /> },
      { id: "pIv", header: "IV", accessorFn: (r) => r.put?.iv ?? 0, meta: { numeric: true, heat: putHeat, heatColor: "series-1" }, cell: ({ row: { original: r } }) => nf(r.put?.iv, 1) },
      { id: "pPrem", header: "Prem ₹Cr", accessorFn: (r) => r.put?.premium ?? 0, meta: { numeric: true, heat: putHeat, heatColor: "series-1" }, cell: ({ row: { original: r } }) => mark(hl?.maxPremium?.strike === r.strike && hl.maxPremium.type === "PE", r.put ? cr(r.put.premium) : "—") },
      { id: "pDoi", header: "ΔOI", accessorFn: (r) => r.put?.changeInOi ?? 0, meta: { numeric: true, heat: putHeat, heatColor: "series-1" }, cell: ({ row: { original: r } }) => <Delta value={r.put?.changeInOi ?? null} dp={0} goodWhen="none" /> },
      { id: "pOi", header: "Put OI", accessorFn: (r) => r.put?.oi ?? -1, meta: { numeric: true, heat: putHeat, heatColor: "series-1" }, cell: ({ row: { original: r } }) => mark(hl?.maxPutOi === r.strike, nf(r.put?.oi)) },
    ];
  }, [a, heat, max]);

  const panes = useMemo<ChartPane[]>(
    () => [
      { id: "spot", weight: 3, series: [{ id: "spot", label: `${u} spot`, type: "line", color: "series-1", data: intraday.map((p) => ({ time: p.ts, value: p.spot })) }] },
      { id: "pressure", weight: 2, series: [{ id: "pressure", label: "Net premium pressure", type: "histogram", format: "crore", data: intraday.map((p) => ({ time: p.ts, value: p.pressure / 1e7 })) }] },
    ],
    [intraday, u],
  );

  const atmIndex = a ? a.rows.findIndex((r) => r.strike === a.atmStrike) : -1;
  const pcrRead = (v: number | null, bull: number, bear: number, invert = false) => (v === null ? null : invert ? (v >= bear ? "bearish-leaning" : v <= bull ? "bullish-leaning" : "neutral") : v >= bull ? "bullish-leaning" : v <= bear ? "bearish-leaning" : "neutral");
  const activity = a
    ? (["fresh_buying", "writing", "short_covering", "long_unwinding"] as const).flatMap((k) => [
        { key: `c-${k}`, label: `Calls · likely ${k.replace("_", " ")}`, value: a.activity[k].call / 1e7 },
        { key: `p-${k}`, label: `Puts · likely ${k.replace("_", " ")}`, value: a.activity[k].put / 1e7 },
      ]).filter((x) => x.value > 0).sort((x, y) => y.value - x.value)
    : [];

  return (
    <div className="space-y-[var(--gap)]">
      <FilterBar
        right={
          <span className="flex items-center gap-2 text-2xs text-muted">
            {view.synthetic && <Badge tone="warning">SYNTHETIC</Badge>}
            {a && <span className="tabular-nums">{a.timestamp.replace("T", " ").slice(0, 16)} IST</span>}
          </span>
        }
        onReset={() => {
          setWin("10");
          setHeat("oi");
          setExpiry("");
        }}
      >
        <FilterField label="Underlying">
          <Segmented value={u} onChange={(v) => { setU(v); setExpiry(""); }} options={view.underlyings.length ? view.underlyings : [u]} label="Underlying" size="sm" />
        </FilterField>
        <FilterField label="Expiry">
          <Select value={a?.expiry ?? expiry} onChange={setExpiry} label="Expiry" options={view.expiries.map((e) => ({ value: e.expiry, label: `${e.expiry}${e.kinds.length ? ` · ${e.kinds.join("/")}` : ""}` }))} />
        </FilterField>
        <FilterField label="Strikes">
          <Segmented value={win} onChange={setWin} options={WINDOWS} label="Strikes around ATM" size="sm" />
        </FilterField>
        <FilterField label="Heatmap">
          <Segmented value={heat} onChange={setHeat} options={[{ value: "off", label: "Off" }, { value: "oi", label: "OI" }, { value: "premium", label: "Premium" }, { value: "iv", label: "IV" }, { value: "volume", label: "Volume" }]} label="Heatmap" size="sm" />
        </FilterField>
      </FilterBar>

      <div className="grid grid-cols-2 gap-[var(--gap)] md:grid-cols-3 xl:grid-cols-6">
        <StatCard loading={loading} label="Call premium" value={a ? `₹${nf(a.totals.callPremium / 1e7)}` : "—"} unit="Cr" footnote={`±${a?.window || "all"} strikes`} />
        <StatCard loading={loading} label="Put premium" value={a ? `₹${nf(a.totals.putPremium / 1e7)}` : "—"} unit="Cr" footnote={a ? `Net put ${a.totals.netPutPremium >= 0 ? "+" : "−"}₹${nf(Math.abs(a.totals.netPutPremium) / 1e7)} Cr` : undefined} />
        <StatCard loading={loading} label="Premium PCR" value={nf(a?.totals.premiumPcr, 2)} footnote={pcrRead(a?.totals.premiumPcr ?? null, 0.85, 1.15, true) ?? undefined} info="Put premium ÷ call premium. Not bullish or bearish by itself." />
        <StatCard loading={loading} label="OI PCR" value={nf(a?.totals.oiPcr, 2)} footnote={pcrRead(a?.totals.oiPcr ?? null, 1.1, 0.8) ?? undefined} info="Put OI ÷ call OI (conventional reading)." />
        <StatCard loading={loading} label="Max pain" value={a?.maxPain ? String(a.maxPain.strike) : "—"} footnote={a?.maxPain ? <>Spot <Delta value={a.maxPain.distancePct} suffix="%" dp={2} goodWhen="none" /> away · theoretical</> : undefined} />
        <StatCard loading={loading} label="ATM IV" value={nf(a?.iv.atmIv, 1)} unit="%" footnote={a?.iv.skew25d != null ? `25Δ skew ${a.iv.skew25d.toFixed(2)} vol` : undefined} />
      </div>

      <div className="grid gap-[var(--gap)] xl:grid-cols-[minmax(0,5fr)_minmax(0,2fr)]">
        <WidgetShell
          title={`${u} option chain`}
          subtitle={a ? `${a.expiry} · ${a.daysToExpiry} days · ATM ${a.atmStrike} · spot ${nf(a.spot, 2)}` : undefined}
          info="Buy / Write / SC (short covering) / LU (long unwinding) tags are probabilistic; faded = weak evidence. Underlined = largest in chain."
          loading={loading}
          empty={a ? null : { title: "No option-chain data", description: "Push chains via the ingestion API or connect a provider." }}
          flush
        >
          {a && <DataTable data={a.rows} columns={columns} label={`${u} ${a.expiry} option chain`} getRowId={(r) => String(r.strike)} maxHeight={560} scrollToIndex={atmIndex} rowClassName={(r) => (r.strike === a.atmStrike ? "[&>td]:border-y-accent/50" : undefined)} />}
        </WidgetShell>
        <div className="grid content-start gap-[var(--gap)]">
          <WidgetShell title="Premium pressure" subtitle="Intraday vs spot · bullish +" actions={<Segmented value={frame} onChange={setFrame} options={[{ value: "5", label: "5m" }, { value: "15", label: "15m" }, { value: "30", label: "30m" }, { value: "60", label: "1h" }]} label="Interval" size="sm" />}>
            <ChartPanel panes={panes} height={250} timeOffsetSec={19800} emptyText="No intraday snapshots for this session." />
          </WidgetShell>
          <WidgetShell title="Likely positioning" subtitle="Premium by probable activity (₹ Cr)" loading={loading}>
            <BarList items={activity.slice(0, 6)} format={(v) => v.toFixed(0)} />
            {a && (
              <p className="mt-2 text-xs text-ink-2">
                Net pressure <Delta value={a.pressure.normalized} dp={2} goodWhen="up" /> of premium. Support {a.zones.support?.join("–") ?? "—"} · resistance {a.zones.resistance?.join("–") ?? "—"} (potential, not guaranteed).
              </p>
            )}
          </WidgetShell>
        </div>
      </div>

      <WidgetShell title="Expiry structure" subtitle={shift?.text} flush>
        <DataTable
          data={expiriesSummary}
          label="Expiry structure"
          getRowId={(e) => e.expiry}
          maxHeight={260}
          columns={[
            { accessorKey: "expiry", header: "Expiry", cell: (c) => <span className="font-mono text-xs">{c.getValue() as string}</span> },
            { id: "kinds", header: "Type", accessorFn: (e) => e.kinds.join(", "), cell: (c) => <span className="text-ink-2">{c.getValue() as string}</span> },
            { accessorKey: "daysToExpiry", header: "Days", meta: { numeric: true } },
            { accessorKey: "oi", header: "OI", meta: { numeric: true }, cell: (c) => nf(c.getValue() as number) },
            { accessorKey: "premium", header: "Premium ₹Cr", meta: { numeric: true }, cell: (c) => nf((c.getValue() as number) / 1e7) },
            { accessorKey: "premiumPcr", header: "Prem PCR", meta: { numeric: true }, cell: (c) => nf(c.getValue() as number | null, 2) },
            { accessorKey: "oiPcr", header: "OI PCR", meta: { numeric: true }, cell: (c) => nf(c.getValue() as number | null, 2) },
            { accessorKey: "atmIv", header: "ATM IV", meta: { numeric: true }, cell: (c) => nf(c.getValue() as number | null, 1) },
            { accessorKey: "maxPain", header: "Max pain", meta: { numeric: true }, cell: (c) => nf(c.getValue() as number | null) },
            { accessorKey: "positioning", header: "Positioning", meta: { numeric: true, heat: (e) => (e.positioning === null ? null : Math.abs(e.positioning - 50) / 50), heatColor: "accent" }, cell: (c) => nf(c.getValue() as number | null) },
          ]}
        />
      </WidgetShell>
    </div>
  );
}
