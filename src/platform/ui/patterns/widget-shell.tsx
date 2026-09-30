import { AlertTriangle, GripVertical, Info } from "lucide-react";
import type { ReactNode } from "react";
import type { DataStatus } from "@/platform/lib/types";
import { cn } from "../cn";
import { Tooltip } from "../primitives/tooltip";
import { EmptyState } from "./empty-state";
import { WidgetSkeleton } from "./skeletons";
import { StatusPill } from "./status";

export interface WidgetShellProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Explanation shown in an info tooltip next to the title. */
  info?: ReactNode;
  /** Header controls (segmented, menus, links). */
  actions?: ReactNode;
  status?: DataStatus;
  asOf?: string | null;
  loading?: boolean;
  error?: string | null;
  /** When set, renders an empty state instead of children. */
  empty?: { title: string; description?: ReactNode; action?: ReactNode } | null;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Remove body padding (tables, edge-to-edge charts). */
  flush?: boolean;
  id?: string;
}

/**
 * The frame every dashboard widget sits in: header (drag handle in edit mode,
 * title, info, status, as-of, actions), a scrollable body with built-in
 * loading / error / empty states, and an optional footer.
 */
export function WidgetShell({ title, subtitle, info, actions, status, asOf, loading, error, empty, footer, children, className, bodyClassName, flush, id }: WidgetShellProps) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section aria-labelledby={headingId} className={cn("flex h-full min-h-0 flex-col overflow-hidden rounded-[10px] border border-line bg-surface shadow-raised", className)}>
      <header className="flex min-h-10 items-center gap-2 border-b border-line px-[var(--widget-pad)] py-2">
        <span className="tk-drag-handle -ml-1.5 hidden cursor-grab items-center text-muted active:cursor-grabbing" aria-hidden>
          <GripVertical className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 id={headingId} className="truncate text-[13px] font-semibold tracking-tight text-ink">
              {title}
            </h2>
            {info && (
              <Tooltip content={info}>
                <button type="button" className="rounded text-muted hover:text-ink" aria-label="About this widget">
                  <Info className="size-3.5" />
                </button>
              </Tooltip>
            )}
            {status && <StatusPill status={status} compact className="ml-0.5" />}
          </div>
          {subtitle && <p className="truncate text-2xs text-muted">{subtitle}</p>}
        </div>
        {asOf && <span className="hidden whitespace-nowrap text-2xs tabular-nums text-muted sm:inline">as of {asOf}</span>}
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-auto", !flush && "p-[var(--widget-pad)]", bodyClassName)}>
        {loading ? (
          <WidgetSkeleton />
        ) : error ? (
          <EmptyState icon={<AlertTriangle className="size-5 text-serious" />} title="Couldn't load this widget" description={error} />
        ) : empty ? (
          <EmptyState title={empty.title} description={empty.description} action={empty.action} />
        ) : (
          children
        )}
      </div>
      {footer && <footer className="border-t border-line px-[var(--widget-pad)] py-2 text-2xs text-muted">{footer}</footer>}
    </section>
  );
}
