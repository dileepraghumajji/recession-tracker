import type { ReactNode } from "react";
import { cn } from "../cn";

export interface Segment {
  from: number;
  to: number;
  label: string;
  color: string;
}

/**
 * Tremor-style category bar: coloured segments on a 0–max scale with an
 * optional marker (e.g. the sentiment score on the fear/greed bands).
 */
export function CategoryBar({ segments, marker, max = 100, className, showLabels = true }: { segments: Segment[]; marker?: number | null; max?: number; className?: string; showLabels?: boolean }) {
  return (
    <div className={className}>
      <div className="relative flex h-2 w-full gap-0.5" role="img" aria-label={`Scale with ${segments.map((s) => `${s.label} ${s.from}–${s.to}`).join(", ")}${marker != null ? `; current ${marker.toFixed(0)}` : ""}`}>
        {segments.map((s) => (
          <div key={s.label} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${((s.to - s.from) / max) * 100}%`, background: s.color }} title={`${s.label}: ${s.from}–${s.to}`} />
        ))}
        {marker != null && (
          <div className="absolute -top-1 h-4 w-1 rounded-full bg-ink ring-2 ring-[var(--surface)]" style={{ left: `calc(${Math.max(0, Math.min(max, marker)) / max * 100}% - 2px)` }} />
        )}
      </div>
      {showLabels && (
        <div className="relative mt-1.5 h-3 text-2xs text-muted tabular-nums">
          {[0, ...segments.map((s) => s.to)].map((t, i, a) => (
            <span key={t} className="absolute -translate-x-1/2" style={{ left: `${(t / max) * 100}%`, transform: i === 0 ? "none" : i === a.length - 1 ? "translateX(-100%)" : undefined }}>
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export interface DivergingItem {
  id: string;
  label: ReactNode;
  /** Value on the scale (e.g. a 0-100 score). */
  value: number | null;
  /** Right-aligned secondary figure (e.g. contribution points). */
  secondary?: ReactNode;
  title?: string;
}

/** Horizontal bars diverging from a centre value (e.g. factor scores around neutral 50). */
export function DivergingBars({ items, center = 50, min = 0, max = 100, positiveLabel = "greed", negativeLabel = "fear", className }: { items: DivergingItem[]; center?: number; min?: number; max?: number; positiveLabel?: string; negativeLabel?: string; className?: string }) {
  const pos = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div className={cn("space-y-1", className)}>
      {items.map((it) => {
        const v = it.value;
        const c = pos(center);
        const p = v === null ? c : pos(Math.max(min, Math.min(max, v)));
        return (
          <div key={it.id} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_2.5rem_3.5rem] items-center gap-2 text-xs" title={it.title}>
            <span className="truncate text-ink-2">{it.label}</span>
            <div className="relative h-2 rounded-full bg-surface-2">
              <div className="absolute inset-y-[-2px] w-px bg-[var(--axis)]" style={{ left: `${c}%` }} />
              {v !== null && <div className="absolute inset-y-0 rounded-full" style={{ left: `${Math.min(c, p)}%`, width: `${Math.abs(p - c)}%`, background: v >= center ? "var(--up)" : "var(--down)" }} />}
            </div>
            <span className={cn("text-right tabular-nums", v === null ? "text-muted" : "text-ink")}>{v === null ? "n/a" : v.toFixed(0)}</span>
            <span className="text-right tabular-nums text-muted">{it.secondary ?? ""}</span>
          </div>
        );
      })}
      <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_2.5rem_3.5rem] gap-2 text-2xs text-muted">
        <span />
        <span className="flex justify-between">
          <span>← {negativeLabel}</span>
          <span>{positiveLabel} →</span>
        </span>
      </div>
    </div>
  );
}

/** Tremor-style bar list: labelled horizontal bars sized by value. */
export function BarList({ items, format = (v: number) => v.toLocaleString("en-IN"), className, tone = "accent" }: { items: { label: ReactNode; value: number; key: string }[]; format?: (v: number) => string; className?: string; tone?: "accent" | "up" | "down" }) {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  const bg = tone === "up" ? "var(--up-subtle)" : tone === "down" ? "var(--down-subtle)" : "var(--accent-subtle)";
  return (
    <ul className={cn("space-y-1", className)}>
      {items.map((i) => (
        <li key={i.key} className="relative flex h-7 items-center justify-between rounded-md px-2 text-xs">
          <span aria-hidden className="absolute inset-y-0 left-0 rounded-md" style={{ width: `${(Math.abs(i.value) / max) * 100}%`, background: bg }} />
          <span className="relative truncate text-ink">{i.label}</span>
          <span className="relative tabular-nums text-ink-2">{format(i.value)}</span>
        </li>
      ))}
    </ul>
  );
}
