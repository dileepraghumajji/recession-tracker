import type { ReactNode } from "react";
import { navHref, type DashboardManifest } from "@/platform/dashboards";
import { NavLinks } from "./NavLinks";

/**
 * Consistent frame for every dashboard page: dashboard title bar with its own
 * sub-navigation, the page content, and the dashboard's disclaimer.
 * Used from src/app/dashboards/<id>/layout.tsx.
 */
export function DashboardShell({ dashboard, children }: { dashboard: DashboardManifest; children: ReactNode }) {
  const links = dashboard.nav.map((n) => ({ href: navHref(dashboard, n.path), label: n.label, exact: n.path === "" }));
  return (
    <>
      <div className="border-b border-line">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-2">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-xs font-bold tracking-[0.14em]">{dashboard.name.toUpperCase()}</span>
            {dashboard.status === "beta" && <span className="rounded border border-line px-1.5 text-[10px] uppercase tracking-wide text-muted">beta</span>}
          </div>
          <NavLinks links={links} label={`${dashboard.shortName} sections`} size="xs" />
        </div>
      </div>
      <main className="mx-auto max-w-[1400px] px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-[1400px] px-4 pb-4 pt-4 text-xs leading-relaxed text-muted">{dashboard.disclaimer}</footer>
    </>
  );
}
