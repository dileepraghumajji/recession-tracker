"use client";
import { ArrowRight, Bell, Download, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/platform/ui/primitives/badge";
import { Button } from "@/platform/ui/primitives/button";
import { Input, Kbd } from "@/platform/ui/primitives/misc";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/platform/ui/primitives/menu";
import { Segmented } from "@/platform/ui/primitives/segmented";
import { Select } from "@/platform/ui/primitives/select";
import { Switch } from "@/platform/ui/primitives/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/platform/ui/primitives/tabs";
import { Tooltip } from "@/platform/ui/primitives/tooltip";
import { BarList, CategoryBar, DivergingBars } from "@/platform/ui/patterns/bars";
import { ChartPanel, type ChartPane } from "@/platform/ui/patterns/chart-panel";
import { DataTable, type ColumnDef } from "@/platform/ui/patterns/data-table";
import { Delta } from "@/platform/ui/patterns/delta";
import { EmptyState } from "@/platform/ui/patterns/empty-state";
import { FilterBar, FilterField, TimeRangeSelector, type TimeRange } from "@/platform/ui/patterns/filter-bar";
import { ChartSkeleton, StatSkeleton, TableSkeleton } from "@/platform/ui/patterns/skeletons";
import { Sparkline } from "@/platform/ui/patterns/sparkline";
import { StatCard } from "@/platform/ui/patterns/stat-card";
import { StatusPill } from "@/platform/ui/patterns/status";
import { WidgetShell } from "@/platform/ui/patterns/widget-shell";

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 border-t border-line pt-8">
      <h2 id={`${id}-h`} className="text-base font-semibold tracking-tight text-ink">
        {title}
      </h2>
      {description && <p className="mt-1 max-w-3xl text-[13px] text-ink-2">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Swatch({ name, note, text }: { name: string; note?: string; text?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="size-10 shrink-0 rounded-lg border border-line" style={{ background: text ? "var(--surface)" : `var(--${name})` }}>
        {text && (
          <span className="flex h-full items-center justify-center text-sm font-semibold" style={{ color: `var(--${name})` }}>
            Aa
          </span>
        )}
      </div>
      <div className="min-w-0">
        <div className="font-mono text-xs text-ink">--{name}</div>
        {note && <div className="text-2xs text-muted">{note}</div>}
      </div>
    </div>
  );
}

// Deterministic demo data.
function walk(n: number, seed: number, start = 100, vol = 1) {
  let s = seed;
  let v = start;
  return Array.from({ length: n }, () => {
    s = (s * 9301 + 49297) % 233280;
    v += ((s / 233280) - 0.48) * vol;
    return v;
  });
}
const days = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2025, 9, 1) + i * 86400000).toISOString().slice(0, 10));

interface Row {
  sym: string;
  last: number;
  chg: number;
  vol: number;
  oi: number;
}

