import { NextResponse } from "next/server";
import { getIntraday, getIntradayPrices } from "@/dashboards/india-sentiment/lib/data/service";
import { errorResponse, rateLimit } from "@/platform/api-utils";

export const dynamic = "force-dynamic";

/**
 * Intraday net premium pressure for the latest session: ?u=NIFTY&m=5|15|30|60.
 * `prices` holds the underlying's 5-minute closes from the market-data provider (empty without one).
 */
export async function GET(req: Request) {
  const limited = rateLimit(req, "ims-intraday", 120);
  if (limited) return limited;
  const q = new URL(req.url).searchParams;
  const u = (q.get("u") ?? "NIFTY").toUpperCase().replace(/[^A-Z0-9&-]/g, "").slice(0, 20);
  const m = [5, 15, 30, 60].includes(Number(q.get("m"))) ? Number(q.get("m")) : 5;
  try {
    const [points, prices] = await Promise.all([getIntraday(u, m), getIntradayPrices(u)]);
    return NextResponse.json({ underlying: u, minutes: m, points, prices });
  } catch (e) {
    return errorResponse(e);
  }
}
