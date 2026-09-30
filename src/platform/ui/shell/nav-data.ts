import type { DashboardManifest } from "@/platform/dashboards";
import { navHref } from "@/platform/dashboards";

/** Serializable navigation model passed from server layouts to the client shell. */
export interface NavDashboard {
  id: string;
  name: string;
  shortName: string;
  basePath: string;
  status: "live" | "beta";
  icon: NonNullable<DashboardManifest["icon"]> | "layers";
  pages: { href: string; label: string; exact: boolean }[];
  /** Seconds between live-status checks while a page of this dashboard is open (absent = no polling). */
  pollSeconds?: number;
}

export function toNav(dashboards: DashboardManifest[]): NavDashboard[] {
  return dashboards.map((d) => ({
    id: d.id,
    name: d.name,
    shortName: d.shortName,
    basePath: d.basePath,
    status: d.status,
    icon: d.icon ?? "layers",
    pages: d.nav.map((n) => ({ href: navHref(d, n.path), label: n.label, exact: n.path === "" })),
    pollSeconds: d.live?.pollSeconds,
  }));
}
