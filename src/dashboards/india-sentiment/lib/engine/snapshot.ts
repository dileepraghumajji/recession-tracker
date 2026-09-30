/**
 * Builds the full dashboard snapshot from prepared indicators, raw series,
 * the latest option chains and the point-in-time score history.
 */
import { addDays, indexAtOrBefore } from "@/platform/lib/timeseries";
import { bandsFor, type SentimentConfig } from "../config";
import { CRITICAL_FACTORS } from "../indicators";
import type { Band, ConfidenceResult, FactorId, FactorResult, IndicatorReading, OptionChainSnapshot, SeriesMap } from "../types";
import { detectDivergences, type Divergence } from "./divergence";
import { evaluateFull, evaluateMaster, type Prepared } from "./evaluate";
import { explainChange, headline, narrative, rankDrivers, type ChangeExplanation, type Drivers, type Narrative } from "./explain";
import { analogues, type AnalogueResult, type HistoryPoint } from "./history";
import { breadthRead, bondRead, currencyRead, flowRead, momentumTable, sectorRotation, volatilityRead, type BreadthRead, type ContextRead, type FlowRead, type MomentumRow, type Rotation } from "./market";
import { analyzeChain, classifyExpiries, expiryPositioningShift, pcrDivergence, summarizeExpiry, type ChainAnalysis, type ExpirySummary, type PcrDivergence, type PositioningShift } from "./options";
import { classifyRegime, type RegimeResult } from "./regime";

export interface OptionsOverview {
  underlying: string;
  spot: number;
  timestamp: string;
  synthetic: boolean;
  source: string;
  expiries: ExpirySummary[];
  /** Current-expiry analysis without per-strike rows. */
  near: Omit<ChainAnalysis, "rows"> | null;
  shift: PositioningShift;
  pcr: PcrDivergence;
}

export interface Answer {
  n: number;
  q: string;
  a: string;
  tone: "positive" | "negative" | "neutral" | "na";
}

export interface Snapshot {
  asOf: string;
  generatedAt: string;
  dataMode: "live" | "demo";
  score: number | null;
  band: Band | null;
  bands: Band[];
  confidence: ConfidenceResult;
  momentum: { d1: number | null; w1: number | null; m1: number | null; m3: number | null };
  changes: { d1: ChangeExplanation | null; w1: ChangeExplanation | null; m1: ChangeExplanation | null };
  regime: RegimeResult;
  factors: FactorResult[];
  drivers: Drivers;
  headline: string;
  narrative: Narrative;
  subScores: {
    momentum: number | null;
    breadth: number | null;
    internalStrength: number | null;
    sectorRiskAppetite: number | null;
    institutionalFlow: number | null;
    liquidity: number | null;
    creditStress: number | null;
    globalRisk: number | null;
    earningsMomentum: number | null;
    retailSpeculation: number | null;
    valuation: number | null;
  };
  readings: IndicatorReading[];
  momentumTable: MomentumRow[];
  rotation: Rotation;
  breadth: BreadthRead;
  flows: FlowRead;
  volatility: ContextRead;
  currency: ContextRead;
  bonds: ContextRead;
  options: OptionsOverview[];
  divergences: Divergence[];
  analogues: AnalogueResult[];
  answers: Answer[];
  dataQuality: { live: number; recent: number; stale: number; unavailable: number; synthetic: boolean };
}

