import { NextResponse } from "next/server";
import { getSnapshot } from "@/dashboards/india-sentiment/lib/data/service";
import { errorResponse, rateLimit } from "@/platform/api-utils";

export const dynamic = "force-dynamic";

/** Full current snapshot. Optional ?config= JSON overrides (same shape as the Settings page). */
export async function GET(req: Request) {
  const limited = rateLimit(req, "ims-snapshot", 60);
  if (limited) return limited;
  try {
    return NextResponse.json(await getSnapshot(new URL(req.url).searchParams.get("config")));
  } catch (e) {
    return errorResponse(e);
  }
}
