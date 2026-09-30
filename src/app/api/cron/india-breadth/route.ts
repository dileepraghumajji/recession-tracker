import { NextResponse } from "next/server";
import { checkCron, errorResponse } from "@/platform/api-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * India market breadth from Dhan stock candles (resumable: each call continues
 * the current cycle until ~20 s before maxDuration). vercel.json schedules it
 * several times each morning (IST) so a full cycle completes before the open.
 * Requires `Authorization: Bearer $CRON_SECRET` (sent by Vercel Cron).
 */
export async function GET(req: Request) {
  const denied = checkCron(req);
  if (denied) return denied;
  try {
    const { runBreadthJob } = await import("@/dashboards/india-sentiment/lib/data/breadth/job");
    const report = await runBreadthJob({ deadline: Date.now() + (maxDuration - 20) * 1000 });
    if (report.status === "published") {
      const { afterExternalWrite } = await import("@/dashboards/india-sentiment/lib/data/service");
      await afterExternalWrite();
    }
    return NextResponse.json({ breadth: report });
  } catch (e) {
    return errorResponse(e);
  }
}
