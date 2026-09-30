import { AlertTriangle, CircleDashed, CircleDot, Clock } from "lucide-react";
import type { DataStatus } from "@/platform/lib/types";
import { cn } from "../cn";

const META: Record<DataStatus, { label: string; cls: string; Icon: typeof CircleDot }> = {
  LIVE: { label: "Live", cls: "text-good-ink", Icon: CircleDot },
  RECENT: { label: "Recent", cls: "text-ink-2", Icon: Clock },
  STALE: { label: "Stale", cls: "text-serious", Icon: AlertTriangle },
  UNAVAILABLE: { label: "Unavailable", cls: "text-muted", Icon: CircleDashed },
};

/** Data-quality status: icon + label, never colour alone. */
export function StatusPill({ status, className, compact }: { status: DataStatus; className?: string; compact?: boolean }) {
  const m = META[status];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap text-2xs font-medium", m.cls, className)} title={m.label}>
      <m.Icon className="size-3" aria-hidden />
      {compact ? <span className="sr-only">{m.label}</span> : m.label}
    </span>
  );
}
