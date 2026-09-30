import Link from "next/link";
import type { ReactNode } from "react";
import { SIGNAL_META, TREND_META } from "@/dashboards/recession/lib/format";
import type { Signal, Trend } from "@/dashboards/recession/lib/types";
import { PageHeader, Panel, Pct, StatusTag } from "@/platform/components/ui";
import { BASE } from "@/dashboards/recession/routes";

export { PageHeader, Panel, Pct, StatusTag };

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

export function IndicatorLink({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Link href={`${BASE}/indicators/${id}`} className="hover:text-accent hover:underline">
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
