/**
 * Rule-based natural-language explanation engine. Every sentence is generated
 * from computed quantities, so it can always be traced back to specific
 * indicators and thresholds.
 */
import { fmtChange, fmtNum, fmtValue, scoreWord } from "../format";
import type { ModelConfig } from "../model-config";
import type { CompositeScore, IndicatorReading } from "../types";
import { metricForStress, type PreparedIndicator } from "./analyze";
import type { Confluence } from "./confluence";
import type { EnergyComponent } from "./energy";
import type { RatesModule } from "./rates-module";
import type { RegimeResult } from "./regime";

export interface EvidenceItem {
  indicatorId: string;
  name: string;
  text: string;
  stress: number | null;
}

export interface Explanation {
  headline: string;
  summary: string[];
  whatChanged: string[];
  whyItMatters: string[];
  supporting: EvidenceItem[];
  contradicting: EvidenceItem[];
  confirm: string[];
  invalidate: string[];
  inflation: string;
  financial: string;
  longEnd: string;
  disclaimer: string;
}

export interface WatchItem {
  indicatorId: string;
  name: string;
  current: string;
  stress: number | null;
  nextBand: string;
  threshold: string;
  why: string;
}

const WHY: Record<string, string> = {
  growth_labor:
    "Labour-market deterioration (rising unemployment, claims, slowing payrolls) is the most direct real-time evidence of a downturn; business surveys and real activity show whether weakness is spreading.",
  credit_financial:
    "Credit spreads, financial conditions and bank lending standards capture funding stress that can amplify a slowdown - something Treasury yields alone do not show.",
  curve_rates:
    "Curve inversions have preceded most post-war US recessions with long, variable lags; markets pricing rapid easing often reflects expected weakness.",
  housing: "Housing is highly rate-sensitive and has historically turned down ahead of the broader economy.",
  consumer: "Consumer spending is ~2/3 of GDP; delinquencies, income and sentiment indicate household resilience.",
  equity: "Equity drawdowns and volatility tighten financial conditions and reflect shifts in growth expectations.",
  inflation_energy: "Energy shocks and sticky core inflation can squeeze real incomes and limit how fast policy can ease.",
};

