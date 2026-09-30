import { NextResponse } from "next/server";
import { environmentStatus } from "@/dashboards/recession/lib/data/service";
import { getStore } from "@/dashboards/recession/lib/data/store";
import { SERIES } from "@/dashboards/recession/lib/series-catalog";
import { errorResponse } from "@/platform/api-utils";

export const dynamic = "force-dynamic";

/** Configuration (booleans only - never secret values) and per-series fetch status. */
export async function GET() {
  try {
    const store = getStore();
    const all = await store.loadAll();
    return NextResponse.json({
      env: environmentStatus(),
      store: store.kind,
      series: SERIES.map((d) => {
        const s = all[d.key];
        return {
          key: d.key,
          provider: d.provider,
          sourceId: d.sourceId,
          source: d.source,
          fetchStatus: s?.meta.fetchStatus ?? "never",
          fetchError: s?.meta.fetchError ?? null,
          fetchedAt: s?.meta.fetchedAt ?? null,
          sourceLastUpdated: s?.meta.sourceLastUpdated ?? null,
          lastObservation: s?.obs.length ? s.obs[s.obs.length - 1].date : null,
          count: s?.obs.length ?? 0,
        };
      }),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
