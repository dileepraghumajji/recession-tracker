import { NextResponse } from "next/server";
import { getSnapshot } from "@/dashboards/recession/lib/data/service";
import { errorResponse, rateLimit } from "@/dashboards/recession/lib/api-utils";

export const dynamic = "force-dynamic";

/** GET /api/snapshot[?config=<ModelOverrides JSON>] - full current snapshot. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const config = url.searchParams.get("config");
  if (config) {
    const limited = rateLimit(req, "snapshot-config", 20);
    if (limited) return limited;
  }
  try {
    const snap = await getSnapshot(config && config.length < 4000 ? config : null);
    return NextResponse.json(snap, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (e) {
    return errorResponse(e);
  }
}
