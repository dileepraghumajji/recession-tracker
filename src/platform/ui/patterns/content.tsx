import type { ReactNode } from "react";
import type { DataStatus } from "@/platform/lib/types";
import { cn } from "../cn";

/**
 * Content building blocks for server-rendered dashboard pages (no client JS).
 * Widgets with headers, status and loading states use WidgetShell; these are
 * the lighter frames and text styles pages compose around it.
 */

/** Surface of a static panel/card. */
export const panelClass = "rounded-[10px] border border-line bg-surface";

/** Small uppercase label that titles a panel or a group of values. */
export const labelClass = "text-2xs font-medium uppercase tracking-[0.08em] text-muted";

/**
 * Dense data table. Cells are styled from the table, so rows stay plain markup;
 * mark numeric header/body cells with `className="r"` (right-aligned, tabular, no wrap).
 */
export const tableClass = cn(
  "w-full border-collapse text-[13px]",
  "[&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-line [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-2xs [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-[0.04em] [&_th]:text-muted",
  "[&_td]:border-b [&_td]:border-line [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top",
  "[&_tbody_tr:hover_td]:bg-surface-2 [&_.r]:whitespace-nowrap [&_.r]:text-right [&_.r]:tabular-nums",
);

/** Long-form text (methodology, explanations): paragraphs, headings, lists and inline code. */
export const proseClass = cn(
  "[&_p]:my-2 [&_h2]:mb-1.5 [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-ink [&_h3]:mb-1 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-ink",
  "[&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1 [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-xs",
);

/** Inline text link. */
export const linkClass = "text-accent hover:underline";

export function Panel({ title, right, children, className }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn(panelClass, "p-[var(--widget-pad)]", className)}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title ? <h2 className={labelClass}>{title}</h2> : <span />}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

const STATUS_TEXT: Record<DataStatus, string> = { LIVE: "text-good-ink", RECENT: "text-ink-2", STALE: "text-serious", UNAVAILABLE: "text-muted" };

/** Compact data-status word (LIVE / RECENT / STALE / UNAVAILABLE) for dense tables. */
export function StatusTag({ status, className }: { status: DataStatus; className?: string }) {
  return <span className={cn("font-mono text-[11px] tracking-wide", STATUS_TEXT[status], className)}>{status}</span>;
}

export function statusTextClass(status: DataStatus): string {
  return STATUS_TEXT[status];
}

/** A 0–1 fraction as a percentage; missing values render as an em dash. */
export function Pct({ v, dp = 0 }: { v: number | null | undefined; dp?: number }) {
  if (v === null || v === undefined) return <span className="text-muted">—</span>;
  return <span className="tabular-nums">{(v * 100).toFixed(dp)}%</span>;
}

/** Direction-of-change text colours (always paired with an arrow or sign in the text). */
export const trendClass = { good: "text-good-ink", bad: "text-serious", flat: "text-muted" } as const;
