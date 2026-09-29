/**
 * Regime classification from combinations of sub-scores. Every rule is
 * evaluated and reported, so the classification is auditable. The regime is a
 * description of current conditions, not a forecast.
 */
import type { ScoreId } from "../types";

export type RegimeId =
  | "expansion"
  | "late_cycle"
  | "growth_slowdown"
  | "recession_stress"
  | "deflationary_stress"
  | "stagflationary_stress"
  | "financial_stress"
  | "inflationary_overheating"
  | "insufficient_data";

export const REGIME_LABEL: Record<RegimeId, string> = {
  expansion: "Expansion",
  late_cycle: "Late-cycle",
  growth_slowdown: "Growth slowdown",
  recession_stress: "Recession stress",
  deflationary_stress: "Deflationary stress",
  stagflationary_stress: "Stagflationary stress",
  financial_stress: "Financial stress",
  inflationary_overheating: "Inflationary overheating",
  insufficient_data: "Insufficient data",
};

export interface RegimeInputs {
  recession: number | null;
  inflation: number | null;
  financial: number | null;
  labor: number | null;
  activity: number | null;
  credit: number | null;
  curve: number | null;
  breakevens: number | null;
  confluenceStressed: number;
  longEndPressure: number | null;
  confidence: number;
}

export interface RegimeRule {
  id: RegimeId;
  label: string;
  condition: string;
  matched: boolean;
  strength: number;
  evidence: string[];
}

export interface RegimeResult {
  primary: RegimeId;
  label: string;
  qualifiers: string[];
  display: string;
  rules: RegimeRule[];
  description: string;
}

const DESCRIPTIONS: Record<RegimeId, string> = {
  expansion: "Growth, credit and inflation indicators are broadly in normal ranges.",
  late_cycle: "Growth is holding up, but some classic late-cycle features (curve inversion history, firm inflation, tighter credit) are present.",
  growth_slowdown: "Growth-related stress is rising, without broad confirmation from credit and labour indicators.",
  recession_stress: "Multiple independent growth, labour and credit indicators are simultaneously consistent with recessionary stress.",
  deflationary_stress: "Weak growth together with low / falling inflation and inflation expectations.",
  stagflationary_stress: "Elevated inflation pressure coincides with weakening growth.",
  financial_stress: "Stress is concentrated in financial markets (spreads, volatility, conditions).",
  inflationary_overheating: "Inflation pressure is high while growth and labour indicators remain firm.",
  insufficient_data: "Too little fresh data to classify the regime reliably.",
};

const n = (x: number | null) => (x === null ? "n/a" : x.toFixed(0));

export function classifyRegime(x: RegimeInputs): RegimeResult {
  const R = x.recession ?? 0;
  const I = x.inflation ?? 0;
  const F = x.financial ?? 0;
  const labor = x.labor ?? 0;
  const credit = x.credit ?? 0;
  const rules: RegimeRule[] = [];
  const add = (id: RegimeId, condition: string, matched: boolean, strength: number, evidence: string[]) =>
    rules.push({ id, label: REGIME_LABEL[id], condition, matched, strength: Math.max(0, Math.min(1, strength)), evidence });

  add(
    "financial_stress",
    "Financial Market Stress >= 65",
    F >= 65,
    (F - 50) / 40,
    [`Financial stress ${n(x.financial)}`, `Credit category ${n(x.credit)}`],
  );
  add(
    "recession_stress",
    "Recession Stress >= 60 AND (labour >= 60 OR credit >= 60) AND >= 4 of 7 confluence categories at Watch or worse",
    R >= 60 && (labor >= 60 || credit >= 60) && x.confluenceStressed >= 4,
    (R - 50) / 35,
    [`Recession stress ${n(x.recession)}`, `Labour ${n(x.labor)}`, `Credit ${n(x.credit)}`, `${x.confluenceStressed}/7 categories stressed`],
  );
  add(
    "stagflationary_stress",
    "Inflation Stress >= 60 AND Recession Stress >= 50",
    I >= 60 && R >= 50,
    Math.min(I - 50, R - 40) / 35,
    [`Inflation stress ${n(x.inflation)}`, `Recession stress ${n(x.recession)}`],
  );
  add(
    "deflationary_stress",
    "Recession Stress >= 55 AND Inflation Stress <= 25",
    R >= 55 && x.inflation !== null && I <= 25,
    Math.min(R - 45, 35 - I) / 35,
    [`Recession stress ${n(x.recession)}`, `Inflation stress ${n(x.inflation)}`, `Breakeven stress ${n(x.breakevens)}`],
  );
  add(
    "inflationary_overheating",
    "Inflation Stress >= 60 AND Recession Stress < 40 AND labour < 50",
    I >= 60 && R < 40 && labor < 50,
    (I - 50) / 35,
    [`Inflation stress ${n(x.inflation)}`, `Recession stress ${n(x.recession)}`, `Labour ${n(x.labor)}`],
  );
  add(
    "growth_slowdown",
    "Recession Stress >= 45 (without meeting the recession-stress confirmation rule)",
    R >= 45,
    (R - 35) / 30,
    [`Recession stress ${n(x.recession)}`, `Activity ${n(x.activity)}`, `Labour ${n(x.labor)}`],
  );
  add(
    "late_cycle",
    "Recession Stress 30-45 AND (curve >= 50 OR inflation >= 45 OR credit >= 50)",
    R >= 30 && R < 45 && ((x.curve ?? 0) >= 50 || I >= 45 || credit >= 50),
    0.5,
    [`Recession stress ${n(x.recession)}`, `Curve ${n(x.curve)}`, `Inflation ${n(x.inflation)}`, `Credit ${n(x.credit)}`],
  );
  add(
    "expansion",
    "Recession Stress < 45 AND Financial < 50 AND Inflation < 60",
    R < 45 && F < 50 && I < 60,
    (45 - R) / 45,
    [`Recession ${n(x.recession)}`, `Financial ${n(x.financial)}`, `Inflation ${n(x.inflation)}`],
  );

  // Priority order: the most specific / severe matched rule wins.
  const priority: RegimeId[] = [
    "recession_stress",
    "stagflationary_stress",
    "deflationary_stress",
    "financial_stress",
    "inflationary_overheating",
    "growth_slowdown",
    "late_cycle",
    "expansion",
  ];
  let primary: RegimeId = "insufficient_data";
  if (x.recession !== null && x.confidence >= 0.35) {
    primary = priority.find((id) => rules.find((r) => r.id === id)?.matched) ?? (R >= 45 ? "growth_slowdown" : "late_cycle");
  }

  const qualifiers: string[] = [];
  if (primary !== "insufficient_data") {
    if (I >= 50 && !["stagflationary_stress", "inflationary_overheating", "deflationary_stress"].includes(primary)) qualifiers.push("Inflation pressure");
    if (F >= 50 && primary !== "financial_stress") qualifiers.push("Financial strain");
    if ((x.longEndPressure ?? 0) >= 70) qualifiers.push("Long-end / term-premium pressure");
  }
  const label = REGIME_LABEL[primary];
  return {
    primary,
    label,
    qualifiers,
    display: [label, ...qualifiers].join(" / ").toUpperCase(),
    rules,
    description: DESCRIPTIONS[primary],
  };
}

export function scoreValue(s: Partial<Record<ScoreId, { score: number | null }>>, id: ScoreId): number | null {
  return s[id]?.score ?? null;
}
