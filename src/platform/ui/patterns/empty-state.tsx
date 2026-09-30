import { Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../cn";

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-full min-h-32 flex-col items-center justify-center gap-2 px-6 py-8 text-center", className)}>
      <div className="flex size-9 items-center justify-center rounded-full border border-line bg-surface-2 text-muted">{icon ?? <Inbox className="size-4" />}</div>
      <p className="text-[13px] font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
