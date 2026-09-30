import { NextResponse } from "next/server";
import { getHistorical } from "@/dashboards/recession/lib/data/service";
import { errorResponse, rateLimit } from "@/dashboards/recession/lib/api-utils";
import { modelOverridesFromCookie } from "@/dashboards/recession/lib/server-config";

export const dynamic = "force-dynamic";

/** Monthly point-in-time composite history (same engine as the backtest). */
export async function GET(req: Request) {
  const limited = rateLimit(req, "score-history", 30);
  if (limited) return limited;
  try {
    const { records } = await getHistorical(await modelOverridesFromCookie());
    return NextResponse.json({
      records: records
        .filter((r) => r.recession !== null)
        .map((r) => ({ date: r.date, recession: r.recession, inflation: r.inflation, financial: r.financial, overall: r.overall, coverage: r.coverage })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
