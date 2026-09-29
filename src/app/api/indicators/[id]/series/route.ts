import { NextResponse } from "next/server";
import { getSeriesForIndicator } from "@/lib/data/service";
import { errorResponse } from "@/lib/api-utils";
import { stressSeries } from "@/lib/engine/stress-series";
import { resolveConfig } from "@/lib/model-config";
import { addDays } from "@/lib/timeseries";
import type { Obs } from "@/lib/types";

export const dynamic = "force-dynamic";

const PERIOD_DAYS: Record<string, number | null> = { "1M": 31, "3M": 92, "1Y": 366, "5Y": 5 * 366, MAX: null };

function downsample(obs: Obs[], max: number): Obs[] {
  if (obs.length <= max) return obs;
  const step = obs.length / max;
  const out: Obs[] = [];
  for (let i = 0; i < max; i++) out.push(obs[Math.floor(i * step)]);
  if (out[out.length - 1] !== obs[obs.length - 1]) out.push(obs[obs.length - 1]);
  return out;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const period = new URL(req.url).searchParams.get("period") ?? "5Y";
  if (!(period in PERIOD_DAYS) || !/^[a-z0-9_]{1,40}$/.test(id)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  try {
    const res = await getSeriesForIndicator(id);
    if (!res) return NextResponse.json({ error: "unknown indicator" }, { status: 404 });
    const p = res.prepared;
    const last = p.display.length ? p.display[p.display.length - 1].date : null;
    const days = PERIOD_DAYS[period];
    const from = last && days ? addDays(last, -days) : "0000-01-01";
    const display = downsample(
      p.display.filter((o) => o.date >= from),
      1500,
    );
    const stress = stressSeries(p, resolveConfig(null), from, 300);
    return NextResponse.json({ name: p.def.name, units: p.def.units, stressLabel: p.def.stress?.label ?? "", display, stress });
  } catch (e) {
    return errorResponse(e);
  }
}
