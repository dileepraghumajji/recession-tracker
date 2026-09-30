"use client";
import { Switch as S } from "radix-ui";
import { cn } from "../cn";

export function Switch({ checked, onCheckedChange, label, className }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; className?: string }) {
  return (
    <S.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-line-strong bg-surface-3 transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent", className)}
    >
      <S.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-ink transition-transform duration-[var(--dur-fast)] data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-accent-fg" />
    </S.Root>
  );
}