export function buildExplanation(args: {
  recession: CompositeScore;
  recessionPast1m: CompositeScore | null;
  recessionPast3m: CompositeScore | null;
  inflation: CompositeScore;
  inflationPast1m: CompositeScore | null;
  financial: CompositeScore;
  financialPast1m: CompositeScore | null;
  readings: Record<string, IndicatorReading>;
  prepared: Record<string, PreparedIndicator>;
  confluence: Confluence;
  rates: RatesModule;
  energy: EnergyComponent;
  regime: RegimeResult;
  cfg: ModelConfig;
}): Explanation {
  const { recession: R, readings, prepared, cfg } = args;
  const r = R.score;
  const d1 = r !== null && args.recessionPast1m?.score != null ? r - args.recessionPast1m.score : null;
  const d3 = r !== null && args.recessionPast3m?.score != null ? r - args.recessionPast3m.score : null;
  const dir = (d: number | null) => (d === null ? "with no comparison available" : d > 3 ? `up ${d.toFixed(0)} pts` : d < -3 ? `down ${Math.abs(d).toFixed(0)} pts` : "broadly unchanged");

  // Category drivers by contribution (weight x score)
  const catContrib = R.categories
    .filter((c) => c.score !== null)
    .map((c) => ({ c, pts: c.effectiveWeight * (c.score as number), prev: args.recessionPast1m?.categories.find((p) => p.id === c.id)?.score ?? null }))
    .sort((a, b) => b.pts - a.pts);
  const stressedCats = catContrib.filter((x) => (x.c.score as number) >= cfg.bands.watch);
  const leadCats = (stressedCats.length ? stressedCats : catContrib).slice(0, 2);

  let headline: string;
  if (r === null) headline = "Recession stress cannot be computed: insufficient data.";
  else {
    headline = `Recession stress is ${scoreWord(r)} at ${r.toFixed(0)}/100 (${dir(d1)} over 1 month).`;
  }

  const summary: string[] = [];
  if (r !== null) {
    if (stressedCats.length) {
      summary.push(
        `The score is mainly driven by ${leadCats.map((x) => `${x.c.label.toLowerCase()} (${(x.c.score as number).toFixed(0)})`).join(" and ")}.`,
      );
    } else {
      summary.push(`No recession category is at Watch level or above; the largest contributors are ${leadCats.map((x) => x.c.label.toLowerCase()).join(" and ")}.`);
    }
    summary.push(
      `${args.confluence.stressed} of ${args.confluence.total} major recession categories show stress (Watch or worse; ${args.confluence.elevatedOrWorse} Elevated or Severe), and ${args.confluence.deteriorating} deteriorated over ~3 months. This is a breadth count, not a probability.`,
    );
  }
  if (args.rates.interpretation.length) {
    const longEnd = args.rates.interpretation.find((s) => s.startsWith("Long-end")) ?? args.rates.interpretation.find((s) => s.startsWith("Falling yields"));
    if (longEnd) summary.push(longEnd);
  }

  const whatChanged: string[] = [];
  if (d1 !== null || d3 !== null) whatChanged.push(`Recession Stress: 1M ${d1 === null ? "n/a" : fmtSigned0(d1)} pts, 3M ${d3 === null ? "n/a" : fmtSigned0(d3)} pts.`);
  const catMoves = catContrib
    .filter((x) => x.prev !== null)
    .map((x) => ({ ...x, delta: (x.c.score as number) - (x.prev as number) }))
    .filter((x) => Math.abs(x.delta) >= 3)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);
  for (const x of catMoves) whatChanged.push(`${x.c.label}: ${fmtSigned0(x.delta)} pts over 1M (now ${(x.c.score as number).toFixed(0)}).`);
  const movers = R.contributions
    .map((c) => readings[c.indicatorId])
    .filter((x) => x && x.trend !== "stable" && x.trend !== "unknown" && x.trend !== "context" && x.stress !== null)
    .slice(0, 40);
  const worse = movers.filter((x) => x.trend === "deteriorating").slice(0, 3);
  const better = movers.filter((x) => x.trend === "improving").slice(0, 3);
  if (worse.length) whatChanged.push(`Deteriorating over ~3M: ${worse.map((x) => x.name).join(", ")}.`);
  if (better.length) whatChanged.push(`Improving over ~3M: ${better.map((x) => x.name).join(", ")}.`);
  if (!whatChanged.length) whatChanged.push("No material change in the composite or its categories over the past month.");

  const whyItMatters = leadCats.map((x) => `${x.c.label}: ${WHY[x.c.id] ?? ""}`);

  const describe = (x: IndicatorReading): string =>
    `${x.name} ${fmtValue(x, x.latest?.value ?? null)} (${x.stressMetricLabel.toLowerCase()}: stress ${fmtNum(x.stress, 0)}${x.changes.m3 !== null ? `; 3M ${fmtChange(x.id, x.changes.m3)}` : ""})`;

  const recIds = new Set(R.contributions.filter((c) => c.effectiveWeight > 0).map((c) => c.indicatorId));
  const recReadings = [...recIds].map((id) => readings[id]).filter(Boolean);
  const supporting = recReadings
    .filter((x) => (x.stress ?? 0) >= cfg.bands.watch)
    .sort((a, b) => (b.stress ?? 0) - (a.stress ?? 0))
    .slice(0, 6)
    .map((x) => ({ indicatorId: x.id, name: x.name, stress: x.stress, text: describe(x) }));
  const contradicting = recReadings
    .filter((x) => (x.stress ?? 100) < 35)
    .sort((a, b) => (a.stress ?? 0) - (b.stress ?? 0))
    .slice(0, 6)
    .map((x) => ({ indicatorId: x.id, name: x.name, stress: x.stress, text: describe(x) }));

  // Confirmation: indicators in Watch band crossing into Elevated; key thresholds.
  const confirm: string[] = [];
  const invalidate: string[] = [];
  const thresholdText = (x: IndicatorReading, target: number) => {
    const p = prepared[x.id];
    if (!p) return null;
    const v = metricForStress(p, p.stressMetric, target);
    if (v === null) return null;
    return `${metricName(x.stressMetricLabel).toLowerCase()} ${p.def.stress?.polarity === "lower_worse" ? "falls below" : "rises above"} ${fmtNum(v, Math.abs(v) >= 100 ? 0 : 2)}`;
  };
  const sahm = readings.sahm;
  if (sahm?.available && sahm.latest) {
    const dist = 0.5 - sahm.latest.value;
    confirm.push(
      dist > 0
        ? `Sahm Rule rising a further ${dist.toFixed(2)} pp to its 0.50 threshold (currently ${sahm.latest.value.toFixed(2)}).`
        : `Sahm Rule remaining above 0.50 (currently ${sahm.latest.value.toFixed(2)}) - note the rule has limits when unemployment rises because of labour-supply growth.`,
    );
  }
  const watchBand = recReadings
    .filter((x) => x.stress !== null && x.stress >= 40 && x.stress < cfg.bands.elevated && x.id !== "sahm")
    .sort((a, b) => (b.stress ?? 0) - (a.stress ?? 0))
    .slice(0, 4);
  for (const x of watchBand) {
    const t = thresholdText(x, cfg.bands.elevated);
    if (t) confirm.push(`${x.name}: ${t} (Elevated band).`);
  }
  const credit = readings.hy_oas?.available ? readings.hy_oas : readings.baa10y;
  if (credit?.available && (credit.stress ?? 0) < cfg.bands.elevated) {
    const t = thresholdText(credit, cfg.bands.elevated);
    if (t) confirm.push(`Credit confirmation: ${credit.name} ${t.replace(/^.*?(rises above|falls below)/, "$1")}.`);
  }
  if (!confirm.length) confirm.push("Broad deterioration across labour, credit and activity categories at the same time.");

  const topStressed = supporting.slice(0, 4);
  for (const s of topStressed) {
    const x = readings[s.indicatorId];
    const t = thresholdText(x, cfg.bands.watch);
    if (t) invalidate.push(`${x.name}: ${t.replace("rises above", "falls back below").replace("falls below", "recovers above")} (back to Normal).`);
  }
  if (sahm?.available && sahm.latest && sahm.latest.value > 0.2) invalidate.push("Unemployment stabilising so that the Sahm value falls back toward 0.");
  if (!invalidate.length) invalidate.push("Currently little recession stress to invalidate; watch for any of the confirmation items instead.");

  const I = args.inflation;
  const iTop = I.categories
    .filter((c) => c.score !== null)
    .sort((a, b) => (b.score as number) - (a.score as number))
    .slice(0, 2);
  const di = I.score !== null && args.inflationPast1m?.score != null ? I.score - args.inflationPast1m.score : null;
  const inflation =
    I.score === null
      ? "Inflation stress: insufficient data."
      : `Inflation stress is ${scoreWord(I.score)} at ${I.score.toFixed(0)} (${dir(di)} over 1M), led by ${iTop.map((c) => `${c.label.toLowerCase()} (${(c.score as number).toFixed(0)})`).join(" and ")}. ${args.energy.interpretation}`;

  const F = args.financial;
  const df = F.score !== null && args.financialPast1m?.score != null ? F.score - args.financialPast1m.score : null;
  const fTop = F.categories
    .filter((c) => c.score !== null)
    .sort((a, b) => (b.score as number) - (a.score as number))
    .slice(0, 2);
  const financial =
    F.score === null
      ? "Financial market stress: insufficient data."
      : `Financial market stress is ${scoreWord(F.score)} at ${F.score.toFixed(0)} (${dir(df)} over 1M); highest readings in ${fTop.map((c) => `${c.label.toLowerCase()} (${(c.score as number).toFixed(0)})`).join(" and ")}.`;

  const longEnd = [args.rates.interpretation.join(" "), args.rates.caveat].filter(Boolean).join(" ");

  return {
    headline,
    summary,
    whatChanged,
    whyItMatters,
    supporting,
    contradicting,
    confirm,
    invalidate,
    inflation,
    financial,
    longEnd,
    disclaimer:
      "This is an analytical summary of current conditions generated from the indicators shown. It is not a forecast and does not state that a recession will or will not occur.",
  };
}

