import type { ReactNode } from "react";
import { navHref, type DashboardManifest } from "@/platform/dashboards";
import { SubNav } from "./sub-nav";

/**
 * Frame for every page of a dashboard inside the AppShell: page tabs where the
 * sidebar is hidden (below lg), the page, and the dashboard's disclaimer.
 * Used from src/app/(system)/dashboards/<id>/layout.tsx.
 */
export function DashboardFrame({ dashboard, children, toolbar }: { dashboard: DashboardManifest; children: ReactNode; toolbar?: ReactNode }) {
  const links = dashboard.nav.map((n) => ({ href: navHref(dashboard, n.path), label: n.label, exact: n.path === "" }));
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col">
      <SubNav links={links} label={`${dashboard.shortName} pages`} className="mb-4 lg:hidden" />
      {toolbar}
      {children}
      <footer className="mt-8 border-t border-line pt-4 text-xs leading-relaxed text-muted">{dashboard.disclaimer}</footer>
    </div>
  );
}
