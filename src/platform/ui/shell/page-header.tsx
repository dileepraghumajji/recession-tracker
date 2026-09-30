import type { ReactNode } from "react";

/** Page title row: title, description, meta (as-of, badges) and actions. */
export function PageHeader({ title, description, meta, actions, eyebrow }: { title: ReactNode; description?: ReactNode; meta?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-2xs font-medium uppercase tracking-[0.08em] text-accent">{eyebrow}</div>}
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-[13px] text-ink-2">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2 text-2xs text-muted">{meta}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
