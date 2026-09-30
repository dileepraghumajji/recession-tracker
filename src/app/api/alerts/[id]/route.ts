import { NextResponse } from "next/server";
import { getStore } from "@/dashboards/recession/lib/data/store";
import { checkAdmin, errorResponse } from "@/dashboards/recession/lib/api-utils";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = checkAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  try {
    await getStore().deleteAlert(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = checkAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { enabled?: unknown } | null;
  if (!body || typeof body.enabled !== "boolean") return NextResponse.json({ error: "expected {enabled: boolean}" }, { status: 400 });
  try {
    await getStore().setAlertEnabled(id, body.enabled);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
