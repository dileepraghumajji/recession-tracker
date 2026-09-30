import { NextResponse } from "next/server";
import { z } from "zod";
import { SERIES_BY_KEY } from "@/dashboards/recession/lib/series-catalog";
import { getStore } from "@/dashboards/recession/lib/data/store";
import { checkAdmin, errorResponse } from "@/dashboards/recession/lib/api-utils";
import { sortAndClean } from "@/dashboards/recession/lib/timeseries";

export const dynamic = "force-dynamic";

const Body = z.object({
  seriesKey: z.string(),
  observations: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), value: z.number().finite() })).min(1).max(5000),
  sourceNote: z.string().max(200).optional(),
});

/**
 * Load licensed proprietary data (e.g. ISM) that cannot be fetched from a free
 * API. Requires ADMIN_TOKEN. Only series declared with provider "manual" are accepted.
 */
export async function POST(req: Request) {
  const denied = checkAdmin(req, true);
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  const def = SERIES_BY_KEY[parsed.data.seriesKey];
  if (!def || def.provider !== "manual") return NextResponse.json({ error: "seriesKey must be a manual series (e.g. ISM_MFG_PMI)" }, { status: 400 });
  try {
    const obs = sortAndClean(parsed.data.observations);
    const now = new Date().toISOString();
    await getStore().saveSeries(
      { key: def.key, provider: "manual", sourceId: def.key, fetchedAt: now, sourceLastUpdated: now, fetchStatus: "ok", fetchError: null, synthetic: false },
      obs,
    );
    return NextResponse.json({ ok: true, count: obs.length, first: obs[0].date, last: obs[obs.length - 1].date });
  } catch (e) {
    return errorResponse(e);
  }
}
