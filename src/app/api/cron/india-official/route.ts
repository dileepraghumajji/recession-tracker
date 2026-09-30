import { NextResponse } from "next/server";
import { checkCron, errorResponse } from "@/platform/api-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Official Indian series from machine-readable sources that allow automated
 * download (today: the RBI repo rate via the BIS policy-rate API). One small
 * request per series; vercel.json schedules it daily.
 * Requires `Authorization: Bearer $CRON_SECRET` (sent by Vercel Cron).
 */
export async function GET(req: Request) {
  const denied = checkCron(req);
  if (denied) return denied;
  try {
    const { runOfficialImports } = await import("@/dashboards/india-sentiment/lib/data/official");
    const report = await runOfficialImports();
    if (report.results.some((r) => r.status === "updated")) {
      const { afterExternalWrite } = await import("@/dashboards/india-sentiment/lib/data/service");
      await afterExternalWrite();
    }
    return NextResponse.json({ official: report }, { status: report.status === "error" ? 502 : 200 });
  } catch (e) {
    return errorResponse(e);
  }
}
