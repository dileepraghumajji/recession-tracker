import { NextResponse } from "next/server";
import { getBacktest } from "@/dashboards/india-sentiment/lib/data/service";
import { configOverridesFromCookie } from "@/dashboards/india-sentiment/lib/server-config";
import { errorResponse, rateLimit } from "@/platform/api-utils";

export const dynamic = "force-dynamic";

/** Historical observations of forward NIFTY returns by sentiment band: ?coverage=0.5. */
export async function GET(req: Request) {
  const limited = rateLimit(req, "ims-backtest", 20);
  if (limited) return limited;
  const c = Number(new URL(req.url).searchParams.get("coverage") ?? 0.5);
  try {
    return NextResponse.json(await getBacktest(await configOverridesFromCookie(), Number.isFinite(c) ? Math.max(0.2, Math.min(1, c)) : 0.5));
  } catch (e) {
    return errorResponse(e);
  }
}
