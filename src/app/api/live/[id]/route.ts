import { NextResponse } from "next/server";
import { DASHBOARDS } from "@/dashboards/registry";
import { errorResponse, rateLimit } from "@/platform/api-utils";

export const dynamic = "force-dynamic";

/** Live status of one dashboard for polling pages: { version, updatedAt, note, checkedAt }. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req, "live", 240);
  if (limited) return limited;
  const { id } = await ctx.params;
  const d = DASHBOARDS.find((x) => x.id === id);
  if (!d?.live) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const s = await d.live.status();
    return NextResponse.json({ version: s.version, updatedAt: s.updatedAt, note: s.note ?? null, checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
