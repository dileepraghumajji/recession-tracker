import { NextResponse } from "next/server";
import { DASHBOARDS } from "@/dashboards/registry";
import { checkCron, errorResponse } from "@/platform/api-utils";
import { refreshDashboards } from "@/platform/refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Scheduled refresh of every registered dashboard (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). */
export async function GET(req: Request) {
  const denied = checkCron(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ dashboards: await refreshDashboards(DASHBOARDS) });
  } catch (e) {
    return errorResponse(e);
  }
}
