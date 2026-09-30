import type { ReactNode } from "react";
import type { DataStatus } from "@/platform/lib/types";

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

export function Pct({ v, dp = 0 }: { v: number | null | undefined; dp?: number }) {
  if (v === null || v === undefined) return <span className="text-muted">—</span>;
  return <span className="num">{(v * 100).toFixed(dp)}%</span>;
}
