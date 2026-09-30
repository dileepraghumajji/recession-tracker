import type { DashboardManifest, RefreshOutcome } from "./dashboards";

/** Refreshes dashboards in parallel; one dashboard failing never blocks the others. */
export async function refreshDashboards(dashboards: DashboardManifest[]): Promise<Record<string, RefreshOutcome | { error: string }>> {
  const withHook = dashboards.filter((d) => d.refresh);
  const results = await Promise.allSettled(withHook.map((d) => d.refresh!()));
  return Object.fromEntries(
    withHook.map((d, i) => {
      const r = results[i];
      return [d.id, r.status === "fulfilled" ? r.value : { error: r.reason instanceof Error ? r.reason.message : String(r.reason) }];
    }),
  );
}
