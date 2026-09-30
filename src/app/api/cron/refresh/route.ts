import { NextResponse } from "next/server";
import { refreshAll } from "@/dashboards/recession/lib/data/service";
import { checkCron, errorResponse } from "@/dashboards/recession/lib/api-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Scheduled refresh (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). */
export async function GET(req: Request) {
  const denied = checkCron(req);
  if (denied) return denied;
  try {
    const report = await refreshAll();
    return NextResponse.json({ ...report, okCount: report.ok.length, failedCount: report.failed.length });
  } catch (e) {
    return errorResponse(e);
  }
}
