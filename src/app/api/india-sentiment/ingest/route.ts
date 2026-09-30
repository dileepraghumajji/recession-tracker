import { NextResponse } from "next/server";
import { ingest, IngestSchema } from "@/dashboards/india-sentiment/lib/data/service";
import { checkAdmin, errorResponse, rateLimit } from "@/platform/api-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Authenticated ingestion of licensed market data and official releases
 * (requires ADMIN_TOKEN; send header x-admin-token). Body: { source, series?, optionChains? }.
 * See the dashboard's Settings & Sources page for the payload format.
 */
export async function POST(req: Request) {
  const denied = checkAdmin(req, true) ?? rateLimit(req, "ims-ingest", 60);
  if (denied) return denied;
  if (Number(req.headers.get("content-length") ?? 0) > 20_000_000) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  const body = await req.json().catch(() => null);
  const parsed = IngestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid payload", issues: parsed.error.issues.slice(0, 10) }, { status: 400 });
  try {
    return NextResponse.json(await ingest(parsed.data));
  } catch (e) {
    return errorResponse(e);
  }
}
