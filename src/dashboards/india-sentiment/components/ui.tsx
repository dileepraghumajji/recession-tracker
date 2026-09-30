import type { ReactNode } from "react";
import { fmtSigned } from "@/platform/lib/format";
import { Panel, StatusTag } from "@/platform/ui/patterns/content";
import { PageHeader } from "@/platform/ui/shell/page-header";
import { TONE_COLOR } from "../lib/format";
import type { Band, FactorResult } from "../lib/types";

export { PageHeader, Panel, StatusTag };

/** 0-100 sentiment scale with the configured bands and a marker for the current score. */
export function SentimentScale({ score, bands }: { score: number | null; bands: Band[] }) {
  let lo = 0;
  return (
    <div>
      <div className="relative flex h-3 w-full overflow-hidden rounded-full" aria-hidden>
        {bands.map((b) => {
          const hi = Math.min(100, b.max);
          const seg = (
            <div key={b.label} title={`${b.label}: ${lo}–${Math.round(hi)}`} style={{ width: `${hi - lo}%`, background: TONE_COLOR[b.tone], opacity: 0.35, borderRight: "2px solid var(--surface)" }} />
          );
          lo = hi;
          return seg;
        })}
        {score !== null && <div className="absolute top-[-3px] h-[18px] w-[4px] rounded" style={{ left: `calc(${Math.max(0, Math.min(100, score))}% - 2px)`, background: "var(--ink)" }} />}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>0 · Extreme Fear</span>
        <span>50 · Neutral</span>
        <span>Extreme Greed · 100</span>
      </div>
    </div>
  );
}

export function BandBadge({ band }: { band: Band | null }) {
  if (!band) return <span className="text-sm text-muted">INSUFFICIENT DATA</span>;
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold tracking-wide">
      <span aria-hidden>{band.emoji}</span>
      <span>{band.label.toUpperCase()}</span>
      {band.label.toUpperCase() !== band.cls && <span className="text-xs font-normal text-muted">({band.cls})</span>}
    </span>
  );
}

export function Delta({ v, label }: { v: number | null; label: string }) {
  const cls = v === null ? "text-muted" : v > 0.5 ? "trend-good" : v < -0.5 ? "trend-bad" : "trend-flat";
  const arrow = v === null ? "" : v > 0.5 ? "▲" : v < -0.5 ? "▼" : "▶";
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <span className={`tabular-nums text-sm ${cls}`}>
        {arrow} {v === null ? "n/a" : fmtSigned(v, 1)}
      </span>
    </div>
  );
}

/** Diverging bar around neutral 50: factor score, weight and contribution in points. */
export function FactorBars({ factors }: { factors: FactorResult[] }) {
  return (
    <div className="space-y-1.5">
      {factors.map((f) => {
        const s = f.score;
        const left = s === null ? 50 : Math.min(s, 50);
        const width = s === null ? 0 : Math.abs(s - 50);
        return (
          <div key={f.id} className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_2.5rem_3.5rem] items-center gap-2 text-xs" title={`${f.label}: ${s === null ? "unavailable" : s.toFixed(0)} · weight ${(f.effectiveWeight * 100).toFixed(1)}% · coverage ${(f.coverage * 100).toFixed(0)}%`}>
            <span className="truncate text-ink-2">{f.label}</span>
            <div className="relative h-2.5 rounded-sm bg-surface-2">
              <div className="absolute inset-y-0 w-px bg-[var(--axis)]" style={{ left: "50%" }} />
              {s !== null && <div className="absolute inset-y-0 rounded-sm" style={{ left: `${left}%`, width: `${width}%`, background: s >= 50 ? "var(--good)" : "var(--serious)", opacity: 0.85 }} />}
            </div>
            <span className={`tabular-nums text-right ${s === null ? "text-muted" : ""}`}>{s === null ? "n/a" : s.toFixed(0)}</span>
            <span className="tabular-nums text-right text-muted">{s === null ? "—" : fmtSigned(f.points, 1)}</span>
          </div>
        );
      })}
      <div className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_2.5rem_3.5rem] gap-2 text-[10px] text-muted">
        <span />
        <span className="flex justify-between">
          <span>← fear</span>
          <span>greed →</span>
        </span>
        <span className="text-right">score</span>
        <span className="text-right">pts</span>
      </div>
    </div>
  );
}

export function Tone({ tone, children }: { tone: "positive" | "negative" | "neutral" | "na"; children: ReactNode }) {
  const color = tone === "positive" ? "var(--good)" : tone === "negative" ? "var(--serious)" : tone === "na" ? "var(--muted)" : "var(--ink-2)";
  const label = tone === "positive" ? "supportive" : tone === "negative" ? "caution" : tone === "na" ? "unavailable" : "neutral";
  return (
    <span className="inline-flex items-start gap-1.5">
      <span className="mt-1 inline-block h-2 w-2 flex-none rounded-full" style={{ background: color }} title={label} aria-label={label} />
      <span>{children}</span>
    </span>
  );
}

export function DemoWarning({ what }: { what: string }) {
  if (process.env.DATA_MODE !== "demo") return null;
  return (
    <div className="rounded-[10px] border border-line bg-surface p-3 text-sm" style={{ borderColor: "var(--demo)" }}>
      <strong style={{ color: "var(--demo)" }}>Synthetic data:</strong> in demo mode the series are generated from a stylised NIFTY path, so these {what} are circular and meaningless. They only demonstrate the mechanics.
    </div>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-2">{children}</span>;
}
