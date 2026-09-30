"use client";
import { Check, ChevronDown } from "lucide-react";
import { Select as S } from "radix-ui";
import { cn } from "../cn";

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  group?: string;
}

/** Accessible select (typeahead, arrow keys). Options can be grouped. */
export function Select({ value, onChange, options, label, className, placeholder }: { value: string; onChange: (v: string) => void; options: SelectOption[]; label: string; className?: string; placeholder?: string }) {
  const groups = [...new Set(options.map((o) => o.group ?? ""))];
  return (
    <S.Root value={value} onValueChange={onChange}>
      <S.Trigger aria-label={label} className={cn("inline-flex h-[var(--control-h)] min-w-32 items-center justify-between gap-2 rounded-md border border-line-strong bg-surface px-2.5 text-[13px] text-ink hover:bg-surface-2", className)}>
        <S.Value placeholder={placeholder} />
        <S.Icon>
          <ChevronDown className="size-3.5 text-muted" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={4} className="tk z-50 max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-line bg-surface shadow-pop animate-in fade-in-0 zoom-in-95">
          <S.Viewport className="p-1">
            {groups.map((g) => (
              <S.Group key={g}>
                {g && <S.Label className="px-2 pb-1 pt-2 text-2xs font-medium uppercase tracking-wide text-muted">{g}</S.Label>}
                {options
                  .filter((o) => (o.group ?? "") === g)
                  .map((o) => (
                    <S.Item key={o.value} value={o.value} className="relative flex h-8 cursor-default select-none items-center rounded-md pl-7 pr-2 text-[13px] text-ink outline-none data-[highlighted]:bg-surface-2">
                      <S.ItemIndicator className="absolute left-2">
                        <Check className="size-3.5 text-accent" />
                      </S.ItemIndicator>
                      <S.ItemText>{o.label}</S.ItemText>
                    </S.Item>
                  ))}
              </S.Group>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
