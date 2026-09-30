"use client";
import { Dialog, DialogContent, DialogTitle } from "../primitives/dialog";
import { Logo } from "./logo";
import type { NavDashboard } from "./nav-data";
import { SidebarNav } from "./shell-islands";

/** Navigation drawer for small screens. Loaded by MobileNav on first open. */
export default function MobileDrawer({ open, setOpen, dashboards }: { open: boolean; setOpen: (o: boolean) => void; dashboards: NavDashboard[] }) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent side="left" className="flex flex-col p-0" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Navigation</DialogTitle>
        <div className="flex h-12 items-center border-b border-line px-4">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <SidebarNav dashboards={dashboards} collapsible={false} onNavigate={() => setOpen(false)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
