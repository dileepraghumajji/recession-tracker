/**
 * Explanation engine: institutional-style, descriptive text generated from the
 * factor contributions. Never gives trading instructions.
 */
import type { SentimentConfig } from "../config";
import type { Band, FactorId, FactorResult, IndicatorReading } from "../types";
import type { Divergence } from "./divergence";
import type { PcrDivergence, PositioningShift } from "./options";

const PHRASE: Record<FactorId, { pos: string; neg: string; up: string; down: string; why: string }> = {
  momentum: { pos: "Positive price momentum", neg: "Weak price momentum", up: "price momentum strengthened", down: "price momentum weakened", why: "Trend and multi-horizon returns show whether buyers have been in control across timeframes." },
  breadth: { pos: "Broad market participation", neg: "Narrow market breadth", up: "breadth improved", down: "breadth deteriorated", why: "Broad participation makes index moves less dependent on a handful of heavyweights." },
  derivatives: { pos: "Supportive derivatives positioning", neg: "Defensive derivatives positioning", up: "derivatives positioning turned more supportive", down: "derivatives positioning turned more defensive", why: "Open-interest positioning shows how leveraged participants are exposed." },
  premium_flow: { pos: "Constructive option premium flow", neg: "Defensive option premium flow", up: "option premium flow improved", down: "option premium flow turned defensive", why: "Where fresh option money is spent shows demand for upside exposure versus protection." },
  volatility: { pos: "Contained volatility", neg: "Elevated volatility", up: "volatility eased", down: "India VIX increased", why: "The price of protection reflects how much uncertainty participants are willing to pay for." },
  flows: { pos: "Supportive institutional flows", neg: "Weak institutional flows", up: "institutional flows improved", down: "institutional flows weakened", why: "FII and DII flows are the marginal source of demand for Indian equities." },
  liquidity: { pos: "Strong liquidity", neg: "Tight liquidity", up: "liquidity improved", down: "liquidity tightened", why: "System liquidity and money-market rates drive funding conditions and risk-taking capacity." },
  currency: { pos: "Stable INR", neg: "INR weakness", up: "the INR firmed", down: "the INR weakened", why: "Currency moves affect foreign investors' returns and imported inflation." },
  bonds: { pos: "Supportive bond market", neg: "Bond-market pressure", up: "G-Sec conditions eased", down: "G-Sec yields rose", why: "Yields set the discount rate for equities and signal growth, inflation and fiscal expectations." },
  credit: { pos: "Benign credit conditions", neg: "Credit stress", up: "credit conditions improved", down: "credit stress increased", why: "Credit deterioration usually precedes or amplifies broad risk-off episodes." },
  global: { pos: "Supportive global risk appetite", neg: "Weak global risk appetite", up: "global risk appetite improved", down: "global risk appetite weakened", why: "Global risk sentiment drives foreign flows into emerging markets." },
  commodities: { pos: "Benign commodity prices", neg: "Commodity-price pressure", up: "commodity pressure eased", down: "commodity pressure increased", why: "Crude oil feeds India's inflation, current account, INR and corporate margins." },
  valuation: { pos: "Reasonable valuation", neg: "Elevated valuation", up: "valuations became less stretched", down: "valuations became more stretched", why: "Valuation shows how much optimism is already priced in; it is not a timing signal." },
  earnings: { pos: "Positive earnings revisions", neg: "Weak earnings momentum", up: "earnings momentum improved", down: "earnings momentum weakened", why: "Earnings revisions show whether fundamentals are keeping pace with prices." },
  macro: { pos: "Supportive macro data", neg: "Soft macro data", up: "macro data improved", down: "macro data softened", why: "Growth, inflation and external balances set the backdrop for earnings and policy." },
  retail: { pos: "Strong retail participation", neg: "Subdued retail activity", up: "retail activity picked up", down: "retail activity cooled", why: "Retail, MF and IPO activity reflect domestic risk appetite and speculation." },
};

