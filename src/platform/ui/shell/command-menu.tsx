"use client";
import { Command } from "cmdk";
import { ArrowRight, Columns3, LayoutGrid, Moon, Palette, Rows3, RotateCcw, Search, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";

import { Dialog, DialogContent, DialogTitle } from "../primitives/dialog";
import { Kbd } from "../primitives/misc";
import { setPreference } from "../preferences";
import { LAYOUT_EVENT } from "./events";
import { DASHBOARD_ICONS } from "./icons";
import type { NavDashboard } from "./nav-data";

/**
 * ⌘K / Ctrl+K palette: jump to any dashboard page or run an action.
 * Loaded lazily by the AppShell on first use (cmdk is not in the initial bundle).
 */
export default function CommandMenu({ open, setOpen, dashboards, extra = [] }: { open: boolean; setOpen: (o: boolean) => void; dashboards: NavDashboard[]; extra?: { href: string; label: string; group: string }[] }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };
  const item = "flex h-9 cursor-default items-center gap-2.5 rounded-md px-2.5 text-[13px] text-ink data-[selected=true]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted";
  const group = "px-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent hideClose className="overflow-hidden p-0" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Command menu</DialogTitle>
        <Command loop label="Command menu">
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search className="size-4 text-muted" aria-hidden />
            <Command.Input autoFocus placeholder="Search dashboards, pages and actions…" className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted" />
            <Kbd>esc</Kbd>
          </div>
          <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto pb-2">
            <Command.Empty className="py-8 text-center text-sm text-muted">No results.</Command.Empty>
            {dashboards.map((d) => {
              const Icon = DASHBOARD_ICONS[d.icon];
              return (
                <Command.Group key={d.id} heading={d.name} className={group}>
                  {d.pages.map((p) => (
                    <Command.Item key={p.href} value={`${d.shortName} ${p.label} ${d.name}`} onSelect={() => run(() => router.push(p.href))} className={item}>
                      <Icon />
                      <span>{p.label}</span>
                      <span className="ml-auto text-2xs text-muted">{d.shortName}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              );
            })}
            {extra.length > 0 && (
              <Command.Group heading="Product" className={group}>
                {extra.map((e) => (
                  <Command.Item key={e.href} value={`${e.group} ${e.label}`} onSelect={() => run(() => router.push(e.href))} className={item}>
                    <ArrowRight />
                    {e.label}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            <Command.Group heading="Actions" className={group}>
              <Command.Item value="toggle theme dark light" onSelect={() => run(() => setTheme(resolvedTheme === "light" ? "dark" : "light"))} className={item}>
                {resolvedTheme === "light" ? <Moon /> : <Sun />} Switch to {resolvedTheme === "light" ? "dark" : "light"} theme
              </Command.Item>
              {(["compact", "comfortable", "spacious"] as const).map((d) => (
                <Command.Item key={d} value={`density ${d}`} onSelect={() => run(() => setPreference("density", d))} className={item}>
                  {d === "compact" ? <Rows3 /> : <Columns3 />} Density: {d}
                </Command.Item>
              ))}
              <Command.Item value="market colours teal red" onSelect={() => run(() => setPreference("market", "teal-red"))} className={item}>
                <Palette /> Market colours: teal / red
              </Command.Item>
              <Command.Item value="market colours blue orange colour blind" onSelect={() => run(() => setPreference("market", "blue-orange"))} className={item}>
                <Palette /> Market colours: blue / orange (colour-blind friendly)
              </Command.Item>
              <Command.Item value="customize layout edit widgets" onSelect={() => run(() => window.dispatchEvent(new CustomEvent(LAYOUT_EVENT, { detail: "toggle-edit" })))} className={item}>
                <LayoutGrid /> Customize layout
              </Command.Item>
              <Command.Item value="reset layout" onSelect={() => run(() => window.dispatchEvent(new CustomEvent(LAYOUT_EVENT, { detail: "reset" })))} className={item}>
                <RotateCcw /> Reset layout
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
