/**
 * Model configuration: category weights per composite score, cluster weights
 * within categories, overall-mix weights and signal thresholds.
 *
 * These are initial, judgement-based weights (not fitted to past recessions, to
 * avoid overfitting). They can be overridden per request (UI "Model settings")
 * or globally via the MODEL_CONFIG_OVERRIDES env variable (JSON, same shape as
 * `ModelOverrides`).
 */
import type { ScoreId } from "./types";

export interface ClusterConfig {
  id: string;
  label: string;
  weight: number;
}

export interface CategoryConfig {
  id: string;
  label: string;
  weight: number;
  description: string;
  clusters: ClusterConfig[];
}

export interface ScoreConfig {
  id: ScoreId;
  label: string;
  description: string;
  categories: CategoryConfig[];
}

export interface ModelConfig {
  scores: Record<ScoreId, ScoreConfig>;
  overall: Record<ScoreId, number>;
  /** Stress bands on the 0-100 scale. */
  bands: { watch: number; elevated: number; severe: number };
  /** Minimum years of history before a percentile-based stress is used. */
  minHistoryYears: number;
  /** Stress-point change over ~3 months that counts as a trend. */
  trendThreshold: number;
}

const c = (id: string, label: string, weight: number): ClusterConfig => ({ id, label, weight });

export const DEFAULT_CONFIG: ModelConfig = {
  scores: {
    recession: {
      id: "recession",
      label: "Recession Stress",
      description:
        "How consistent current growth, labour, credit, curve, housing and consumer conditions are with historical pre-recession / early-recession stress. Not a probability.",
      categories: [
        {
          id: "growth_labor",
          label: "Growth / Labor",
          weight: 30,
          description: "Unemployment dynamics (Sahm), claims, payrolls, labour demand, business surveys and real activity.",
          clusters: [
            c("unemployment", "Unemployment (Sahm, 12M change)", 25),
            c("claims", "Jobless claims", 15),
            c("payrolls", "Payroll growth", 15),
            c("labor_demand", "Labour demand (JOLTS)", 10),
            c("surveys", "Business surveys (ISM / regional Fed)", 15),
            c("activity", "Real activity (IP, retail, PCE, GDP)", 20),
          ],
        },
        {
          id: "credit_financial",
          label: "Credit / Financial",
          weight: 25,
          description: "Corporate credit spreads, financial conditions and bank lending standards.",
          clusters: [
            c("high_yield", "High-yield credit", 30),
            c("investment_grade", "Investment-grade credit", 20),
            c("conditions", "Financial conditions (NFCI)", 25),
            c("lending", "Bank lending standards", 25),
          ],
        },
        {
          id: "curve_rates",
          label: "Yield Curve / Rates",
          weight: 15,
          description: "Curve inversion (10Y-3M, 10Y-2Y), inversion memory, expected easing, term premium.",
          clusters: [
            c("inversion", "Current curve slope", 45),
            c("inversion_memory", "Recent inversion depth", 20),
            c("easing", "Expected policy easing (2Y-3M)", 25),
            c("term_premium", "Term premium", 10),
          ],
        },
        {
          id: "housing",
          label: "Housing",
          weight: 10,
          description: "Construction activity, home sales, affordability and inventory.",
          clusters: [
            c("construction", "Starts & permits", 40),
            c("sales", "Home sales", 25),
            c("affordability", "Affordability & mortgage rates", 20),
            c("inventory", "Inventory", 15),
          ],
        },
        {
          id: "consumer",
          label: "Consumer",
          weight: 10,
          description: "Sentiment, credit delinquencies, income and debt service.",
          clusters: [
            c("sentiment", "Sentiment & confidence", 25),
            c("credit_health", "Delinquencies", 30),
            c("income", "Income & saving", 25),
            c("debt_service", "Debt service", 20),
          ],
        },
        {
          id: "equity",
          label: "Equity / Market",
          weight: 5,
          description: "Equity drawdowns, momentum and implied volatility.",
          clusters: [c("drawdown", "Drawdowns", 45), c("momentum", "Momentum", 20), c("volatility", "Implied volatility", 35)],
        },
        {
          id: "inflation_energy",
          label: "Inflation / Energy",
          weight: 5,
          description: "Energy shocks and sticky core inflation constrain the policy response to a slowdown.",
          clusters: [c("energy", "Oil price shock", 50), c("core_inflation", "Core inflation", 50)],
        },
      ],
    },
    inflation: {
      id: "inflation",
      label: "Inflation Stress",
      description: "Pressure from realised inflation, market and survey expectations, wages and energy, relative to the 2% target.",
      categories: [
        {
          id: "realized",
          label: "Actual inflation",
          weight: 40,
          description: "CPI and PCE, headline and core. Headline and core are pooled separately; CPI and PCE share a cluster to avoid double counting.",
          clusters: [c("core", "Core (CPI, PCE)", 60), c("headline", "Headline (CPI, PCE)", 40)],
        },
        {
          id: "market_expectations",
          label: "Market expectations",
          weight: 20,
          description: "5Y and 10Y breakeven inflation.",
          clusters: [c("breakevens", "Breakevens", 100)],
        },
        {
          id: "survey_expectations",
          label: "Survey expectations",
          weight: 15,
          description: "University of Michigan household expectations.",
          clusters: [c("survey", "UMich 1Y", 100)],
        },
        { id: "wages", label: "Wages", weight: 10, description: "Average hourly earnings growth.", clusters: [c("wages", "AHE YoY", 100)] },
        {
          id: "energy",
          label: "Energy",
          weight: 15,
          description: "Oil (WTI/Brent pooled) and natural gas YoY price changes.",
          clusters: [c("oil", "Oil", 70), c("natgas", "Natural gas", 30)],
        },
      ],
    },
    financial: {
      id: "financial",
      label: "Financial Market Stress",
      description: "Stress priced in credit, volatility, equities, rates and the dollar, plus the Chicago Fed's broad conditions index.",
      categories: [
        {
          id: "credit",
          label: "Credit spreads",
          weight: 35,
          description: "HY, CCC, IG, BBB and Baa spreads; HY widening speed.",
          clusters: [c("high_yield", "High yield", 60), c("investment_grade", "Investment grade", 40)],
        },
        { id: "conditions", label: "Financial conditions", weight: 20, description: "Chicago Fed NFCI / ANFCI (pooled).", clusters: [c("nfci", "NFCI", 100)] },
        { id: "volatility", label: "Equity volatility", weight: 15, description: "VIX.", clusters: [c("vix", "VIX", 100)] },
        { id: "equity", label: "Equity drawdowns", weight: 15, description: "S&P 500, Nasdaq-100, Russell 2000 proxy.", clusters: [c("drawdown", "Drawdowns", 100)] },
        {
          id: "rates",
          label: "Rates / term premium",
          weight: 10,
          description: "Term premium and 10Y yield volatility.",
          clusters: [c("term_premium", "Term premium", 50), c("rates_vol", "Rates volatility", 50)],
        },
        { id: "dollar", label: "Dollar", weight: 5, description: "Broad dollar YoY.", clusters: [c("dollar", "Dollar", 100)] },
      ],
    },
  },
  overall: { recession: 50, inflation: 25, financial: 25 },
  bands: { watch: 50, elevated: 75, severe: 90 },
  minHistoryYears: 1,
  trendThreshold: 5,
};

