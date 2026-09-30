import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../cn";

export const badgeVariants = cva("inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-px text-2xs font-medium [&_svg]:size-3", {
  variants: {
    tone: {
      neutral: "bg-surface-2 text-ink-2 ring-1 ring-inset ring-line",
      accent: "bg-accent-subtle text-accent",
      up: "bg-up-subtle text-up-fg",
      down: "bg-down-subtle text-down-fg",
      good: "bg-up-subtle text-good-ink",
      warning: "bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-ink",
      critical: "bg-down-subtle text-down-fg",
      outline: "text-ink-2 ring-1 ring-inset ring-line-strong",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