export function optionsOverview(chain: OptionChainSnapshot, cfg: SentimentConfig): OptionsOverview | null {
  const asOf = chain.timestamp.slice(0, 10);
  const labelled = classifyExpiries(chain.records.map((r) => r.expiry), asOf);
  const opts = { window: cfg.strikeWindow, atmBandSteps: cfg.atmBandSteps, riskFreeRate: cfg.riskFreeRate };
  const analyses = labelled.map((e) => ({ e, a: analyzeChain(chain, { ...opts, expiry: e.expiry }) })).filter((x): x is { e: (typeof labelled)[number]; a: ChainAnalysis } => x.a !== null);
  if (!analyses.length) return null;
  const expiries = analyses.map(({ e, a }) => summarizeExpiry(a, e.kinds));
  const nearA = analyses.find((x) => x.e.kinds.includes("current"))?.a ?? analyses[0].a;
  const { rows: _rows, ...near } = nearA;
  return {
    underlying: chain.underlying,
    spot: chain.spot,
    timestamp: chain.timestamp,
    synthetic: chain.synthetic,
    source: chain.source,
    expiries,
    near,
    shift: expiryPositioningShift(expiries),
    pcr: pcrDivergence(nearA.totals.oiPcr, nearA.totals.premiumPcr, cfg),
  };
}

function prevTradingDay(series: SeriesMap, asOf: string): string {
  const n = series["idx:NIFTY50"]?.obs ?? [];
  const i = indexAtOrBefore(n, asOf);
  return i >= 1 ? n[i - 1].date : addDays(asOf, -1);
}

export function buildSnapshot(args: {
  prepared: Prepared[];
  series: SeriesMap;
  chains: OptionChainSnapshot[];
  /** Point-in-time history; only needed for historical analogues (omit for a fast snapshot). */
  history?: HistoryPoint[];
  cfg: SentimentConfig;
  asOf: string;
  dataMode: "live" | "demo";
}): Snapshot {
  const { prepared, series, chains, history, cfg, asOf } = args;
  const { master } = evaluateMaster(prepared, series, asOf, cfg);
  const readings = prepared.map((p) => evaluateFull(p, series, asOf, cfg));
  const byId = Object.fromEntries(readings.map((r) => [r.id, r]));
  const F = Object.fromEntries(master.factors.map((f) => [f.id, f])) as Record<FactorId, FactorResult>;

  // Sentiment momentum: same evaluation method at earlier dates.
  const past = (date: string) => evaluateMaster(prepared, series, date, cfg).master;
  const pd1 = past(prevTradingDay(series, asOf));
  const pw1 = past(addDays(asOf, -7));
  const pm1 = past(addDays(asOf, -30));
  const pm3 = past(addDays(asOf, -91));
  const d = (p: { score: number | null }) => (master.score !== null && p.score !== null ? master.score - p.score : null);
  const changes = {
    d1: explainChange("1 day", pd1, master, cfg),
    w1: explainChange("1 week", pw1, master, cfg),
    m1: explainChange("1 month", pm1, master, cfg),
  };

  const options = chains.map((c) => optionsOverview(c, cfg)).filter((x): x is OptionsOverview => x !== null);
  const niftyOpt = options.find((o) => o.underlying === "NIFTY") ?? null;
  const cur = niftyOpt?.expiries.find((e) => e.kinds.includes("current"));
  const nxt = niftyOpt?.expiries.find((e) => e.kinds.includes("next"));
  const ivTermInversion = cur?.atmIv != null && nxt?.atmIv != null && cur !== nxt ? cur.atmIv - nxt.atmIv : null;

  const regime = classifyRegime({ score: master.score, factors: F, byId, ivTermInversion });
  const drivers = rankDrivers(master.factors, byId);
  const divergences = detectDivergences(byId, cfg);
  const mom = momentumTable(series, asOf);
  const rotation = sectorRotation(mom);
  const breadth = breadthRead(series, byId, F.breadth, cfg, asOf);
  const flows = flowRead(byId, F.flows, cfg);
  const shift = niftyOpt?.shift ?? { near: null, later: null, verdict: "unavailable" as const, text: "Option-chain data unavailable." };
  const pcr = niftyOpt?.pcr ?? { oiRead: "unavailable" as const, premiumRead: "unavailable" as const, divergent: false, text: "Option-chain data unavailable." };
  const staleCritical = readings.filter((r) => r.scored && CRITICAL_FACTORS.includes(r.factor) && r.status === "STALE").map((r) => `${r.name} is stale (last ${r.date}).`);
  const labels = Object.fromEntries(master.factors.map((f) => [f.id, f.label])) as Record<FactorId, string>;
  const current = Object.fromEntries(master.factors.map((f) => [f.id, f.score])) as Record<FactorId, number | null>;
  const cluster = (fid: FactorId, cid: string) => F[fid].clusters.find((c) => c.id === cid)?.score ?? null;
  const vol = volatilityRead(byId, F, cfg);
  const cur_ = currencyRead(byId);
  const bnd = bondRead(byId);

  const snap: Snapshot = {
    asOf,
    generatedAt: new Date().toISOString(),
    dataMode: args.dataMode,
    score: master.score,
    band: master.band,
    bands: bandsFor(cfg),
    confidence: master.confidence,
    momentum: { d1: d(pd1), w1: d(pw1), m1: d(pm1), m3: d(pm3) },
    changes,
    regime,
    factors: master.factors,
    drivers,
    headline: headline(master.score, master.band, drivers, F.derivatives, shift, master.confidence.score),
    narrative: narrative({ score: master.score, band: master.band, factors: master.factors, drivers, weekChange: changes.w1, divergences, pcr, thresholds: cfg.thresholds, staleCritical }),
    subScores: {
      momentum: F.momentum.score,
      breadth: F.breadth.score,
      internalStrength: cluster("breadth", "internals"),
      sectorRiskAppetite: cluster("momentum", "sector_rotation"),
      institutionalFlow: F.flows.score,
      liquidity: F.liquidity.score,
      creditStress: F.credit.score === null ? null : 100 - F.credit.score,
      globalRisk: F.global.score,
      earningsMomentum: F.earnings.score,
      retailSpeculation: F.retail.score,
      valuation: F.valuation.score,
    },
    readings,
    momentumTable: mom,
    rotation,
    breadth,
    flows,
    volatility: vol,
    currency: cur_,
    bonds: bnd,
    options,
    divergences,
    analogues: history ? analogues(history, current, labels) : [],
    answers: [],
    dataQuality: {
      live: readings.filter((r) => r.status === "LIVE").length,
      recent: readings.filter((r) => r.status === "RECENT").length,
      stale: readings.filter((r) => r.status === "STALE").length,
      unavailable: readings.filter((r) => r.status === "UNAVAILABLE").length,
      synthetic: readings.some((r) => r.synthetic),
    },
  };
  snap.answers = buildAnswers(snap, byId, F, niftyOpt);
  return snap;
}

