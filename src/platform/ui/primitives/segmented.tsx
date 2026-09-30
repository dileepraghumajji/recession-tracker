"use client";
import { ToggleGroup } from "radix-ui";
import { cn } from "../cn";

/**
 * Single-select segmented control (arrow keys move between options).
 * Used for time ranges, views and modes.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly (T | { value: T; label: React.ReactNode; title?: string })[];
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className={cn("inline-flex items-center gap-0.5 rounded-md border border-line bg-surface-2 p-0.5", className)}
    >
      {options.map((o) => {
        const opt = typeof o === "string" ? { value: o, label: o } : o;
        return (
          <ToggleGroup.Item
            key={opt.value}
            value={opt.value}
            title={"title" in opt ? opt.title : undefined}
            className={cn(
              "rounded-[5px] font-medium text-ink-2 tabular-nums transition-colors duration-[var(--dur-fast)] hover:text-ink data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-raised",
              size === "sm" ? "h-6 px-2 text-2xs" : "h-[calc(var(--control-h)-6px)] px-2.5 text-xs",
            )}
          >
            {opt.label}
          </ToggleGroup.Item>
        );
      })}
    </ToggleGroup.Root>
  );
}
