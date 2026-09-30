import { Separator as SeparatorPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "../cn";

/** Shared look of text inputs and native selects (sized by the caller). */
export const fieldClass =
  "h-[var(--control-h)] min-w-0 rounded-md border border-line-strong bg-surface px-2.5 text-[13px] text-ink placeholder:text-muted focus-visible:border-accent focus-visible:outline-none";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, "w-full", className)} {...props} />;
}

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface-2 px-1 font-mono text-2xs text-muted", className)} {...props} />;
}

export function Separator({ className, orientation = "horizontal", ...props }: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return <SeparatorPrimitive.Root orientation={orientation} className={cn("shrink-0 bg-line", orientation === "horizontal" ? "h-px w-full" : "h-full w-px", className)} {...props} />;
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("tk-shimmer rounded", className)} {...props} />;
}

/** Visually hidden text for screen readers. */
export function SrOnly({ children }: { children: React.ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
