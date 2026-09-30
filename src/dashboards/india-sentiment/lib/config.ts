/**
 * Model configuration for the India Market Sentiment Terminal.
 *
 * Every weight and threshold is a judgement-based starting point (not fitted to
 * past returns, to avoid overfitting) and can be overridden:
 *   - globally with INDIA_SENTIMENT_CONFIG_OVERRIDES (JSON, shape `ConfigOverrides`)
 *   - per browser from the dashboard's Settings page (cookie).
 */
import { z } from "zod";
import { FACTOR_IDS, type Band, type FactorId } from "./types";

export interface FactorConfig {
  id: FactorId;
  label: string;
  weight: number;
  description: string;
  /** Cluster weights inside the factor (correlated indicators share one cluster). */
  clusters: { id: string; label: string; weight: number }[];
}

export interface SentimentConfig {
  factors: Record<FactorId, FactorConfig>;
  /** Cut points between the seven bands (ascending). */
  thresholds: [number, number, number, number, number, number];
  /** Maximum share of the master score any single factor may carry after renormalisation. */
  maxFactorShare: number;
  /** Trailing window for percentile-based indicator scores. */
  percentileYears: number;
  /** Minimum history before a percentile score is trusted. */
  minHistoryYears: number;
  /** Strikes either side of ATM used for premium / PCR analytics (0 = whole chain). */
  strikeWindow: number;
  /** Strikes either side of ATM treated as "ATM" for moneyness buckets. */
  atmBandSteps: number;
  /** OI PCR above = bullish positioning, below = bearish (conventional reading). */
  oiPcrBullish: number;
  oiPcrBearish: number;
  /** Premium PCR above = put premium dominates (bearish-leaning), below = call premium dominates. */
  premiumPcrBearish: number;
  premiumPcrBullish: number;
  /** Annual risk-free rate for option deltas (decimal). */
  riskFreeRate: number;
  /** Points of 1D / 1W sentiment change that trigger a change explanation. */
  changeExplainThreshold: number;
  /** Market-move threshold (%) used by the divergence engine over 1M. */
  divergenceMovePct: number;
}

const f = (id: FactorId, label: string, weight: number, description: string, clusters: [string, string, number][]): FactorConfig => ({
  id,
  label,
  weight,
  description,
  clusters: clusters.map(([cid, clabel, w]) => ({ id: cid, label: clabel, weight: w })),
});