// ------------------------------------------------------------------ 20 questions

const cr = (x: number | null | undefined) => (x === null || x === undefined ? "n/a" : `₹${Math.round(x).toLocaleString("en-IN")} Cr`);
export const zone = (z: [number, number] | null) => (!z ? "n/a" : z[0] === z[1] ? `${z[0]}` : `${z[0]}–${z[1]}`);
const sg = (x: number | null | undefined, dp = 1) => (x === null || x === undefined ? "n/a" : `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(dp)}`);

function buildAnswers(s: Snapshot, byId: Record<string, IndicatorReading>, F: Record<FactorId, FactorResult>, opt: OptionsOverview | null): Answer[] {
  const side = s.score === null ? 0 : s.score > 55 ? 1 : s.score < 45 ? -1 : Math.sign(byId["nifty_ret_1m"]?.value ?? 0);
  const moveWord = side > 0 ? "risk-on move" : side < 0 ? "risk-off move" : "current reading";
  const confirm = (id: FactorId, extra = ""): Pick<Answer, "a" | "tone"> => {
    const f = F[id];
    if (f.score === null) return { a: `${f.label}: unavailable.`, tone: "na" };
    const fs = f.score > 55 ? 1 : f.score < 45 ? -1 : 0;
    const verdict = side === 0 ? (fs === 0 ? "Neutral, consistent with a neutral market" : fs > 0 ? "Leans risk-on" : "Leans risk-off") : fs === side ? `Yes — confirms the ${moveWord}` : fs === 0 ? "Neutral — neither confirms nor contradicts" : `No — contradicts the ${moveWord}`;
    return { a: `${verdict} (${f.label} ${f.score.toFixed(0)}/100).${extra ? " " + extra : ""}`, tone: side === 0 ? "neutral" : fs === side ? "positive" : fs === 0 ? "neutral" : "negative" };
  };
  const near = opt?.near ?? null;
  const band = s.band;
  const active = s.divergences.filter((x) => x.active);
  const ans: Omit<Answer, "n">[] = [
    { q: "What is Indian market sentiment?", a: s.score === null || !band ? "Insufficient data for a score." : `${s.score.toFixed(0)}/100 — ${band.emoji} ${band.label.toUpperCase()} (${band.cls}). Model confidence ${s.confidence.score}/100.`, tone: s.score === null ? "na" : "neutral" },
    { q: "Is sentiment improving or deteriorating?", a: s.momentum.w1 === null ? "No 1-week comparison available." : `${s.momentum.w1 > 1 ? "Improving" : s.momentum.w1 < -1 ? "Deteriorating" : "Stable"}: ${sg(s.momentum.w1)} over 1W, ${sg(s.momentum.m1)} over 1M, ${sg(s.momentum.d1)} over 1D.`, tone: s.momentum.w1 === null ? "na" : s.momentum.w1 > 1 ? "positive" : s.momentum.w1 < -1 ? "negative" : "neutral" },
    { q: "What are the biggest drivers?", a: `Positive: ${s.drivers.positive.slice(0, 3).map((x) => x.label).join(", ") || "none"}. Negative: ${s.drivers.negative.slice(0, 3).map((x) => x.label).join(", ") || "none"}.`, tone: "neutral" },
    { q: "Is the move broad-based?", a: F.breadth.score === null ? "Breadth data unavailable." : `${s.breadth.broadBased ? "Yes" : "No"} — breadth ${F.breadth.score.toFixed(0)}/100. ${s.breadth.divergence.label}.`, tone: F.breadth.score === null ? "na" : s.breadth.broadBased ? "positive" : "negative" },
    { q: "What are FIIs and DIIs doing?", a: s.flows.label === "Unavailable" ? "Flow data unavailable." : `${s.flows.label}. FII 1M ${cr(s.flows.fii.m1)}, DII 1M ${cr(s.flows.dii.m1)}.${s.flows.detections[0] ? " " + s.flows.detections[0] : ""}`, tone: s.flows.label === "Unavailable" ? "na" : F.flows.score! >= 55 ? "positive" : F.flows.score! <= 45 ? "negative" : "neutral" },
    { q: "What does the option chain indicate?", a: F.derivatives.score === null && F.premium_flow.score === null ? "Option data unavailable." : `Positioning ${F.derivatives.score?.toFixed(0) ?? "n/a"}/100, premium flow ${F.premium_flow.score?.toFixed(0) ?? "n/a"}/100${near?.pressure.normalized != null ? `; NIFTY net premium pressure ${sg(near.pressure.normalized, 2)}` : ""}.`, tone: F.derivatives.score === null ? "na" : F.derivatives.score >= 55 ? "positive" : F.derivatives.score <= 45 ? "negative" : "neutral" },
    { q: "What is total Call Premium vs Put Premium?", a: near ? `NIFTY current expiry (±${near.window || "all"} strikes): calls ₹${(near.totals.callPremium / 1e7).toFixed(0)} Cr vs puts ₹${(near.totals.putPremium / 1e7).toFixed(0)} Cr — premium PCR ${near.totals.premiumPcr?.toFixed(2) ?? "n/a"}.` : "Option data unavailable.", tone: near ? "neutral" : "na" },
    { q: "What is OI PCR vs Premium PCR?", a: near ? `OI PCR ${near.totals.oiPcr?.toFixed(2) ?? "n/a"} (${opt!.pcr.oiRead}) vs premium PCR ${near.totals.premiumPcr?.toFixed(2) ?? "n/a"} (${opt!.pcr.premiumRead})${opt!.pcr.divergent ? " — POSITIONING DIVERGENCE" : ""}.` : "Option data unavailable.", tone: near ? (opt!.pcr.divergent ? "negative" : "neutral") : "na" },
    { q: "Where are the major OI concentration zones?", a: near ? `Potential support ${zone(near.zones.support)} (put OI); potential resistance ${zone(near.zones.resistance)} (call OI). Spot ${near.spot.toFixed(0)}.` : "Option data unavailable.", tone: near ? "neutral" : "na" },
    { q: "What is Max Pain?", a: near?.maxPain ? `${near.maxPain.strike} for ${near.expiry}; spot is ${sg(near.maxPain.distancePct)}% away. A theoretical positioning metric, not an expiry forecast.` : "Option data unavailable.", tone: near?.maxPain ? "neutral" : "na" },
    { q: "What is happening in the far-month expiry?", a: opt ? opt.shift.text : "Option data unavailable.", tone: !opt || opt.shift.verdict === "unavailable" ? "na" : opt.shift.verdict === "disagree" || opt.shift.verdict === "concentrated_near" ? "negative" : "neutral" },
    { q: "Is volatility confirming the move?", ...confirm("volatility", s.volatility.text) },
    { q: "Is INR confirming the move?", ...confirm("currency") },
    { q: "Are bonds confirming the move?", ...confirm("bonds") },
    { q: "Is credit confirming the move?", ...confirm("credit", s.subScores.creditStress !== null ? `Credit Stress Score ${s.subScores.creditStress.toFixed(0)}.` : "") },
    { q: "Is global risk appetite confirming the move?", ...confirm("global") },
    { q: "Are valuations stretched?", a: F.valuation.score === null ? "Valuation data unavailable." : `${F.valuation.score <= 30 ? "Yes — stretched" : F.valuation.score <= 45 ? "Somewhat elevated" : F.valuation.score >= 65 ? "No — below historical norms" : "Near historical norms"} (valuation ${F.valuation.score.toFixed(0)}/100${byId["nifty_pe"]?.available ? `; P/E ${byId["nifty_pe"].value?.toFixed(1)}x, ${byId["nifty_pe"].pct10y?.toFixed(0) ?? "n/a"}th pct 10Y` : ""}).`, tone: F.valuation.score === null ? "na" : F.valuation.score <= 35 ? "negative" : "neutral" },
    { q: "Is earnings momentum improving?", a: F.earnings.score === null ? "Earnings data unavailable." : `${F.earnings.score >= 55 ? "Yes" : F.earnings.score <= 45 ? "No" : "Flat"} — earnings momentum ${F.earnings.score.toFixed(0)}/100${byId["fwd_eps_3m"]?.available ? `; forward EPS ${sg(byId["fwd_eps_3m"].value)}% over 3M` : ""}.`, tone: F.earnings.score === null ? "na" : F.earnings.score >= 55 ? "positive" : F.earnings.score <= 45 ? "negative" : "neutral" },
    { q: "Are market internals confirming the index?", a: s.subScores.internalStrength === null ? "Internals data unavailable." : `${(() => { const n = byId["nifty_ret_1m"]?.value ?? 0; const i = s.subScores.internalStrength as number; return (n >= 0) === (i >= 50) ? "Yes" : "No"; })()} — Market Internal Strength ${s.subScores.internalStrength.toFixed(0)}/100 vs NIFTY ${sg(byId["nifty_ret_1m"]?.value)}% (1M).`, tone: s.subScores.internalStrength === null ? "na" : "neutral" },
    { q: "What are the major divergences?", a: active.length ? active.map((x) => `${x.kind === "bullish" ? "Bullish" : "Bearish"}: ${x.label}`).join("; ") + (opt?.pcr.divergent ? "; Positioning divergence (OI vs premium PCR)" : "") + "." : opt?.pcr.divergent ? "Positioning divergence (OI vs premium PCR)." : "No active divergences.", tone: active.length || opt?.pcr.divergent ? "negative" : "neutral" },
  ];
  return ans.map((x, i) => ({ n: i + 1, ...x }));
}
