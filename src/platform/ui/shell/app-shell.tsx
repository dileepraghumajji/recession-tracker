import { Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Kbd } from "../primitives/misc";
import { TooltipProvider } from "../primitives/tooltip";
import { Logo } from "./logo";
import type { NavDashboard } from "./nav-data";
import { Breadcrumbs, CommandButton, CommandHost, MobileNav, PrefsMenu, SearchIconButton, SidebarNav, SidebarToggle, ThemeButton } from "./shell-islands";

/**
 * Product shell, rendered on the server: collapsible sidebar (drawer on
 * mobile), top bar with breadcrumbs, ⌘K command menu and display preferences.
 * Interactive parts are small client islands (shell-islands.tsx); the sidebar's
 * collapsed state is `data-sidebar` on <html>, set before paint.
 */
export function AppShell({ dashboards, children, banner }: { dashboards: NavDashboard[]; children: ReactNode; banner?: ReactNode }) {
  return (
    <TooltipProvider>
      <div className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only z-50 rounded bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
          Skip to content
        </a>
        {banner}
        <div className="flex min-h-0 flex-1">
          <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-[var(--dur-base)] lg:flex sidebar-collapsed:w-14">
            <div className="flex h-12 items-center border-b border-line px-4 sidebar-collapsed:justify-center sidebar-collapsed:px-0">
              <Link href="/" aria-label="TerminalK home" className="inline-flex">
                <span className="sidebar-collapsed:hidden">
                  <Logo />
                </span>
                <span className="hidden sidebar-collapsed:inline-flex">
                  <Logo withWordmark={false} />
                </span>
              </Link>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-3">
              <SidebarNav dashboards={dashboards} />
            </div>
            <div className="flex items-center justify-between border-t border-line p-2 sidebar-collapsed:justify-center">
              <CommandButton label="Open command menu" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-2xs text-muted hover:text-ink sidebar-collapsed:hidden">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd> commands
              </CommandButton>
              <SidebarToggle />
            </div>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-line bg-page px-3 sm:px-4">
              <MobileNav dashboards={dashboards} />
              <span className="lg:hidden">
                <Logo withWordmark={false} size={20} />
              </span>
              <Breadcrumbs dashboards={dashboards} />
              <div className="ml-auto flex items-center gap-1">
                <CommandButton className="hidden h-8 w-64 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-xs text-muted transition-colors hover:border-line-strong md:flex">
                  <Search className="size-3.5" aria-hidden />
                  Search or jump to…
                  <span className="ml-auto flex gap-0.5">
                    <Kbd>⌘</Kbd>
                    <Kbd>K</Kbd>
                  </span>
                </CommandButton>
                <SearchIconButton />
                <PrefsMenu />
                <ThemeButton />
              </div>
            </header>
            <main id="main" className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-5">
              {children}
            </main>
          </div>
        </div>
        <CommandHost dashboards={dashboards} />
      </div>
    </TooltipProvider>
  );
}