export interface ModelOverrides {
  /** e.g. { recession: { growth_labor: 35, credit_financial: 20 } } */
  categoryWeights?: Partial<Record<ScoreId, Record<string, number>>>;
  overall?: Partial<Record<ScoreId, number>>;
}

function sanitizeWeight(x: unknown): number | null {
  const n = typeof x === "number" ? x : typeof x === "string" ? Number(x) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 1000) return null;
  return n;
}

export function applyOverrides(base: ModelConfig, ov: ModelOverrides | null | undefined): ModelConfig {
  if (!ov) return base;
  const cfg: ModelConfig = structuredClone(base);
  for (const sid of Object.keys(cfg.scores) as ScoreId[]) {
    const cw = ov.categoryWeights?.[sid];
    if (!cw) continue;
    for (const cat of cfg.scores[sid].categories) {
      const w = sanitizeWeight(cw[cat.id]);
      if (w !== null) cat.weight = w;
    }
  }
  if (ov.overall) {
    for (const sid of Object.keys(cfg.overall) as ScoreId[]) {
      const w = sanitizeWeight(ov.overall[sid]);
      if (w !== null) cfg.overall[sid] = w;
    }
  }
  return cfg;
}

/** Parses overrides from untrusted JSON (query string or env). Invalid input -> null. */
export function parseOverrides(raw: string | null | undefined): ModelOverrides | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== "object") return null;
    const out: ModelOverrides = {};
    const o = obj as Record<string, unknown>;
    if (o.categoryWeights && typeof o.categoryWeights === "object") {
      out.categoryWeights = {};
      for (const [sid, v] of Object.entries(o.categoryWeights as Record<string, unknown>)) {
        if (!["recession", "inflation", "financial"].includes(sid) || !v || typeof v !== "object") continue;
        const rec: Record<string, number> = {};
        for (const [k, w] of Object.entries(v as Record<string, unknown>)) {
          const s = sanitizeWeight(w);
          if (s !== null && /^[a-z_]{1,40}$/.test(k)) rec[k] = s;
        }
        out.categoryWeights[sid as ScoreId] = rec;
      }
    }
    if (o.overall && typeof o.overall === "object") {
      out.overall = {};
      for (const [sid, w] of Object.entries(o.overall as Record<string, unknown>)) {
        const s = sanitizeWeight(w);
        if (s !== null && ["recession", "inflation", "financial"].includes(sid)) out.overall[sid as ScoreId] = s;
      }
    }
    return out;
  } catch {
    return null;
  }
}

export function resolveConfig(requestOverrides?: string | null): ModelConfig {
  const envCfg = applyOverrides(DEFAULT_CONFIG, parseOverrides(process.env.MODEL_CONFIG_OVERRIDES));
  return applyOverrides(envCfg, parseOverrides(requestOverrides));
}

export function configHash(cfg: ModelConfig): string {
  const parts: string[] = [];
  for (const s of Object.values(cfg.scores)) for (const cat of s.categories) parts.push(`${s.id}.${cat.id}=${cat.weight}`);
  for (const [k, v] of Object.entries(cfg.overall)) parts.push(`o.${k}=${v}`);
  return parts.join(",");
}
