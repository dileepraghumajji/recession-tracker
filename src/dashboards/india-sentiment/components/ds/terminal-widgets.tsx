/**
 * India Sentiment Terminal widgets on the TerminalK design system.
 * Server components; each renders inside a WidgetShell so it can live in the DashboardGrid.
 */
import { GripVertical } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/platform/ui/primitives/badge";
import { BarList, CategoryBar, DivergingBars, type Segment } from "@/platform/ui/patterns/bars";
import { Delta } from "@/platform/ui/patterns/delta";
import { Sparkline } from "@/platform/ui/patterns/sparkline";
import { WidgetShell } from "@/platform/ui/patterns/widget-shell";
import type { Snapshot } from "../../lib/engine/snapshot";
import { zone } from "../../lib/engine/snapshot";
import { fmtCr, fmtNum, fmtRupeesCr, fmtSigned } from "../../lib/format";
import type { Band } from "../../lib/types";
import { BASE } from "../../routes";

export function bandSegments(bands: Band[]): Segment[] {
  const color: Record<Band["tone"], string> = {
    "fear-strong": "var(--down)",
    fear: "color-mix(in srgb, var(--down) 60%, var(--surface-3))",
    neutral: "var(--surface-3)",
    greed: "color-mix(in srgb, var(--up) 60%, var(--surface-3))",
    "greed-strong": "var(--up)",
  };
  let from = 0;
  return bands.map((b) => {
    const to = Math.min(100, Math.round(b.max));
    const seg = { from, to, label: b.label, color: b.label.startsWith("Mild") ? `color-mix(in srgb, ${b.label === "Mild Fear" ? "var(--down)" : "var(--up)"} 30%, var(--surface-3))` : color[b.tone] };
    from = to;
    return seg;
  });
}

const bandTone = (b: Band | null) => (!b ? "neutral" : b.tone.startsWith("greed") ? "up" : b.tone === "neutral" ? "neutral" : "down");

