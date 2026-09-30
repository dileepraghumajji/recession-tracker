"use client";
/**
 * Client islands of the server-rendered AppShell. Each is small; anything heavy
 * (drawer dialog, command menu, display menu) loads on demand.
 */
import { ChevronsLeft, Home, Menu as MenuIcon, Palette, Search, SlidersHorizontal } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../cn";
import { Badge } from "../primitives/badge";
import { Button } from "../primitives/button";
import { SIDEBAR_KEY } from "../preferences";
import { COMMAND_EVENT, openCommandMenu } from "./events";
import { DASHBOARD_ICONS } from "./icons";
import type { NavDashboard } from "./nav-data";

const CommandMenu = dynamic(() => import("./command-menu"), { ssr: false });
const MobileDrawer = dynamic(() => import("./mobile-drawer"), { ssr: false });
const PrefsMenu = dynamic(() => import("./prefs-menu").then((m) => m.PrefsMenu), {
  ssr: false,
  loading: () => (
    <Button variant="ghost" size="icon" aria-label="Display settings" disabled>
      <SlidersHorizontal />
    </Button>
  ),
});
const ThemeButton = dynamic(() => import("./prefs-menu").then((m) => m.ThemeButton), { ssr: false, loading: () => <span className="size-[var(--control-h)]" /> });

export const SYSTEM_LINKS = [{ href: "/design-system", label: "Design system", group: "System" }];

function isActive(path: string, href: string, exact: boolean) {
  return exact ? path === href : path === href || path.startsWith(href + "/");
}

/** Sidebar/drawer navigation. In the collapsed sidebar only icons show (labels stay for screen readers via aria-label). */
export function SidebarNav({ dashboards, onNavigate, collapsible = true }: { dashboards: NavDashboard[]; onNavigate?: () => void; collapsible?: boolean }) {
  const path = usePathname();
  const hide = collapsible ? "sidebar-collapsed:hidden" : "";
  const link = (href: string, exact: boolean) =>
    cn(
      "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors duration-[var(--dur-fast)] [&_svg]:size-4 [&_svg]:shrink-0",
      isActive(path, href, exact) ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2/60 hover:text-ink",
      collapsible && "sidebar-collapsed:justify-center sidebar-collapsed:px-0",
    );
  const item = (href: string, label: string, icon: ReactNode, exact: boolean, extra?: ReactNode) => (
    <Link href={href} className={link(href, exact)} aria-current={isActive(path, href, exact) ? "page" : undefined} aria-label={label} title={label} onClick={onNavigate}>
      {icon}
      <span className={cn("truncate", hide)}>{label}</span>
      {extra && <span className={cn("ml-auto", hide)}>{extra}</span>}
    </Link>
  );
  const heading = (t: string) => <div className={cn("px-2 pb-1 text-2xs font-medium uppercase tracking-[0.08em] text-muted", hide)}>{t}</div>;
  return (
    <nav aria-label="Main" className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">{item("/", "Overview", <Home />, true)}</div>
      <div className="flex flex-col gap-0.5">
        {heading("Dashboards")}
        {dashboards.map((d) => {
          const Icon = DASHBOARD_ICONS[d.icon];
          const open = isActive(path, d.basePath, false);
          return (
            <div key={d.id} className="flex flex-col gap-0.5">
              {item(d.basePath, d.shortName, <Icon />, false, d.status === "beta" ? <Badge tone="outline">beta</Badge> : undefined)}
              {open && (
                <div className={cn("ml-[18px] flex flex-col gap-0.5 border-l border-line pl-2", hide)}>
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
        {heading("System")}
        {item("/design-system", "Design system", <Palette />, false)}
      </div>
    </nav>
  );
}

export function Breadcrumbs({ dashboards }: { dashboards: NavDashboard[] }) {
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

/** Collapses/expands the desktop sidebar (state is an attribute on <html>, applied before paint). */
export function SidebarToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const collapsed = root.dataset.sidebar !== "collapsed";
    if (collapsed) root.dataset.sidebar = "collapsed";
    else delete root.dataset.sidebar;
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  };
  return (
    <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="Collapse or expand sidebar" title="Collapse or expand sidebar">
      <ChevronsLeft className="transition-transform sidebar-collapsed:rotate-180" />
    </Button>
  );
}

/** Mobile navigation button; the drawer (Radix dialog) loads on first open. */
export function MobileNav({ dashboards }: { dashboards: NavDashboard[] }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
        aria-label="Open navigation"
      >
        <MenuIcon />
      </Button>
      {loaded && <MobileDrawer open={open} setOpen={setOpen} dashboards={dashboards} />}
    </>
  );
}

/** ⌘K / Ctrl+K and "/" open the command menu, which is loaded on first use. */
export function CommandHost({ dashboards }: { dashboards: NavDashboard[] }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setLoaded(true);
        setOpen((o) => !o);
      }
    };
    const onOpen = () => {
      setLoaded(true);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(COMMAND_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(COMMAND_EVENT, onOpen);
    };
  }, []);
  return loaded ? <CommandMenu open={open} setOpen={setOpen} dashboards={dashboards} extra={[...SYSTEM_LINKS, { href: "/", label: "Overview", group: "Product" }]} /> : null;
}

/** A button that opens the command menu (search field on desktop, icon on mobile). */
export function CommandButton({ className, children, label = "Open command menu" }: { className?: string; children: ReactNode; label?: string }) {
  return (
    <button type="button" onClick={() => openCommandMenu()} className={className} aria-label={label}>
      {children}
    </button>
  );
}

export function SearchIconButton() {
  return (
    <Button variant="ghost" size="icon" className="md:hidden" onClick={() => openCommandMenu()} aria-label="Open command menu">
      <Search />
    </Button>
  );
}

export { PrefsMenu, ThemeButton };
