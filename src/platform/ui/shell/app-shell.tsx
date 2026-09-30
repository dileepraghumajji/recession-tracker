"use client";
import { ChevronsLeft, ChevronsRight, Home, Menu as MenuIcon, Palette, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../cn";
import { Badge } from "../primitives/badge";
import { Button } from "../primitives/button";
import { Dialog, DialogContent, DialogTitle } from "../primitives/dialog";
import { Kbd } from "../primitives/misc";
import { Tooltip, TooltipProvider } from "../primitives/tooltip";
import dynamic from "next/dynamic";
import { COMMAND_EVENT, openCommandMenu } from "./events";
import { DASHBOARD_ICONS } from "./icons";
import { Logo } from "./logo";
import type { NavDashboard } from "./nav-data";
import { PrefsMenu, ThemeButton } from "./prefs-menu";

const COLLAPSE_KEY = "tk-sidebar-collapsed";
const CommandMenu = dynamic(() => import("./command-menu"), { ssr: false });

function isActive(path: string, href: string, exact: boolean) {
  return exact ? path === href : path === href || path.startsWith(href + "/");
}

function SidebarNav({ dashboards, collapsed, onNavigate }: { dashboards: NavDashboard[]; collapsed: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  const link = (href: string, exact: boolean) =>
    cn(
      "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors duration-[var(--dur-fast)] [&_svg]:size-4 [&_svg]:shrink-0",
      isActive(path, href, exact) ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2/60 hover:text-ink",
      collapsed && "justify-center px-0",
    );
  const item = (href: string, label: string, icon: ReactNode, exact: boolean, extra?: ReactNode) => {
    const el = (
      <Link href={href} className={link(href, exact)} aria-current={isActive(path, href, exact) ? "page" : undefined} onClick={onNavigate}>
        {icon}
        {!collapsed && <span className="truncate">{label}</span>}
        {!collapsed && extra}
      </Link>
    );
    return collapsed ? (
      <Tooltip content={label} side="right">
        {el}
      </Tooltip>
    ) : (
      el
    );
  };
  return (
    <nav aria-label="Main" className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">{item("/", "Overview", <Home />, true)}</div>
      <div className="flex flex-col gap-0.5">
        {!collapsed && <div className="px-2 pb-1 text-2xs font-medium uppercase tracking-[0.08em] text-muted">Dashboards</div>}
        {dashboards.map((d) => {
          const Icon = DASHBOARD_ICONS[d.icon];
          const open = isActive(path, d.basePath, false);
          return (
            <div key={d.id} className="flex flex-col gap-0.5">
              {item(d.basePath, d.shortName, <Icon />, false, d.status === "beta" ? <Badge tone="outline" className="ml-auto">beta</Badge> : undefined)}
              {open && !collapsed && (
                <div className="ml-[18px] flex flex-col gap-0.5 border-l border-line pl-2">
                  {d.pages.map((p) => (
                    <Link
                      key={p.href}
                      href={p.href}
                      onClick={onNavigate}
                      aria-current={isActive(path, p.href, p.exact) ? "page" : undefined}
                      className={cn("flex h-7 items-center rounded-md px-2 text-xs transition-colors", isActive(path, p.href, p.exact) ? "font-medium text-ink" : "text-muted hover:text-ink")}
                    >
                      {p.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-0.5">
        {!collapsed && <div className="px-2 pb-1 text-2xs font-medium uppercase tracking-[0.08em] text-muted">System</div>}
        {item("/design-system", "Design system", <Palette />, false)}
      </div>
    </nav>
  );
}

function Breadcrumbs({ dashboards }: { dashboards: NavDashboard[] }) {
  const path = usePathname();
  const d = dashboards.find((x) => isActive(path, x.basePath, false));
  const page = d?.pages.filter((p) => isActive(path, p.href, p.exact)).sort((a, b) => b.href.length - a.href.length)[0];
  const crumbs = d ? [d.name, page && !page.exact ? page.label : "Overview"] : path.startsWith("/design-system") ? ["Design system"] : ["Overview"];
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1.5 truncate text-[13px]">
        {crumbs.map((c, i) => (
          <li key={i} className={cn("truncate", i === crumbs.length - 1 ? "font-medium text-ink" : "text-muted")}>
            {i > 0 && <span className="mr-1.5 text-muted">/</span>}
            {c}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Product shell: collapsible sidebar (drawer on mobile), top bar with
 * breadcrumbs, ⌘K command menu and display preferences.
 */
export function AppShell({ dashboards, children, banner }: { dashboards: NavDashboard[]; children: ReactNode; banner?: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdLoaded, setCmdLoaded] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setCmdLoaded(true);
        setCmdOpen((o) => !o);
      }
    };
    const onOpen = () => {
      setCmdLoaded(true);
      setCmdOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(COMMAND_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(COMMAND_EVENT, onOpen);
    };
  }, []);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };
  return (
    <TooltipProvider>
      <div className="tk flex min-h-screen flex-col">
        <a href="#main" className="sr-only z-50 rounded bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
          Skip to content
        </a>
        {banner}
        <div className="flex min-h-0 flex-1">
          <aside className={cn("sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-[var(--dur-base)] lg:flex", collapsed ? "w-14" : "w-60")}>
            <div className={cn("flex h-12 items-center border-b border-line", collapsed ? "justify-center" : "px-4")}>
              <Link href="/" aria-label="TerminalK home">
                <Logo withWordmark={!collapsed} />
              </Link>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-3">
              <SidebarNav dashboards={dashboards} collapsed={collapsed} />
            </div>
            <div className={cn("flex items-center border-t border-line p-2", collapsed ? "justify-center" : "justify-between")}>
              {!collapsed && (
                <button type="button" onClick={() => openCommandMenu()} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-2xs text-muted hover:text-ink">
                  <Kbd>⌘</Kbd>
                  <Kbd>K</Kbd> commands
                </button>
              )}
              <Tooltip content={collapsed ? "Expand sidebar" : "Collapse sidebar"} side="right">
                <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}>
                  {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
                </Button>
              </Tooltip>
            </div>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-line bg-page px-3 sm:px-4">
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawer(true)} aria-label="Open navigation">
                <MenuIcon />
              </Button>
              <span className="lg:hidden">
                <Logo withWordmark={false} size={20} />
              </span>
              <Breadcrumbs dashboards={dashboards} />
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => openCommandMenu()}
                  className="hidden h-8 w-64 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-xs text-muted transition-colors hover:border-line-strong md:flex"
                  aria-label="Open command menu"
                >
                  <Search className="size-3.5" />
                  Search or jump to…
                  <span className="ml-auto flex gap-0.5">
                    <Kbd>⌘</Kbd>
                    <Kbd>K</Kbd>
                  </span>
                </button>
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => openCommandMenu()} aria-label="Open command menu">
                  <Search />
                </Button>
                <PrefsMenu />
                <ThemeButton />
              </div>
            </header>
            <main id="main" className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-5">
              {children}
            </main>
          </div>
        </div>
        <Dialog open={drawer} onOpenChange={setDrawer}>
          <DialogContent side="left" className="flex flex-col p-0" aria-describedby={undefined}>
            <DialogTitle className="sr-only">Navigation</DialogTitle>
            <div className="flex h-12 items-center border-b border-line px-4">
              <Logo />
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-3">
              <SidebarNav dashboards={dashboards} collapsed={false} onNavigate={() => setDrawer(false)} />
            </div>
          </DialogContent>
        </Dialog>
        {cmdLoaded && (
          <CommandMenu open={cmdOpen} setOpen={setCmdOpen} dashboards={dashboards} extra={[{ href: "/design-system", label: "Design system", group: "System" }, { href: "/", label: "Overview", group: "Product" }]} />
        )}
      </div>
    </TooltipProvider>
  );
}
