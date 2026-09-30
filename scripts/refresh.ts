/**
 * Fetches all series, stores them, recomputes the snapshot and evaluates alerts.
 * For self-hosted deployments run it from system cron, e.g.
 *   30 22 * * *  cd /app && npm run refresh
 * (Vercel deployments use vercel.json -> /api/cron/refresh instead.)
 */
import { refreshAll } from "../src/dashboards/recession/lib/data/service";

refreshAll()
  .then((r) => {
    console.log(`mode=${r.mode} ok=${r.ok.length} failed=${r.failed.length} skipped=${r.skipped.length}`);
    for (const f of r.failed) console.log(`  FAILED ${f.key}: ${f.error}`);
    for (const s of r.skipped) console.log(`  skipped ${s.key}: ${s.reason}`);
    process.exit(r.ok.length === 0 && r.failed.length > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
