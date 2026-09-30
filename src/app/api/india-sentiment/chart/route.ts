import { NextResponse } from "next/server";
import { chartSeries, CHART_METRICS, CHART_PERIODS, type ChartPeriod } from "@/dashboards/india-sentiment/lib/charts";
import { configOverridesFromCookie } from "@/dashboards/india-sentiment/lib/server-config";
import { errorResponse, rateLimit } from "@/platform/api-utils";

export const dynamic = "force-dynamic";

/** Aligned pair for "NIFTY vs X" charts: ?metric=sentiment&period=1Y. */
export async function GET(req: Request) {
  const limited = rateLimit(req, "ims-chart", 120);
  if (limited) return limited;
  const q = new URL(req.url).searchParams;
  const metric = q.get("metric") ?? "sentiment";
  const period = (q.get("period") ?? "1Y") as ChartPeriod;
  if (!CHART_METRICS.some((m) => m.id === metric) || !CHART_PERIODS.includes(period)) return NextResponse.json({ error: "unknown metric or period" }, { status: 400 });
  try {
    return NextResponse.json(await chartSeries(metric, period, await configOverridesFromCookie()));
  } catch (e) {
    return errorResponse(e);
  }
}
