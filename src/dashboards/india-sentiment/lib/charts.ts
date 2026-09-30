/**
 * Data for "NIFTY vs X" charts. Each chart is returned as two aligned series
 * that the UI draws as stacked panels sharing the time axis (never a dual-axis chart).
 */
import { addDays, todayISO } from "@/platform/lib/timeseries";
import { getHistory, getIntraday, getPrepared } from "./data/service";
import { CHART_METRICS, PERIOD_DAYS, type ChartPayload, type ChartPeriod } from "./chart-metrics";
import type { Obs } from "./types";

export { CHART_METRICS, CHART_PERIODS, type ChartPayload, type ChartPeriod } from "./chart-metrics";

function window(obs: Obs[], from: string, max = 900): Obs[] {
  const w = obs.filter((o) => o.date >= from);
  if (w.length <= max) return w;
  const step = Math.ceil(w.length / max);
  return w.filter((_, i) => i % step === 0 || i === w.length - 1);
}

export async function chartSeries(metric: string, period: ChartPeriod, overrides: string | null): Promise<ChartPayload> {
  const m = CHART_METRICS.find((x) => x.id === metric)!;
  const { series, prepared } = await getPrepared();
  const nifty = series["idx:NIFTY50"]?.obs ?? [];

  if (period === "1D" && metric === "pressure") {
    const pts = await getIntraday("NIFTY", 5);
    return {
      metric,
      period,
      top: { label: "NIFTY spot (from option-chain snapshots)", points: pts.map((p) => ({ date: p.ts, value: p.spot })) },
      bottom: { label: "Net premium pressure per 5 min (₹ Cr, bullish +)", units: "₹ Cr", points: pts.map((p) => ({ date: p.ts, value: p.pressure / 1e7 })) },
      intraday: true,
      note: pts.length ? null : "No intraday option-chain snapshots stored for the latest session.",
    };
  }
  const effective: ChartPeriod = period === "1D" ? "1W" : period;
  const end = nifty.at(-1)?.date ?? todayISO();
  const from = addDays(end, -PERIOD_DAYS[effective]);
  const needsHistory = m.source.kind !== "indicator" || m.top === "sentiment";
  const history = needsHistory ? (await getHistory(overrides)).history : [];
  const sentiment = history.filter((h) => h.score !== null).map((h) => ({ date: h.date, value: h.score as number }));

  let bottom: Obs[] = [];
  if (m.source.kind === "sentiment") bottom = sentiment;
  else if (m.source.kind === "factor") {
    const { id, invert } = m.source;
    bottom = history.flatMap((h) => {
      const v = h.factors[id as keyof typeof h.factors];
      return v === null ? [] : [{ date: h.date, value: invert ? 100 - v : v }];
    });
  } else {
    const id = m.source.id;
    bottom = prepared.find((p) => p.def.id === id)?.metric ?? [];
  }
  return {
    metric,
    period,
    top: m.top === "sentiment" ? { label: "Sentiment score", points: window(sentiment, from) } : { label: "NIFTY 50", points: window(nifty, from) },
    bottom: { label: m.label, units: m.units, points: window(bottom, from) },
    intraday: false,
    note: period === "1D" ? "Intraday history is stored only for option premium pressure; showing the last week." : bottom.length ? null : `${m.label}: no data available.`,
  };
}
