"use client";
import { RotateCcw, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../cn";
import { Button } from "../primitives/button";
import { Segmented } from "../primitives/segmented";

/** One row of filters above the content it controls; active filters shown as removable chips. */
export function FilterBar({ children, chips = [], onReset, right, className }: { children: ReactNode; chips?: { key: string; label: ReactNode; onRemove?: () => void }[]; onReset?: () => void; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2", className)} role="toolbar" aria-label="Filters">
      {children}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {chips.map((c) => (
            <span key={c.key} className="inline-flex h-6 items-center gap-1 rounded-full bg-accent-subtle pl-2 pr-1 text-2xs text-accent">
              {c.label}
              {c.onRemove && (
                <button type="button" onClick={c.onRemove} className="rounded-full p-0.5 hover:bg-accent-subtle" aria-label="Remove filter">
                  <X className="size-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        {right}
        {onReset && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            <RotateCcw /> Reset
          </Button>
        )}
      </div>
    </div>
  );
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-2xs font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
    </div>
  );
}

export const TIME_RANGES = ["1D", "1W", "1M", "3M", "6M", "1Y", "3Y", "5Y", "10Y", "MAX"] as const;
export type TimeRange = (typeof TIME_RANGES)[number];

/** Preset time ranges as a segmented control (arrow keys to move). */
export function TimeRangeSelector<T extends string = TimeRange>({ value, onChange, ranges = TIME_RANGES as unknown as readonly T[], size = "sm" }: { value: T; onChange: (v: T) => void; ranges?: readonly T[]; size?: "sm" | "md" }) {
  return <Segmented value={value} onChange={onChange} options={ranges} label="Time range" size={size} />;
}
