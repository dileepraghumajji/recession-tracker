/**
 * The contract every dashboard implements. A dashboard is a self-contained
 * module under src/dashboards/<id>/ that exports one `DashboardManifest`;
 * registering it in src/dashboards/registry.ts adds it to the product
 * navigation, the home page and the scheduled refresh.
 */

export interface DashboardNavItem {
  /** Path relative to the dashboard's basePath ("" is the dashboard overview). */
  path: string;
  label: string;
}

/** Headline shown on the product home page card. Must come from cached data only. */
export interface DashboardSummary {
  value: string;
  label: string;
  detail?: string;
  asOf?: string | null;
  tone?: "good" | "neutral" | "warning" | "bad";
}

/** Cheap server-side check polled by open pages (GET /api/live/<id>). */
export interface LiveStatus {
  /** Changes whenever the dashboard's stored data changes; pages refresh when it does. */
  version: string;
  /** When the data behind the current version was last fetched/ingested (ISO), if known. */
  updatedAt: string | null;
  /** Optional one-line data-source note for the status indicator (e.g. a provider warning). */
  note?: string | null;
}

export interface RefreshOutcome {
  ok: number;
  failed: number;
  skipped: number;
  detail?: unknown;
}

export interface DashboardManifest {
  /** URL-safe id; also the folder name under src/dashboards and src/app/dashboards. */
  id: string;
  /** Full product name of the dashboard. */
  name: string;
  /** Short label for the product navigation. */
  shortName: string;
  /** One line for the home page card. */
  tagline: string;
  description: string;
  /** Page prefix, e.g. /dashboards/recession. */
  basePath: string;
  /** API prefix, e.g. /api/recession. */
  apiBase: string;
  region: string;
  status: "live" | "beta";
  /** Sidebar icon (see ICONS in src/platform/ui/shell/nav-data.ts). */
  icon?: "activity" | "gauge" | "candlestick" | "globe" | "landmark" | "line-chart";
  nav: DashboardNavItem[];
  /** Footer disclaimer shown on every page of the dashboard. */
  disclaimer: string;
  /** Scheduled refresh (server only). Called by /api/cron/refresh and `npm run refresh`. */
  refresh?: () => Promise<RefreshOutcome>;
  /**
   * Live updates: open pages poll `status()` every `pollSeconds` (paused while the
   * tab is hidden) and re-render when the version changes. `status` must be cheap
   * (no full data load) and may kick off a background refresh when data is stale.
   */
  live?: { pollSeconds: number; status: () => Promise<LiveStatus> };
  /** Home-page headline (server only). Should resolve quickly; the home page times it out. */
  summary?: () => Promise<DashboardSummary | null>;
}

export function navHref(d: Pick<DashboardManifest, "basePath">, path: string): string {
  return path ? `${d.basePath}/${path.replace(/^\//, "")}` : d.basePath;
}

/** Resolves to null if `p` does not settle within `ms` (the work itself keeps running). */
export async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((r) => {
    timer = setTimeout(() => r(null), ms);
  });
  try {
    return await Promise.race([p.catch(() => null), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
