import Link from "next/link";
import type { ReactNode } from "react";
import { SIGNAL_META, TREND_META } from "@/lib/format";
import type { DataStatus, Signal, Trend } from "@/lib/types";

export function Panel({ title, right, children, className = "" }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel p-4 ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title ? <h2 className="panel-title">{title}</h2> : <span />}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function SignalBadge({ signal, compact = false }: { signal: Signal; compact?: boolean }) {
  const m = SIGNAL_META[signal];
  return (
    <span className={`${m.cls} inline-flex items-center gap-1.5 whitespace-nowrap text-xs`} title={m.label}>
      <span className="sig-dot" aria-hidden />
      {!compact && <span className="text-ink-2">{m.label}</span>}
      {compact && <span className="sr-only">{m.label}</span>}
    </span>
  );
}

export function TrendArrow({ trend, showLabel = false }: { trend: Trend; showLabel?: boolean }) {
  const t = TREND_META[trend];
  return (
    <span className={`${t.cls} whitespace-nowrap`} title={t.label}>
      {t.arrow}
      {showLabel && <span className="ml-1 text-xs">{t.label}</span>}
    </span>
  );
}

export function StatusTag({ status }: { status: DataStatus }) {
  return <span className={`status-${status} font-mono text-[11px] tracking-wide`}>{status}</span>;
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-ink-2">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function IndicatorLink({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Link href={`/indicators/${id}`} className="hover:text-accent hover:underline">
      {children}
    </Link>
  );
}

export function ScoreBar({ value }: { value: number | null }) {
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
      <div className="absolute inset-y-0 left-0 rounded-full bg-ink-2" style={{ width: `${v}%`, opacity: 0.8 }} />
      {[50, 75, 90].map((b) => (
        <div key={b} className="absolute inset-y-0 w-px bg-page" style={{ left: `${b}%` }} />
      ))}
    </div>
  );
}

export function Pct({ v, dp = 0 }: { v: number | null | undefined; dp?: number }) {
  if (v === null || v === undefined) return <span className="text-muted">—</span>;
  return <span className="num">{(v * 100).toFixed(dp)}%</span>;
}
