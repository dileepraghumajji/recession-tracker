/**
 * Refreshes every registered dashboard (fetch, store, recompute, evaluate alerts).
 * For self-hosted deployments run it from system cron, e.g.
 *   30 22 * * *  cd /app && npm run refresh
 * Optional: `npm run refresh -- recession` refreshes only the named dashboards.
 * (Vercel deployments use vercel.json -> /api/cron/refresh instead.)
 */
import { DASHBOARDS } from "../src/dashboards/registry";
import { refreshDashboards } from "../src/platform/refresh";

const only = process.argv.slice(2);
const selected = only.length ? DASHBOARDS.filter((d) => only.includes(d.id)) : DASHBOARDS;

refreshDashboards(selected)
  .then((res) => {
    let anyOk = false;
    let anyFailed = false;
    for (const [id, r] of Object.entries(res)) {
      if ("error" in r) {
        anyFailed = true;
        console.log(`[${id}] FAILED: ${r.error}`);
        continue;
      }
      anyOk ||= r.ok > 0;
      anyFailed ||= r.failed > 0;
      console.log(`[${id}] ok=${r.ok} failed=${r.failed} skipped=${r.skipped}`);
      const d = r.detail as { failed?: { key: string; error: string }[]; skipped?: { key: string; reason: string }[] } | undefined;
      for (const f of d?.failed ?? []) console.log(`  FAILED ${f.key}: ${f.error}`);
      for (const s of d?.skipped ?? []) console.log(`  skipped ${s.key}: ${s.reason}`);
    }
    process.exit(!anyOk && anyFailed ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
