import { NextResponse } from "next/server";
import { environmentStatus } from "@/dashboards/india-sentiment/lib/data/service";
import { getStore } from "@/dashboards/india-sentiment/lib/data/store";
import { SERIES } from "@/dashboards/india-sentiment/lib/series";
import { errorResponse } from "@/platform/api-utils";

export const dynamic = "force-dynamic";

/** Configuration (booleans only, never secret values) and per-series status. */
export async function GET() {
  try {
    const store = getStore();
    const all = await store.loadAll();
    return NextResponse.json({
      env: environmentStatus(),
      store: store.kind,
      series: SERIES.map((d) => {
        const s = all[d.key];
        return { key: d.key, kind: d.kind, source: d.source, origin: s?.meta.origin ?? null, fetchStatus: s?.meta.fetchStatus ?? "never", fetchError: s?.meta.fetchError ?? null, fetchedAt: s?.meta.fetchedAt ?? null, lastObservation: s?.obs.at(-1)?.date ?? null, count: s?.obs.length ?? 0 };
      }),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
