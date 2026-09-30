/**
 * Runs the India market-breadth job to completion (no time limit), e.g. once to
 * reconstruct the history, or daily from system cron on self-hosted deployments:
 *   40 23 * * *  cd /app && npm run breadth
 * Needs DHAN_ACCESS_TOKEN and, to keep the result, DATABASE_URL.
 */
import { runBreadthJob } from "../src/dashboards/india-sentiment/lib/data/breadth/job";
import { afterExternalWrite } from "../src/dashboards/india-sentiment/lib/data/service";

runBreadthJob()
  .then(async (r) => {
    console.log(`[breadth] ${r.status}: ${r.message}`);
    if (r.status === "published") await afterExternalWrite();
    process.exit(r.status === "error" ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
