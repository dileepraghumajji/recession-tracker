import { NextResponse } from "next/server";
import { NewAlertSchema, validateRule, describeRule, evaluateRule } from "@/dashboards/recession/lib/alerts";
import { getStore } from "@/dashboards/recession/lib/data/store";
import { evaluateAlerts, getSnapshot } from "@/dashboards/recession/lib/data/service";
import { checkAdmin, errorResponse, rateLimit } from "@/dashboards/recession/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snap = await getSnapshot(null);
    await evaluateAlerts(snap);
    const store = getStore();
    const [alerts, events] = await Promise.all([store.listAlerts(), store.listAlertEvents(100)]);
    return NextResponse.json({
      alerts: alerts.map((a) => ({ ...a, description: describeRule(a.rule), current: evaluateRule(a.rule, snap) })),
      events,
      persistent: store.kind === "postgres",
      writeProtected: !!process.env.ADMIN_TOKEN,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  const denied = checkAdmin(req) ?? rateLimit(req, "alerts-write", 30);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = NewAlertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid alert", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  const err = validateRule(parsed.data.rule);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  try {
    const store = getStore();
    if ((await store.listAlerts()).length >= 100) return NextResponse.json({ error: "alert limit reached" }, { status: 400 });
    const a = await store.createAlert(parsed.data.name, parsed.data.rule);
    // Record the current state without firing, so an alert only fires on a future transition.
    const snap = await getSnapshot(null);
    const res = evaluateRule(a.rule, snap);
    await store.recordAlertEvaluation(a.id, res.state, res.value, false);
    return NextResponse.json(a, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