export function HeroWidget({ s, spark }: { s: Snapshot; spark: number[] }) {
  const tone = bandTone(s.band);
  return (
    <section aria-label="India market sentiment" className="relative flex h-full flex-col justify-between gap-3 overflow-hidden rounded-[10px] border border-line bg-surface p-[var(--widget-pad)] shadow-raised">
      <span aria-hidden className="absolute inset-x-0 top-0 h-0.5" style={{ background: tone === "up" ? "var(--up)" : tone === "down" ? "var(--down)" : "var(--accent)" }} />
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className="tk-drag-handle -ml-1.5 hidden cursor-grab items-center text-muted" aria-hidden>
            <GripVertical className="size-3.5" />
          </span>
          <span className="text-2xs font-medium uppercase tracking-[0.08em] text-muted">India Market Sentiment</span>
        </span>
        <span className="text-2xs tabular-nums text-muted">as of {s.asOf}</span>
      </div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-[52px] font-semibold leading-none tracking-tight tabular-nums text-ink">{s.score === null ? "—" : s.score.toFixed(0)}</span>
            <span className="text-sm text-muted">/ 100</span>
          </div>
          <div className="mt-2">
            {s.band ? (
              <Badge tone={tone === "up" ? "up" : tone === "down" ? "down" : "neutral"} className="px-2 py-0.5 text-xs">
                <span aria-hidden>{s.band.emoji}</span> {s.band.label.toUpperCase()}
                {s.band.label.toUpperCase() !== s.band.cls && <span className="opacity-70"> · {s.band.cls}</span>}
              </Badge>
            ) : (
              <Badge>INSUFFICIENT DATA</Badge>
            )}
          </div>
        </div>
        <Sparkline data={spark} width={150} height={52} tone={tone === "down" ? "down" : tone === "up" ? "up" : "accent"} reference={50} />
      </div>
      <CategoryBar segments={bandSegments(s.bands)} marker={s.score} />
      <dl className="grid grid-cols-4 gap-2 border-t border-line pt-2">
        {(
          [
            ["d1", "1D"],
            ["w1", "1W"],
            ["m1", "1M"],
            ["m3", "3M"],
          ] as const
        ).map(([k, label]) => (
          <div key={k}>
            <dt className="text-2xs uppercase tracking-wide text-muted">{label}</dt>
            <dd className="text-[13px] font-medium">
              <Delta value={s.momentum[k]} label={`sentiment ${label}`} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-2xs">
        <span className="text-ink-2">{label}</span>
        <span className="tabular-nums text-ink">{Math.round(value * 100)}%</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

export function ConfidenceWidget({ s }: { s: Snapshot }) {
  const c = s.confidence;
  return (
    <WidgetShell title="Model confidence" info="How much to trust the score: coverage, freshness, core-segment coverage and agreement between independent sources." footer={c.reasons[0]}>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[32px] font-semibold leading-none tabular-nums">{c.score}</span>
        <span className="text-xs text-muted">/ 100</span>
      </div>
      <div className="mt-3 space-y-2">
        <Meter label="Factor coverage" value={c.coverage} />
        <Meter label="Freshness" value={c.freshness} />
        <Meter label="Core segments" value={c.criticalCoverage} />
        <Meter label="Source agreement" value={c.agreement} />
      </div>
    </WidgetShell>
  );
}

export function RegimeWidget({ s }: { s: Snapshot }) {
  const met = s.regime.candidates.filter((c) => c.matched);
  return (
    <WidgetShell title="Current regime" info="Separate classifier: specialised regimes require all conditions across independent factor groups.">
      <div className="font-mono text-xl font-semibold tracking-tight text-ink">{s.regime.primary ?? "UNAVAILABLE"}</div>
      {s.regime.secondary.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {s.regime.secondary.map((r) => (
            <Badge key={r} tone="accent">
              {r}
            </Badge>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-ink-2">{s.regime.text}</p>
      <ul className="mt-2 space-y-0.5 text-2xs text-muted">
        {s.regime.candidates.slice(0, 6).map((c) => (
          <li key={c.id} className={c.matched ? "text-ink" : undefined}>
            {c.matched ? "●" : "○"} {c.id} · {c.conditions.filter((x) => x.met).length}/{c.conditions.length}
          </li>
        ))}
      </ul>
      <span className="sr-only">{met.length} regimes matched</span>
    </WidgetShell>
  );
}

export function SummaryWidget({ s }: { s: Snapshot }) {
  const change = s.changes.d1?.significant ? s.changes.d1 : s.changes.w1;
  return (
    <WidgetShell title="Summary">
      <p className="text-sm leading-relaxed text-ink">{s.headline}</p>
      {change && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{change.text}</p>}
    </WidgetShell>
  );
}

export function FactorsWidget({ s }: { s: Snapshot }) {
  return (
    <WidgetShell title="Factor contribution" subtitle="Factor score around neutral 50 · contribution in points" actions={<Link href={`${BASE}/factors`} className="text-xs text-accent hover:underline">All indicators</Link>}>
      <DivergingBars items={s.factors.map((f) => ({ id: f.id, label: f.label, value: f.score, secondary: f.score === null ? "—" : fmtSigned(f.points, 1), title: `weight ${(f.effectiveWeight * 100).toFixed(1)}% · coverage ${(f.coverage * 100).toFixed(0)}%` }))} />
    </WidgetShell>
  );
}

export function DriversWidget({ s }: { s: Snapshot }) {
  return (
    <WidgetShell title="What is driving the market" info="Factors ranked by contribution to the score (points = effective weight × (score − 50)).">
      <div className="text-2xs font-medium uppercase tracking-wide text-muted">Top positive</div>
      <BarList tone="up" className="mt-1" items={s.drivers.positive.slice(0, 4).map((d) => ({ key: d.id, label: d.phrase, value: d.points }))} format={(v) => `+${v.toFixed(1)}`} />
      <div className="mt-3 text-2xs font-medium uppercase tracking-wide text-muted">Top negative</div>
      <BarList tone="down" className="mt-1" items={s.drivers.negative.slice(0, 4).map((d) => ({ key: d.id, label: d.phrase, value: d.points }))} format={(v) => v.toFixed(1)} />
    </WidgetShell>
  );
}

export function SubScoresWidget({ s }: { s: Snapshot }) {
  const rows: [string, number | null, boolean?][] = [
    ["Market momentum", s.subScores.momentum],
    ["Internal strength", s.subScores.internalStrength],
    ["Sector risk appetite", s.subScores.sectorRiskAppetite],
    ["Institutional flow", s.subScores.institutionalFlow],
    ["India liquidity", s.subScores.liquidity],
    ["Credit stress", s.subScores.creditStress, true],
    ["Global risk appetite", s.subScores.globalRisk],
    ["Earnings momentum", s.subScores.earningsMomentum],
    ["Retail speculation", s.subScores.retailSpeculation],
  ];
  return (
    <WidgetShell title="Sub-scores" subtitle="0–100">
      <ul className="space-y-2">
        {rows.map(([l, v, inverse]) => (
          <li key={l} className="grid grid-cols-[1fr_5rem_2rem] items-center gap-2 text-xs">
            <span className="truncate text-ink-2">{l}</span>
            <span className="h-1.5 rounded-full bg-surface-2">
              {v !== null && <span className="block h-full rounded-full" style={{ width: `${v}%`, background: (inverse ? v <= 50 : v >= 50) ? "var(--up)" : "var(--down)" }} />}
            </span>
            <span className="text-right tabular-nums text-ink">{v === null ? "n/a" : v.toFixed(0)}</span>
          </li>
        ))}
      </ul>
    </WidgetShell>
  );
}

export function OptionsSnapshotWidget({ s }: { s: Snapshot }) {
  const o = s.options.find((x) => x.underlying === "NIFTY");
  const n = o?.near;
  const rows: [string, string][] = n
    ? [
        ["Expiry", n.expiry],
        ["Spot / ATM", `${fmtNum(n.spot, 1)} / ${n.atmStrike}`],
        ["Call premium", fmtRupeesCr(n.totals.callPremium)],
        ["Put premium", fmtRupeesCr(n.totals.putPremium)],
        ["Premium PCR", fmtNum(n.totals.premiumPcr, 2)],
        ["OI PCR", fmtNum(n.totals.oiPcr, 2)],
        ["Max Pain (theoretical)", n.maxPain ? `${n.maxPain.strike} (${fmtSigned(n.maxPain.distancePct, 1)}%)` : "—"],
        ["Potential support", zone(n.zones.support)],
        ["Potential resistance", zone(n.zones.resistance)],
      ]
    : [];
  return (
    <WidgetShell title="NIFTY option chain" subtitle="Current expiry" empty={n ? null : { title: "No option-chain data", description: "Ingest chains or connect a provider." }} actions={<Link href="/design-system/samples/option-chain" className="text-xs text-accent hover:underline">Open chain</Link>}>
      <dl className="divide-y divide-[var(--border)] text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 py-1.5">
            <dt className="text-ink-2">{k}</dt>
            <dd className="tabular-nums text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {o?.pcr.divergent && <p className="mt-2 rounded-md bg-accent-subtle p-2 text-xs text-ink">{o.pcr.text}</p>}
      {o && <p className="mt-2 text-xs text-muted">{o.shift.text}</p>}
    </WidgetShell>
  );
}

export function QuestionsWidget({ s }: { s: Snapshot }) {
  const dot = { positive: "var(--up)", negative: "var(--down)", neutral: "var(--muted)", na: "var(--surface-3)" } as const;
  const word = { positive: "supportive", negative: "caution", neutral: "neutral", na: "unavailable" } as const;
  return (
    <WidgetShell title="The 20 questions" subtitle="Answered from the current snapshot">
      <ol className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
        {s.answers.map((a) => (
          <li key={a.n} className="min-w-0">
            <div className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.05em] text-muted">
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: dot[a.tone] }} aria-label={word[a.tone]} />
              {a.n}. {a.q}
            </div>
            <p className="mt-0.5 text-xs leading-snug text-ink">{a.a}</p>
          </li>
        ))}
      </ol>
    </WidgetShell>
  );
}

export function FlowsWidget({ s }: { s: Snapshot }) {
  const w: [string, "d1" | "d5" | "m1" | "m3" | "m6"][] = [["1D", "d1"], ["5D", "d5"], ["1M", "m1"], ["3M", "m3"], ["6M", "m6"]];
  return (
    <WidgetShell title="FII / DII flows" actions={<Badge tone={s.flows.label.includes("positive") ? "up" : s.flows.label.includes("negative") ? "down" : "neutral"}>{s.flows.label}</Badge>} footer={s.flows.detections[0]}>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-2xs uppercase tracking-wide text-muted">
            <th className="pb-1 text-left font-medium">Window</th>
            <th className="pb-1 text-right font-medium">FII / FPI</th>
            <th className="pb-1 text-right font-medium">DII</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {w.map(([l, k]) => (
            <tr key={k} className="border-t border-line">
              <td className="py-1 text-ink-2">{l}</td>
              <td className={`py-1 text-right ${(s.flows.fii[k] ?? 0) >= 0 ? "text-up-fg" : "text-down-fg"}`}>{fmtCr(s.flows.fii[k])}</td>
              <td className={`py-1 text-right ${(s.flows.dii[k] ?? 0) >= 0 ? "text-up-fg" : "text-down-fg"}`}>{fmtCr(s.flows.dii[k])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </WidgetShell>
  );
}

export function DivergencesWidget({ s }: { s: Snapshot }) {
  const active = s.divergences.filter((d) => d.active);
  return (
    <WidgetShell title="Divergences" info="Describe current conditions; not reversal signals." footer={`${s.breadth.divergence.label}`}>
      {active.length ? (
        <ul className="space-y-2">
          {active.map((d) => (
            <li key={d.id} className="text-[13px]">
              <Badge tone={d.kind === "bullish" ? "up" : "down"}>{d.kind === "bullish" ? "▲ Bullish" : "▼ Bearish"}</Badge> <span className="text-ink">{d.label}</span>
              <div className="mt-0.5 text-xs text-muted">{d.evidence}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">No active divergences.</p>
      )}
    </WidgetShell>
  );
}

export function MonitorWidget({ s }: { s: Snapshot }) {
  return (
    <WidgetShell title="What to monitor">
      <ul className="space-y-1.5 text-[13px] text-ink">
        {s.narrative.monitor.map((m) => (
          <li key={m} className="flex gap-2">
            <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-accent" />
            {m}
          </li>
        ))}
      </ul>
    </WidgetShell>
  );
}
