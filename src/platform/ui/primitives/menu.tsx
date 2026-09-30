"use client";
import { DropdownMenu as M } from "radix-ui";
import * as React from "react";
import { cn } from "../cn";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ className, align = "end", ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={6} className={cn("tk z-50 min-w-44 rounded-lg border border-line bg-surface p-1 shadow-pop animate-in fade-in-0 zoom-in-95", className)} {...props} />
    </M.Portal>
  );
}

export function MenuItem({ className, ...props }: React.ComponentProps<typeof M.Item>) {
  return <M.Item className={cn("flex h-8 cursor-default select-none items-center gap-2 rounded-md px-2 text-[13px] text-ink outline-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-50 [&_svg]:size-3.5 [&_svg]:text-muted", className)} {...props} />;
}

export function MenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2 pb-1 pt-1.5 text-2xs font-medium uppercase tracking-wide text-muted", className)} {...props} />;
}

export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-line" />;
}

export const MenuRadioGroup = M.RadioGroup;
export function MenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof M.RadioItem>) {
  return (
    <M.RadioItem className={cn("relative flex h-8 cursor-default select-none items-center rounded-md pl-7 pr-2 text-[13px] text-ink outline-none data-[highlighted]:bg-surface-2", className)} {...props}>
      <M.ItemIndicator className="absolute left-2.5 size-1.5 rounded-full bg-accent" />
      {children}
    </M.RadioItem>
  );
}