export const DEFAULT_CONFIG: SentimentConfig = {
  factors: {
    momentum: f("momentum", "Equity Momentum", 10, "Trend, multi-horizon returns and distance from highs of NIFTY/SENSEX, broad-market indices and sector risk appetite.", [
      ["nifty_trend", "Index trend (DMA position/slope)", 30],
      ["nifty_returns", "Index returns (1M–6M)", 25],
      ["broad_market", "Mid/small-cap participation", 20],
      ["sector_rotation", "Sector risk appetite (cyclical vs defensive)", 15],
      ["highs", "Distance from 52-week high", 10],
    ]),
    breadth: f("breadth", "Market Breadth", 15, "Participation across the NSE universe: advance/decline, % above moving averages, highs/lows, internals and thrust.", [
      ["advance_decline", "Advance/decline", 25],
      ["dma_participation", "% of stocks above DMAs", 30],
      ["highs_lows", "New highs vs new lows", 15],
      ["internals", "Market internals (value, A/D momentum, RS breadth)", 20],
      ["thrust", "Breadth thrust", 10],
    ]),
    derivatives: f("derivatives", "Derivatives Positioning", 10, "Open-interest positioning: OI PCR, FII index futures and whether positioning persists into later expiries.", [
      ["oi_pcr", "OI put/call ratio", 40],
      ["fii_futures", "FII index futures positioning", 35],
      ["expiry_structure", "Later-expiry positioning", 25],
    ]),
    premium_flow: f("premium_flow", "Option Premium Flow", 8, "Where option money is traded: net premium pressure, premium PCR and likely buying vs writing.", [
      ["pressure", "Net premium pressure", 45],
      ["premium_pcr", "Premium put/call ratio", 25],
      ["buy_write", "Likely writing balance", 30],
    ]),
    volatility: f("volatility", "Volatility", 7, "India VIX level and change, implied vs realised volatility and put skew. Interpreted in context, not as fear by itself.", [
      ["vix_level", "India VIX level", 35],
      ["vix_change", "India VIX change", 20],
      ["iv_rv", "Implied minus realised volatility", 20],
      ["skew", "IV skew (25Δ put − call)", 25],
    ]),
    flows: f("flows", "FII/DII Flows", 10, "Cash-market flows of foreign and domestic institutions and FII debt flows.", [
      ["fii_cash", "FII cash flows", 55],
      ["dii_cash", "DII cash flows", 25],
      ["fii_debt", "FII debt flows", 20],
    ]),
    liquidity: f("liquidity", "Liquidity", 7, "RBI system liquidity, money-market rates vs repo, bank credit/deposit growth and government cash balances.", [
      ["system", "System liquidity (LAF)", 40],
      ["money_market", "Money-market rates vs repo", 30],
      ["credit_deposit", "Bank credit & deposit growth", 20],
      ["govt_cash", "Government cash balance", 10],
    ]),
    currency: f("currency", "Currency", 5, "USD/INR move relative to its own history, INR volatility and forex reserves.", [
      ["inr_move", "USD/INR move", 45],
      ["inr_vol", "INR volatility", 30],
      ["reserves", "Forex reserves", 25],
    ]),
    bonds: f("bonds", "Bond Market", 5, "G-Sec yield changes, curve shape and the India–US yield spread.", [
      ["yield_change", "10Y G-Sec change", 45],
      ["curve", "Yield curve (10Y−2Y)", 30],
      ["india_us", "India–US 10Y spread", 25],
    ]),
    credit: f("credit", "Credit", 5, "Corporate bond spreads, short-term funding spreads and bank asset quality.", [
      ["corp_spreads", "Corporate bond spreads", 55],
      ["short_term", "CD/CP funding spreads", 20],
      ["bank_health", "Bank asset quality & funding", 25],
    ]),
    global: f("global", "Global Risk Appetite", 5, "Global equities, US volatility and credit, and dollar/rates pressure.", [
      ["us_equity", "US equities", 30],
      ["world_equity", "Global & EM equities", 25],
      ["vol_credit", "US volatility & credit spreads", 30],
      ["dollar_rates", "Dollar & US yields", 15],
    ]),
    commodities: f("commodities", "Commodities", 4, "Crude oil (key for India's inflation, INR and current account), gold as a haven, industrial metals.", [
      ["crude", "Crude oil", 50],
      ["gold", "Precious metals (haven demand)", 20],
      ["industrial", "Industrial metals", 20],
      ["gas", "Natural gas", 10],
    ]),
    valuation: f("valuation", "Valuation", 4, "How much optimism is priced in: P/E, P/B and equity risk premium. High valuation lowers this factor; it is not a timing signal.", [
      ["pe", "P/E (trailing & forward)", 40],
      ["pb", "P/B", 20],
      ["erp", "Equity risk premium", 40],
    ]),
    earnings: f("earnings", "Earnings", 3, "Earnings momentum, separate from price: forward EPS revisions, upgrades vs downgrades, growth and surprises.", [
      ["revisions", "EPS revisions", 60],
      ["growth", "Earnings growth & surprise", 40],
    ]),
    macro: f("macro", "Macro Economy", 4, "Growth (IIP, PMI, GST, GDP), inflation, external balance and fiscal position.", [
      ["growth", "Growth", 45],
      ["inflation", "Inflation", 30],
      ["external", "External balance", 15],
      ["fiscal", "Fiscal", 10],
    ]),
    retail: f("retail", "Retail / MF / IPO", 3, "Retail participation and speculative activity: MF & SIP flows, demat additions, F&O participation and IPO activity.", [
      ["mf", "Mutual fund & SIP flows", 40],
      ["participation", "Retail participation", 25],
      ["ipo", "IPO / SME IPO activity", 35],
    ]),
  },
  thresholds: [20, 35, 45, 55, 65, 80],
  maxFactorShare: 0.2,
  percentileYears: 10,
  minHistoryYears: 3,
  strikeWindow: 10,
  atmBandSteps: 1,
  oiPcrBullish: 1.1,
  oiPcrBearish: 0.8,
  premiumPcrBearish: 1.15,
  premiumPcrBullish: 0.85,
  riskFreeRate: 0.065,
  changeExplainThreshold: 5,
  divergenceMovePct: 2,
};

