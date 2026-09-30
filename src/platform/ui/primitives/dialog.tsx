"use client";
import { X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import * as React from "react";
import { cn } from "../cn";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogTitle = D.Title;
export const DialogDescription = D.Description;

export function DialogContent({ className, children, hideClose, side, ...props }: React.ComponentProps<typeof D.Content> & { hideClose?: boolean; side?: "left" }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" style={{ background: "rgb(0 0 0 / 0.5)" }} />
      <D.Content
        className={cn(
          "fixed z-50 border border-line bg-surface shadow-pop focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0",
          side === "left"
            ? "inset-y-0 left-0 w-72 data-[state=open]:slide-in-from-left"
            : "left-1/2 top-[12vh] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <D.Close className="absolute right-3 top-3 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        )}
      </D.Content>
    </D.Portal>
  );
}
