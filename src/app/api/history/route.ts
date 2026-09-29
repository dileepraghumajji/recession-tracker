import { NextResponse } from "next/server";
import { getHistorical } from "@/lib/data/service";
import { comparePeriods } from "@/lib/engine/historical";
import { errorResponse, rateLimit } from "@/lib/api-utils";
import { modelOverridesFromCookie } from "@/lib/server-config";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limited = rateLimit(req, "history", 30);
  if (limited) return limited;
  try {
    const { records } = await getHistorical(await modelOverridesFromCookie());
    return NextResponse.json(comparePeriods(records));
  } catch (e) {
    return errorResponse(e);
  }
}