export function bandsFor(cfg: SentimentConfig): Band[] {
  const [a, b, c, d, e, g] = cfg.thresholds;
  return [
    { max: a, label: "Extreme Fear", cls: "EXTREME FEAR", emoji: "🔴", tone: "fear-strong" },
    { max: b, label: "Fear", cls: "FEAR", emoji: "🔴", tone: "fear" },
    { max: c, label: "Mild Fear", cls: "FEAR", emoji: "🟡", tone: "fear" },
    { max: d, label: "Neutral", cls: "NEUTRAL", emoji: "🟡", tone: "neutral" },
    { max: e, label: "Mild Greed", cls: "GREED", emoji: "🟡", tone: "greed" },
    { max: g, label: "Greed", cls: "GREED", emoji: "🟢", tone: "greed" },
    { max: 100.0001, label: "Extreme Greed", cls: "EXTREME GREED", emoji: "🟢", tone: "greed-strong" },
  ];
}

export function bandFor(score: number | null, cfg: SentimentConfig): Band | null {
  if (score === null) return null;
  return bandsFor(cfg).find((b) => score < b.max) ?? null;
}

// ---------------------------------------------------------------- overrides

const num = (lo: number, hi: number) => z.number().finite().min(lo).max(hi);

export const OverridesSchema = z
  .object({
    factorWeights: z.partialRecord(z.enum(FACTOR_IDS), num(0, 100)).optional(),
    thresholds: z.tuple([num(0, 100), num(0, 100), num(0, 100), num(0, 100), num(0, 100), num(0, 100)]).optional(),
    maxFactorShare: num(0.05, 1).optional(),
    percentileYears: num(3, 20).optional(),
    strikeWindow: z.number().int().min(0).max(60).optional(),
    oiPcrBullish: num(0.1, 5).optional(),
    oiPcrBearish: num(0.1, 5).optional(),
    premiumPcrBearish: num(0.1, 5).optional(),
    premiumPcrBullish: num(0.1, 5).optional(),
    changeExplainThreshold: num(1, 50).optional(),
    divergenceMovePct: num(0.2, 20).optional(),
  })
  .strip();
export type ConfigOverrides = z.infer<typeof OverridesSchema>;

export function parseOverrides(raw: string | null | undefined): ConfigOverrides | null {
  if (!raw || raw.length > 4000) return null;
  try {
    const r = OverridesSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export function applyOverrides(base: SentimentConfig, ov: ConfigOverrides | null): SentimentConfig {
  if (!ov) return base;
  const cfg: SentimentConfig = { ...base, factors: { ...base.factors } };
  for (const [id, w] of Object.entries(ov.factorWeights ?? {}) as [FactorId, number][]) cfg.factors[id] = { ...cfg.factors[id], weight: w };
  if (ov.thresholds) {
    const t = [...ov.thresholds].sort((a, b) => a - b) as SentimentConfig["thresholds"];
    cfg.thresholds = t;
  }
  for (const k of ["maxFactorShare", "percentileYears", "strikeWindow", "oiPcrBullish", "oiPcrBearish", "premiumPcrBearish", "premiumPcrBullish", "changeExplainThreshold", "divergenceMovePct"] as const) {
    if (ov[k] !== undefined) (cfg as unknown as Record<string, number>)[k] = ov[k] as number;
  }
  return cfg;
}

/** Env overrides first, then per-request (cookie) overrides on top. */
export function resolveConfig(requestOverrides?: string | null): SentimentConfig {
  const env = applyOverrides(DEFAULT_CONFIG, parseOverrides(process.env.INDIA_SENTIMENT_CONFIG_OVERRIDES));
  return applyOverrides(env, parseOverrides(requestOverrides));
}

export function configHash(cfg: SentimentConfig): string {
  const s = JSON.stringify([Object.values(cfg.factors).map((x) => x.weight), cfg.thresholds, cfg.maxFactorShare, cfg.percentileYears, cfg.strikeWindow, cfg.oiPcrBullish, cfg.oiPcrBearish, cfg.premiumPcrBearish, cfg.premiumPcrBullish, cfg.changeExplainThreshold, cfg.divergenceMovePct]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
