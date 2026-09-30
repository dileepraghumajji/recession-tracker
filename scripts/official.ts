/**
 * Imports the official Indian series that have an automated source (today the
 * RBI repo rate via the BIS policy-rate API), e.g. once after deploying or
 * daily from system cron on self-hosted deployments:
 *   20 3 * * *  cd /app && npm run official
 * Needs DATABASE_URL to keep the result.
 */
import { runOfficialImports } from "../src/dashboards/india-sentiment/lib/data/official";
import { afterExternalWrite } from "../src/dashboards/india-sentiment/lib/data/service";

runOfficialImports()
  .then(async (r) => {
    console.log(`[official] ${r.status}: ${r.message}`);
    if (r.results.some((x) => x.status === "updated")) await afterExternalWrite();
    process.exit(r.status === "error" ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