export function Gallery() {
  const [range, setRange] = useState<TimeRange>("1Y");
  const [view, setView] = useState("chart");
  const [sel, setSel] = useState("NIFTY");
  const [on, setOn] = useState(true);
  const [chips, setChips] = useState(["NSE", "Weekly expiry"]);

  const panes = useMemo<ChartPane[]>(() => {
    const d = days(260);
    const px = walk(260, 7, 24000, 180);
    const s = walk(260, 11, 55, 3).map((v) => Math.max(5, Math.min(95, v)));
    return [
      { id: "p", series: [{ id: "nifty", label: "NIFTY 50", type: "area", color: "series-1", data: d.map((t, i) => ({ time: t, value: px[i] })) }], weight: 2 },
      { id: "s", series: [{ id: "sent", label: "Sentiment", type: "baseline", baseline: 50, referenceLine: 50, data: d.map((t, i) => ({ time: t, value: s[i] })) }], weight: 1 },
    ];
  }, []);

  const rows = useMemo<Row[]>(() => {
    const syms = ["NIFTY", "BANKNIFTY", "FINNIFTY", "RELIANCE", "HDFCBANK", "INFY", "TCS", "ICICIBANK", "SBIN", "LT"];
    return Array.from({ length: 1000 }, (_, i) => {
      const r = walk(3, i + 3, 0, 4);
      return { sym: `${syms[i % syms.length]}${i >= syms.length ? "-" + (i + 1) : ""}`, last: 1000 + ((i * 7919) % 25000), chg: r[2], vol: (i * 104729) % 9_000_000, oi: (i * 1299709) % 20_000_000 };
    });
  }, []);
  const maxOi = Math.max(...rows.map((r) => r.oi));
  const cols = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      { accessorKey: "sym", header: "Symbol", cell: (c) => <span className="font-mono text-xs">{c.getValue() as string}</span> },
      { accessorKey: "last", header: "Last", meta: { numeric: true }, cell: (c) => (c.getValue() as number).toLocaleString("en-IN") },
      { accessorKey: "chg", header: "Chg %", meta: { numeric: true }, cell: (c) => <Delta value={c.getValue() as number} suffix="%" dp={2} /> },
      { accessorKey: "vol", header: "Volume", meta: { numeric: true }, cell: (c) => (c.getValue() as number).toLocaleString("en-IN") },
      { accessorKey: "oi", header: "Open interest", meta: { numeric: true, heat: (r) => r.oi / maxOi, heatColor: "accent" }, cell: (c) => (c.getValue() as number).toLocaleString("en-IN") },
    ],
    [maxOi],
  );

  return (
    <div className="space-y-10">
      <nav aria-label="Sections" className="flex flex-wrap gap-1 text-xs">
        {["principles", "color", "type", "space", "motion", "primitives", "patterns", "samples"].map((s) => (
          <a key={s} href={`#${s}`} className="rounded-md border border-line px-2 py-1 capitalize text-ink-2 hover:bg-surface-2 hover:text-ink">
            {s}
          </a>
        ))}
      </nav>

      <Section id="principles" title="Principles">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Dark-first, calm", "Near-black canvas, graphite surfaces, one signal-violet accent. Colour is reserved for meaning: market direction, status, series."],
            ["Numbers are the interface", "Geist with tabular figures everywhere numbers align; hero figures large and quiet; every value carries its unit and freshness."],
            ["Direction is never colour-only", "▲/▼ glyph + sign + label accompany teal/red. A blue/orange scheme is one click away for colour-blind users."],
            ["Density on demand", "Compact, comfortable and spacious modes change row height, padding and type size from three tokens — no per-page tweaks."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-[10px] border border-line bg-surface p-4">
              <div className="text-[13px] font-semibold text-ink">{t}</div>
              <p className="mt-1 text-xs text-ink-2">{d}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="color" title="Colour" description="Semantic roles only — components never use raw hex. Values shown are live for the current theme; ratios are WCAG contrast on the surface colour.">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 text-2xs font-medium uppercase tracking-[0.08em] text-muted">Surfaces</h3>
            <div className="grid grid-cols-2 gap-3">
              <Swatch name="page" note="App canvas" />
              <Swatch name="surface" note="Widgets, sidebar" />
              <Swatch name="surface-2" note="Hover, headers, inputs" />
              <Swatch name="surface-3" note="Selected, pressed" />
            </div>
            <h3 className="mb-3 mt-6 text-2xs font-medium uppercase tracking-[0.08em] text-muted">Text</h3>
            <div className="grid grid-cols-2 gap-3">
              <Swatch name="ink" text note="Primary · 16.1 / 19.9:1" />
              <Swatch name="ink-2" text note="Secondary · 7.4 / 7.7:1" />
              <Swatch name="muted" text note="Tertiary, axes · 5.6 / 5.8:1" />
              <Swatch name="accent" text note="Signal violet · 6.9 / 6.3:1" />
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-2xs font-medium uppercase tracking-[0.08em] text-muted">Market</h3>
            <div className="grid grid-cols-2 gap-3">
              <Swatch name="up" note="Up / risk-on / greed" />
              <Swatch name="down" note="Down / risk-off / fear" />
              <Swatch name="up-fg" text note="Up as text · ≥ 5.2:1" />
              <Swatch name="down-fg" text note="Down as text · ≥ 5.3:1" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 rounded-lg border border-line bg-surface p-3 text-sm">
              <Delta value={1.84} suffix="%" dp={2} /> <Delta value={-0.62} suffix="%" dp={2} /> <Delta value={0} suffix="%" dp={2} />
              <Delta value={2.1} suffix=" VIX" goodWhen="down" />
              <span className="text-2xs text-muted">Colour-blind check: deutan ΔE 11.6 dark / 12.0 light (target ≥ 8). Switch schemes in the display menu.</span>
            </div>
            <h3 className="mb-3 mt-6 text-2xs font-medium uppercase tracking-[0.08em] text-muted">Status (icon + label always)</h3>
            <div className="flex flex-wrap gap-4">
              <StatusPill status="LIVE" />
              <StatusPill status="RECENT" />
              <StatusPill status="STALE" />
              <StatusPill status="UNAVAILABLE" />
            </div>
            <h3 className="mb-3 mt-6 text-2xs font-medium uppercase tracking-[0.08em] text-muted">Series (validated order — never cycled)</h3>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <div key={n} className="flex flex-1 flex-col items-center gap-1">
                  <div className="h-8 w-full rounded-md" style={{ background: `var(--series-${n})` }} />
                  <span className="font-mono text-2xs text-muted">{n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section id="type" title="Typography" description="Geist Sans for UI, Geist Mono for tickers, codes and the wordmark. Tabular figures wherever numbers stack.">
        <div className="space-y-3">
          {(
            [
              ["44 / hero", "text-[44px] font-semibold tracking-tight leading-none", "68 / 100"],
              ["26 / stat", "text-[26px] font-semibold tracking-tight", "₹2,01,910 Cr"],
              ["20 / page title", "text-xl font-semibold tracking-tight", "India Market Sentiment"],
              ["14 / body large", "text-sm", "Sentiment improved 3.9 points over 1 week."],
              ["13 / body (default)", "text-[13px]", "Breadth deteriorated while FII selling slowed."],
              ["12 / small", "text-xs text-ink-2", "Coverage 100% · freshness 100%"],
              ["11 / label", "text-2xs font-medium uppercase tracking-[0.08em] text-muted", "Factor contribution"],
              ["mono 12", "font-mono text-xs", "NIFTY 25300 CE · 2026-10-06"],
            ] as const
          ).map(([k, cls, sample]) => (
            <div key={k} className="grid grid-cols-[8rem_1fr] items-baseline gap-4 border-b border-line pb-3">
              <span className="font-mono text-2xs text-muted">{k}</span>
              <span className={`${cls} tabular-nums text-ink`}>{sample}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="space" title="Spacing, radius, elevation & density" description="4 px base grid. Radius: 4 controls-inner · 6 controls · 10 widgets · 12 dialogs. Elevation by border + subtle shadow; popovers use the pop shadow.">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex items-end gap-2">
            {[4, 8, 12, 16, 24, 32, 48].map((s) => (
              <div key={s} className="flex flex-col items-center gap-1">
                <div className="bg-accent-subtle ring-1 ring-accent/40" style={{ width: s, height: s }} />
                <span className="font-mono text-2xs text-muted">{s}</span>
              </div>
            ))}
          </div>
          <div className="flex items-end gap-3">
            {[4, 6, 10, 12].map((r) => (
              <div key={r} className="flex flex-col items-center gap-1">
                <div className="size-12 border border-line-strong bg-surface-2" style={{ borderRadius: r }} />
                <span className="font-mono text-2xs text-muted">r{r}</span>
              </div>
            ))}
          </div>
          <div className="flex items-end gap-4">
            <div className="flex h-16 w-24 items-center justify-center rounded-[10px] border border-line bg-surface text-2xs text-muted shadow-raised">raised</div>
            <div className="flex h-16 w-24 items-center justify-center rounded-[10px] bg-surface text-2xs text-muted shadow-pop">pop</div>
          </div>
        </div>
        <div className="mt-6 rounded-lg border border-line bg-surface p-4 text-[13px] text-ink-2">
          Density tokens — <span className="font-mono text-xs">--row-h</span> 26/32/38 · <span className="font-mono text-xs">--control-h</span> 28/32/36 · <span className="font-mono text-xs">--widget-pad</span> 12/16/20 ·{" "}
          <span className="font-mono text-xs">--text-body</span> 12/13/14 px. Try it from the display menu (sliders icon) or <Kbd>⌘</Kbd>
          <Kbd>K</Kbd> → “density”.
        </div>
      </Section>

      <Section id="motion" title="Motion" description="Short, functional, interruptible. Everything respects prefers-reduced-motion.">
        <div className="grid gap-3 text-[13px] sm:grid-cols-4">
          {[
            ["--dur-fast", "120 ms", "Hover, press, toggles"],
            ["--dur-base", "180 ms", "Popovers, grid moves, sidebar"],
            ["--dur-slow", "260 ms", "Page-level transitions"],
            ["--motion-ease", "cubic-bezier(.16,1,.3,1)", "Ease-out-expo for entrances"],
          ].map(([t, v, d]) => (
            <div key={t} className="rounded-lg border border-line bg-surface p-3">
              <div className="font-mono text-xs text-ink">{t}</div>
              <div className="mt-1 text-ink-2">{v}</div>
              <div className="text-2xs text-muted">{d}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="primitives" title="Primitives" description="shadcn-style components on Radix: keyboard-complete, focus-visible rings, token-driven.">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-[10px] border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary">
                <Plus /> Create alert
              </Button>
              <Button>
                <RefreshCw /> Refresh
              </Button>
              <Button variant="outline">
                <Download /> Export
              </Button>
              <Button variant="ghost">Cancel</Button>
              <Tooltip content="Notifications">
                <Button variant="ghost" size="icon" aria-label="Notifications">
                  <Bell />
                </Button>
              </Tooltip>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Neutral</Badge>
              <Badge tone="accent">Beta</Badge>
              <Badge tone="up">▲ Greed</Badge>
              <Badge tone="down">▼ Fear</Badge>
              <Badge tone="warning">Stale</Badge>
              <Badge tone="outline">SYNTHETIC</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Segmented value={view} onChange={setView} options={[{ value: "chart", label: "Chart" }, { value: "table", label: "Table" }, { value: "both", label: "Both" }]} label="View" />
              <Select value={sel} onChange={setSel} label="Underlying" options={[{ value: "NIFTY", label: "NIFTY", group: "Index" }, { value: "BANKNIFTY", label: "BANKNIFTY", group: "Index" }, { value: "FINNIFTY", label: "FINNIFTY", group: "Index" }]} />
              <label className="flex items-center gap-2 text-[13px] text-ink-2">
                <Switch checked={on} onCheckedChange={setOn} label="Auto-refresh" /> Auto-refresh
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Input placeholder="Search strike…" className="max-w-56" aria-label="Search strike" />
              <Menu>
                <MenuTrigger asChild>
                  <Button>Actions</Button>
                </MenuTrigger>
                <MenuContent>
                  <MenuLabel>Chart</MenuLabel>
                  <MenuItem>
                    <Download /> Export PNG
                  </MenuItem>
                  <MenuItem>
                    <RefreshCw /> Reload data
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem>Reset zoom</MenuItem>
                </MenuContent>
              </Menu>
            </div>
          </div>
          <div className="rounded-[10px] border border-line bg-surface p-4">
            <Tabs defaultValue="a">
              <TabsList>
                <TabsTrigger value="a">Overview</TabsTrigger>
                <TabsTrigger value="b">Positioning</TabsTrigger>
                <TabsTrigger value="c">Flows</TabsTrigger>
              </TabsList>
              <TabsContent value="a" className="pt-4 text-[13px] text-ink-2">
                Tabs switch sub-views inside a widget; arrow keys move between tabs.
              </TabsContent>
              <TabsContent value="b" className="pt-4 text-[13px] text-ink-2">
                Positioning content.
              </TabsContent>
              <TabsContent value="c" className="pt-4 text-[13px] text-ink-2">
                Flows content.
              </TabsContent>
            </Tabs>
            <div className="mt-6 flex items-center gap-6">
              <Sparkline data={walk(40, 3, 100, 3)} />
              <Sparkline data={walk(40, 5, 100, 3).reverse()} />
              <Sparkline data={walk(40, 9, 100, 3)} tone="accent" />
            </div>
          </div>
        </div>
      </Section>

      <Section id="patterns" title="Patterns" description="The building blocks every dashboard composes: widgets, stats, charts, tables, filters, and their loading/empty states.">
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="India Market Sentiment" value="68" unit="/ 100" delta={{ value: -5.4, label: "1W" }} badge={<Badge tone="up">🟢 Greed</Badge>} spark={walk(30, 4, 60, 3)} accent="up" />
            <StatCard label="India VIX" value="13.42" delta={{ value: 6.1, suffix: "%", label: "1D", goodWhen: "down" }} spark={walk(30, 8, 13, 0.6)} sparkTone="muted" info="Implied 30-day volatility of NIFTY options." />
            <StatCard label="FII cash (5D)" value="−₹7,877" unit="Cr" delta={{ value: -2.3, suffix: "k Cr", label: "vs prior 5D" }} footnote="Source: NSE / NSDL · 2026-09-30" />
            <StatCard label="Loading" value="" loading />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <WidgetShell title="Sentiment scale" info="Configurable 7-band thresholds." status="LIVE" asOf="2026-09-30">
              <CategoryBar
                marker={68}
                segments={[
                  { from: 0, to: 20, label: "Extreme fear", color: "var(--down)" },
                  { from: 20, to: 35, label: "Fear", color: "color-mix(in srgb, var(--down) 70%, var(--surface-3))" },
                  { from: 35, to: 45, label: "Mild fear", color: "color-mix(in srgb, var(--down) 35%, var(--surface-3))" },
                  { from: 45, to: 55, label: "Neutral", color: "var(--surface-3)" },
                  { from: 55, to: 65, label: "Mild greed", color: "color-mix(in srgb, var(--up) 35%, var(--surface-3))" },
                  { from: 65, to: 80, label: "Greed", color: "color-mix(in srgb, var(--up) 70%, var(--surface-3))" },
                  { from: 80, to: 100, label: "Extreme greed", color: "var(--up)" },
                ]}
              />
            </WidgetShell>
            <WidgetShell title="Loading state" loading />
            <WidgetShell title="Empty state" empty={{ title: "No option-chain data", description: "Connect a provider or ingest chains to see this widget.", action: <Button size="sm">Open settings</Button> }} />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <WidgetShell title="Factor contribution" subtitle="Score around neutral 50 · points">
              <DivergingBars
                items={[
                  { id: "b", label: "Market Breadth", value: 61, secondary: "+1.6" },
                  { id: "l", label: "Liquidity", value: 81, secondary: "+2.1" },
                  { id: "v", label: "Valuation", value: 31, secondary: "−0.7" },
                  { id: "f", label: "FII/DII Flows", value: 47, secondary: "−0.3" },
                  { id: "c", label: "Credit", value: null },
                ]}
              />
            </WidgetShell>
            <WidgetShell title="Top positive drivers">
              <BarList
                tone="up"
                items={[
                  { key: "l", label: "Liquidity", value: 2.1 },
                  { key: "e", label: "Earnings", value: 1.7 },
                  { key: "b", label: "Breadth", value: 1.6 },
                ]}
                format={(v) => `+${v.toFixed(1)} pts`}
              />
            </WidgetShell>
          </div>

          <FilterBar
            chips={chips.map((c) => ({ key: c, label: c, onRemove: () => setChips(chips.filter((x) => x !== c)) }))}
            onReset={() => setChips(["NSE", "Weekly expiry"])}
            right={<span className="text-2xs text-muted">Updated 15:30 IST</span>}
          >
            <FilterField label="Underlying">
              <Select value={sel} onChange={setSel} label="Underlying" options={[{ value: "NIFTY", label: "NIFTY" }, { value: "BANKNIFTY", label: "BANKNIFTY" }]} />
            </FilterField>
            <FilterField label="Range">
              <TimeRangeSelector value={range} onChange={setRange} />
            </FilterField>
          </FilterBar>

          <WidgetShell title="NIFTY vs sentiment" subtitle="Stacked panes share the time axis and crosshair — never dual y-axes" actions={<TimeRangeSelector value={range} onChange={setRange} ranges={["1M", "3M", "6M", "1Y"] as TimeRange[]} />}>
            <ChartPanel panes={panes} height={340} />
          </WidgetShell>

          <WidgetShell title="Virtualised data table" subtitle="1,000 rows · sortable · ↑/↓ to move · heat column" flush>
            <DataTable data={rows} columns={cols} label="Instruments" maxHeight={380} initialSorting={[{ id: "oi", desc: true }]} />
          </WidgetShell>

          <div className="grid gap-3 lg:grid-cols-3">
            <WidgetShell title="Stat skeleton">
              <StatSkeleton />
            </WidgetShell>
            <WidgetShell title="Chart skeleton">
              <ChartSkeleton height={120} />
            </WidgetShell>
            <WidgetShell title="Table skeleton">
              <TableSkeleton rows={5} cols={4} />
            </WidgetShell>
          </div>
          <WidgetShell title="Empty state (standalone)">
            <EmptyState title="No alerts yet" description="Alerts are never created automatically. Start from a template." action={<Button variant="primary" size="sm"><Plus /> New alert</Button>} />
          </WidgetShell>
        </div>
      </Section>

      <Section id="samples" title="Sample screens" description="Two real screens rebuilt on the system with live (demo) data — for approval before the dashboards migrate.">
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["/design-system/samples/india-terminal", "India Sentiment · Terminal", "Widget grid (drag / resize / save), hero stats, factor contributions, NIFTY vs sentiment panes, 20 questions."],
            ["/design-system/samples/option-chain", "India Sentiment · Option Chain", "Filter bar, stat row, virtualised chain table with heatmaps, intraday pressure panes, expiry structure."],
          ].map(([href, t, d]) => (
            <Link key={href} href={href} className="group rounded-[10px] border border-line bg-surface p-4 transition-colors hover:border-line-strong">
              <div className="flex items-center justify-between text-[13px] font-semibold text-ink">
                {t} <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-1 text-xs text-ink-2">{d}</p>
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}
