import { NextResponse } from "next/server";
import { describeRule, evaluateRule, NewAlertSchema } from "@/dashboards/india-sentiment/lib/alerts";
import { getSnapshot } from "@/dashboards/india-sentiment/lib/data/service";
import { getStore } from "@/dashboards/india-sentiment/lib/data/store";
import { checkAdmin, errorResponse, rateLimit } from "@/platform/api-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snap = await getSnapshot(null);
    const store = getStore();
    const [alerts, events] = await Promise.all([store.listAlerts(), store.listAlertEvents(100)]);
    return NextResponse.json({
      alerts: alerts.map((a) => ({ ...a, description: describeRule(a.rule), current: evaluateRule(a.rule, snap, { state: a.lastState, value: a.lastValue }) })),
      events,
      persistent: store.kind === "postgres",
      writeProtected: !!process.env.ADMIN_TOKEN,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  const denied = checkAdmin(req) ?? rateLimit(req, "ims-alerts-write", 30);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const parsed = NewAlertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid alert", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  try {
    const store = getStore();
    if ((await store.listAlerts()).length >= 100) return NextResponse.json({ error: "alert limit reached" }, { status: 400 });
    const a = await store.createAlert(parsed.data.name, parsed.data.rule);
    // Record the current state without firing, so the alert only fires on a future transition/crossing.
    const res = evaluateRule(a.rule, await getSnapshot(null), { state: null, value: null });
    await store.recordAlertEvaluation(a.id, res.state, res.value, false);
    return NextResponse.json(a, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