function listJoin(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export interface Drivers {
  positive: { id: FactorId; label: string; score: number; points: number; phrase: string }[];
  negative: { id: FactorId; label: string; score: number; points: number; phrase: string }[];
}

export function rankDrivers(factors: FactorResult[], byId: Record<string, IndicatorReading>): Drivers {
  const phrase = (f: FactorResult, positive: boolean) => {
    if (f.id === "flows" && !positive) {
      const fii = byId["fii_cash_1m"];
      if (fii?.available && fii.value !== null && fii.value < 0) return "FII selling";
    }
    return positive ? PHRASE[f.id].pos : PHRASE[f.id].neg;
  };
  const withScore = factors.filter((f) => f.score !== null);
  const map = (f: FactorResult, positive: boolean) => ({ id: f.id, label: f.label, score: f.score as number, points: f.points, phrase: phrase(f, positive) });
  return {
    positive: withScore.filter((f) => f.points > 0.3).sort((a, b) => b.points - a.points).map((f) => map(f, true)),
    negative: withScore.filter((f) => f.points < -0.3).sort((a, b) => a.points - b.points).map((f) => map(f, false)),
  };
}

export function headline(score: number | null, band: Band | null, drivers: Drivers, derivatives: FactorResult, shift: PositioningShift, confidence: number): string {
  if (score === null || !band) return "Indian market sentiment cannot be scored: too few factor groups have current data. Connect a market-data provider or ingest data to enable the score.";
  const parts = [`Indian market sentiment is currently ${score.toFixed(0)}/100, in ${band.label} territory.`];
  if (drivers.positive.length) parts.push(`The strongest positive contributors are ${listJoin(drivers.positive.slice(0, 4).map((d) => lc(d.phrase)))}.`);
  if (drivers.negative.length) parts.push(`Sentiment is being restrained by ${listJoin(drivers.negative.slice(0, 3).map((d) => lc(d.phrase)))}.`);
  if (derivatives.score !== null) {
    const tone = derivatives.score >= 60 ? "supportive" : derivatives.score >= 52 ? "moderately supportive" : derivatives.score > 48 ? "balanced" : derivatives.score > 40 ? "moderately defensive" : "defensive";
    const tail =
      shift.verdict === "concentrated_near"
        ? ", although the positioning is concentrated in the current expiry rather than later expiries"
        : shift.verdict === "persists"
          ? ", and it persists into later expiries"
          : shift.verdict === "disagree"
            ? ", although later expiries point the other way"
            : "";
    parts.push(`Option positioning is ${tone}${tail}.`);
  }
  if (confidence < 50) parts.push(`Model confidence is low (${confidence}/100); treat the reading with caution.`);
  return parts.join(" ");
}

export interface ChangeExplanation {
  window: string;
  from: number;
  to: number;
  delta: number;
  significant: boolean;
  text: string;
  contributions: { id: FactorId; label: string; delta: number }[];
}

export function explainChange(window: string, prev: { score: number | null; factors: FactorResult[] }, cur: { score: number | null; factors: FactorResult[] }, cfg: SentimentConfig): ChangeExplanation | null {
  if (prev.score === null || cur.score === null) return null;
  const delta = cur.score - prev.score;
  const contributions = cur.factors
    .map((f) => ({ id: f.id, label: f.label, delta: f.points - (prev.factors.find((p) => p.id === f.id)?.points ?? 0) }))
    .filter((c) => Math.abs(c.delta) >= 0.05)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const significant = Math.abs(delta) >= cfg.changeExplainThreshold;
  const dir = delta < 0 ? -1 : 1;
  const drivers = contributions.filter((c) => Math.sign(c.delta) === dir).slice(0, 3);
  const offsets = contributions.filter((c) => Math.sign(c.delta) === -dir && Math.abs(c.delta) >= 0.3).slice(0, 2);
  const word = (c: { id: FactorId; delta: number }) => (c.delta > 0 ? PHRASE[c.id].up : PHRASE[c.id].down);
  let text: string;
  if (Math.abs(delta) < 0.5) text = `Sentiment was essentially unchanged over ${window} (${prev.score.toFixed(0)} → ${cur.score.toFixed(0)}).`;
  else {
    text = `Sentiment ${delta < 0 ? "declined" : "improved"} ${Math.abs(delta).toFixed(1)} points over ${window} (${prev.score.toFixed(0)} → ${cur.score.toFixed(0)})`;
    text += drivers.length ? `, primarily because ${listJoin(drivers.map(word))}.` : ".";
    if (offsets.length) text += ` The ${delta < 0 ? "deterioration" : "improvement"} was partially offset as ${listJoin(offsets.map(word))}.`;
  }
  return { window, from: prev.score, to: cur.score, delta, significant, text, contributions };
}

export interface Narrative {
  whatChanged: string[];
  whyItMatters: string[];
  confirms: string[];
  contradicts: string[];
  monitor: string[];
}

export function narrative(args: {
  score: number | null;
  band: Band | null;
  factors: FactorResult[];
  drivers: Drivers;
  weekChange: ChangeExplanation | null;
  divergences: Divergence[];
  pcr: PcrDivergence;
  thresholds: number[];
  staleCritical: string[];
}): Narrative {
  const { score, factors, drivers } = args;
  const whatChanged: string[] = [];
  if (args.weekChange) {
    whatChanged.push(args.weekChange.text);
    for (const c of args.weekChange.contributions.slice(0, 3)) whatChanged.push(`${c.label}: ${c.delta >= 0 ? "+" : ""}${c.delta.toFixed(1)} pts contribution (${c.delta > 0 ? PHRASE[c.id].up : PHRASE[c.id].down}).`);
  } else whatChanged.push("No 1-week comparison available.");
  const top = [...drivers.positive.slice(0, 2), ...drivers.negative.slice(0, 2)];
  const whyItMatters = top.map((d) => `${d.label}: ${PHRASE[d.id].why}`);
  const side = score === null ? 0 : score > 55 ? 1 : score < 45 ? -1 : 0;
  const scored = factors.filter((f) => f.score !== null && f.effectiveWeight > 0);
  const confirms =
    side === 0
      ? scored.filter((f) => Math.abs((f.score as number) - 50) < 7).map((f) => `${f.label} (${(f.score as number).toFixed(0)}) is also close to neutral.`)
      : scored.filter((f) => Math.sign((f.score as number) - 50) === side && Math.abs((f.score as number) - 50) >= 5).sort((a, b) => Math.abs(b.points) - Math.abs(a.points)).map((f) => `${f.label} (${(f.score as number).toFixed(0)}) is consistent with the ${args.band?.label ?? ""} reading.`);
  const contradicts =
    side === 0
      ? scored.filter((f) => Math.abs((f.score as number) - 50) >= 12).map((f) => `${f.label} (${(f.score as number).toFixed(0)}) is far from neutral.`)
      : scored.filter((f) => Math.sign((f.score as number) - 50) === -side && Math.abs((f.score as number) - 50) >= 5).sort((a, b) => Math.abs(b.points) - Math.abs(a.points)).map((f) => `${f.label} (${(f.score as number).toFixed(0)}) points the other way.`);
  const monitor: string[] = [];
  for (const d of args.divergences.filter((x) => x.active)) monitor.push(`${d.kind === "bullish" ? "Bullish" : "Bearish"} divergence: ${d.label} — ${d.evidence}`);
  if (args.pcr.divergent) monitor.push(args.pcr.text);
  if (score !== null) {
    const near = args.thresholds.find((t) => Math.abs(score - t) <= 3);
    if (near !== undefined) monitor.push(`The score (${score.toFixed(0)}) is within 3 points of the ${near} band boundary.`);
  }
  for (const f of scored.filter((x) => Math.abs((x.score as number) - 50) < 4 && x.effectiveWeight >= 0.08)) monitor.push(`${f.label} is near neutral (${(f.score as number).toFixed(0)}) and could tip either way.`);
  for (const s of args.staleCritical) monitor.push(`Data quality: ${s}`);
  if (!monitor.length) monitor.push("No active divergences or threshold proximity.");
  return {
    whatChanged,
    whyItMatters,
    confirms: confirms.length ? confirms.slice(0, 5) : ["No factor groups strongly confirm the reading."],
    contradicts: contradicts.length ? contradicts.slice(0, 5) : ["No factor groups contradict the reading."],
    monitor: monitor.slice(0, 6),
  };
}