/** "Spread level percentile" -> "Spread level": thresholds are expressed in the metric's own units. */
function metricName(label: string) {
  return label.replace(/\s+percentile$/i, "");
}

function fmtSigned0(x: number) {
  return `${x > 0 ? "+" : x < 0 ? "−" : "±"}${Math.abs(x).toFixed(0)}`;
}

/** Scored indicators closest to crossing into the next signal band, weighted by importance. */
export function buildWatchList(
  recession: CompositeScore,
  financial: CompositeScore,
  readings: Record<string, IndicatorReading>,
  prepared: Record<string, PreparedIndicator>,
  cfg: ModelConfig,
): WatchItem[] {
  const weights = new Map<string, number>();
  for (const c of [...recession.contributions, ...financial.contributions]) weights.set(c.indicatorId, Math.max(weights.get(c.indicatorId) ?? 0, c.effectiveWeight));
  const bands = [
    { at: cfg.bands.watch, name: "Watch" },
    { at: cfg.bands.elevated, name: "Elevated" },
    { at: cfg.bands.severe, name: "Severe" },
  ];
  const items: (WatchItem & { rank: number })[] = [];
  for (const [id, w] of weights) {
    const x = readings[id];
    if (!x?.available || x.stress === null || w <= 0) continue;
    const next = bands.find((b) => b.at > (x.stress as number));
    if (!next) continue;
    const gap = next.at - (x.stress as number);
    if (gap > 20) continue;
    const p = prepared[id];
    const v = p ? metricForStress(p, p.stressMetric, next.at) : null;
    const rank = w * (x.trend === "deteriorating" ? 2 : 1) * (1 / (1 + gap / 5));
    items.push({
      indicatorId: id,
      name: x.name,
      current: fmtValue(x, x.latest?.value ?? null),
      stress: x.stress,
      nextBand: next.name,
      threshold: v === null ? "—" : `${metricName(x.stressMetricLabel)}: ${fmtNum(v, Math.abs(v) >= 100 ? 0 : 2)}`,
      why: x.trend === "deteriorating" ? "Approaching next band and deteriorating over 3M" : "Approaching next band",
      rank,
    });
  }
  const sahm = readings.sahm;
  if (sahm?.available && sahm.latest && !items.find((i) => i.indicatorId === "sahm")) {
    items.push({
      indicatorId: "sahm",
      name: "Sahm Rule",
      current: sahm.latest.value.toFixed(2) + " pp",
      stress: sahm.stress,
      nextBand: "0.50 threshold",
      threshold: `Distance: ${(0.5 - sahm.latest.value).toFixed(2)} pp`,
      why: "Widely followed labour-market trigger",
      rank: 0.001,
    });
  }
  return items
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 6)
    .map(({ rank: _rank, ...rest }) => rest);
}
