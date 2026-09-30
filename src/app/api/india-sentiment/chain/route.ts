import { NextResponse } from "next/server";
import { resolveConfig } from "@/dashboards/india-sentiment/lib/config";
import { getChainView } from "@/dashboards/india-sentiment/lib/data/service";
import { configOverridesFromCookie } from "@/dashboards/india-sentiment/lib/server-config";
import { errorResponse, rateLimit } from "@/platform/api-utils";

export const dynamic = "force-dynamic";

/** Option-chain analysis: ?u=NIFTY&expiry=YYYY-MM-DD&window=10 (window 0 = all strikes). */
export async function GET(req: Request) {
  const limited = rateLimit(req, "ims-chain", 120);
  if (limited) return limited;
  const q = new URL(req.url).searchParams;
  const u = (q.get("u") ?? "NIFTY").toUpperCase().replace(/[^A-Z0-9&-]/g, "").slice(0, 20);
  const expiry = /^\d{4}-\d{2}-\d{2}$/.test(q.get("expiry") ?? "") ? q.get("expiry") : null;
  const w = Number(q.get("window") ?? 10);
  try {
    const cfg = resolveConfig(await configOverridesFromCookie());
    return NextResponse.json(await getChainView(u, expiry, Number.isFinite(w) ? Math.max(0, Math.min(60, Math.round(w))) : 10, cfg));
  } catch (e) {
    return errorResponse(e);
  }
}
