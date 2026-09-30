import { NextResponse } from "next/server";
import { getHistorical } from "@/dashboards/recession/lib/data/service";
import { runBacktest } from "@/dashboards/recession/lib/engine/historical";
import { errorResponse, rateLimit } from "@/platform/api-utils";
import { modelOverridesFromCookie } from "@/dashboards/recession/lib/server-config";
import { parseBacktestParams } from "@/dashboards/recession/lib/backtest-params";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limited = rateLimit(req, "backtest", 30);
  if (limited) return limited;
  try {
    const params = parseBacktestParams(Object.fromEntries(new URL(req.url).searchParams));
    const { records } = await getHistorical(await modelOverridesFromCookie());
    return NextResponse.json(runBacktest(records, params));
  } catch (e) {
    return errorResponse(e);
  }
}
