/**
 * User-configured alerts for the India Market Sentiment Terminal. None are
 * created automatically; presets are only suggestions in the UI.
 *
 * - level: fires when the condition turns true (false → true transition).
 * - cross: fires when the value crosses a level between two evaluations.
 * - change: fires when the change over a window exceeds an amount.
 */
import { z } from "zod";
import type { Snapshot } from "./engine/snapshot";

type Getter = (s: Snapshot) => { value: number | null; changes: { d1: number | null; w1: number | null; m1: number | null } };

const reading = (id: string): Getter => (s) => {
  const r = s.readings.find((x) => x.id === id);
  if (!r?.available) return { value: null, changes: { d1: null, w1: null, m1: null } };
  return { value: r.value, changes: { d1: r.changes.d1, w1: r.changes.w1, m1: r.changes.m1 } };
};

export const ALERT_METRICS: Record<string, { label: string; unit: string; changeUnit: string; get: Getter }> = {
  sentiment: { label: "India Market Sentiment", unit: "", changeUnit: " pts", get: (s) => ({ value: s.score, changes: { d1: s.momentum.d1, w1: s.momentum.w1, m1: s.momentum.m1 } }) },
  india_vix: { label: "India VIX", unit: "", changeUnit: "%", get: reading("india_vix") },
  fii_cash_5d: { label: "FII cash flow (5D, ₹ Cr)", unit: " Cr", changeUnit: " Cr", get: reading("fii_cash_5d") },
  fii_cash_1m: { label: "FII cash flow (1M, ₹ Cr)", unit: " Cr", changeUnit: " Cr", get: reading("fii_cash_1m") },
  pct_above_50: { label: "% of stocks above 50DMA", unit: "%", changeUnit: " pp", get: reading("pct_above_50") },
  pct_above_200: { label: "% of stocks above 200DMA", unit: "%", changeUnit: " pp", get: reading("pct_above_200") },
  nifty_vs_200dma: { label: "NIFTY 50 vs 200DMA (%)", unit: "%", changeUnit: " pp", get: reading("nifty_vs_200dma") },
  premium_pcr: { label: "NIFTY premium PCR", unit: "", changeUnit: "", get: reading("nifty_premium_pcr") },
  oi_pcr: { label: "NIFTY OI PCR", unit: "", changeUnit: "", get: reading("nifty_oi_pcr") },
  iv_skew: { label: "NIFTY 25Δ IV skew", unit: " vol", changeUnit: " vol", get: reading("nifty_skew") },
  usdinr: { label: "USD/INR", unit: "", changeUnit: "%", get: reading("usdinr") },
  gsec10y: { label: "India 10Y G-Sec (%)", unit: "%", changeUnit: " pp", get: reading("gsec10y") },
  brent: { label: "Brent (USD/bbl)", unit: "", changeUnit: "%", get: reading("brent_level") },
};

const MetricZ = z.string().refine((m) => m in ALERT_METRICS, "unknown metric");
const WindowZ = z.enum(["d1", "w1", "m1"]);

export const AlertRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("level"), metric: MetricZ, op: z.enum(["above", "below"]), level: z.number().finite() }),
  z.object({ kind: z.literal("cross"), metric: MetricZ, direction: z.enum(["up", "down", "either"]), level: z.number().finite() }),
  z.object({ kind: z.literal("change"), metric: MetricZ, window: WindowZ, op: z.enum(["rise", "fall", "either"]), amount: z.number().finite().positive() }),
]);
export type AlertRule = z.infer<typeof AlertRuleSchema>;
export const NewAlertSchema = z.object({ name: z.string().trim().min(1).max(120), rule: AlertRuleSchema });

export interface Alert {
  id: string;
  name: string;
  rule: AlertRule;
  enabled: boolean;
  createdAt: string;
  lastState: boolean | null;
  lastValue: number | null;
  lastEvaluatedAt: string | null;
  lastTriggeredAt: string | null;
}

export interface AlertEvent {
  id: number;
  alertId: string;
  triggeredAt: string;
  message: string;
  value: number | null;
}

const WINDOW = { d1: "1 day", w1: "1 week", m1: "1 month" } as const;

export function describeRule(r: AlertRule): string {
  const m = ALERT_METRICS[r.metric];
  switch (r.kind) {
    case "level":
      return `${m.label} ${r.op} ${r.level}${m.unit}`;
    case "cross":
      return `${m.label} crosses ${r.level}${m.unit}${r.direction === "either" ? "" : r.direction === "up" ? " upward" : " downward"}`;
    case "change":
      return `${m.label} ${r.op === "either" ? "moves" : r.op === "rise" ? "rises" : "falls"} by ≥ ${r.amount}${m.changeUnit} over ${WINDOW[r.window]}`;
  }
}

/**
 * Evaluates a rule. `prev` is the value recorded at the previous evaluation
 * (needed for crossings). `fire` says whether an event should be emitted given
 * the previous state.
 */
export function evaluateRule(r: AlertRule, s: Snapshot, prev: { state: boolean | null; value: number | null }): { state: boolean | null; value: number | null; fire: boolean; detail: string } {
  const { value, changes } = ALERT_METRICS[r.metric].get(s);
  if (r.kind === "level") {
    if (value === null) return { state: null, value: null, fire: false, detail: "data unavailable" };
    const state = r.op === "above" ? value > r.level : value < r.level;
    return { state, value, fire: state && prev.state !== true, detail: `current ${value.toFixed(2)}` };
  }
  if (r.kind === "cross") {
    if (value === null) return { state: null, value: null, fire: false, detail: "data unavailable" };
    const p = prev.value;
    const up = p !== null && p < r.level && value >= r.level;
    const down = p !== null && p > r.level && value <= r.level;
    const fire = r.direction === "up" ? up : r.direction === "down" ? down : up || down;
    return { state: value >= r.level, value, fire, detail: p === null ? `current ${value.toFixed(2)} (first evaluation)` : `${p.toFixed(2)} → ${value.toFixed(2)}` };
  }
  const c = changes[r.window];
  if (c === null) return { state: null, value: value, fire: false, detail: "change unavailable" };
  const state = r.op === "rise" ? c >= r.amount : r.op === "fall" ? c <= -r.amount : Math.abs(c) >= r.amount;
  return { state, value, fire: state && prev.state !== true, detail: `change ${c.toFixed(2)} over ${WINDOW[r.window]}` };
}

/** Suggestions shown in the UI — never created automatically. */
export const ALERT_PRESETS: { label: string; name: string; rule: AlertRule }[] = [
  { label: "Sentiment crosses 20", name: "Sentiment crosses 20", rule: { kind: "cross", metric: "sentiment", direction: "either", level: 20 } },
  { label: "Sentiment crosses 30", name: "Sentiment crosses 30", rule: { kind: "cross", metric: "sentiment", direction: "either", level: 30 } },
  { label: "Sentiment crosses 50", name: "Sentiment crosses 50", rule: { kind: "cross", metric: "sentiment", direction: "either", level: 50 } },
  { label: "Sentiment crosses 70", name: "Sentiment crosses 70", rule: { kind: "cross", metric: "sentiment", direction: "either", level: 70 } },
  { label: "Sentiment changes > 10 pts (1W)", name: "Sentiment ±10 in 1W", rule: { kind: "change", metric: "sentiment", window: "w1", op: "either", amount: 10 } },
  { label: "India VIX changes > X% (1D)", name: "India VIX ±15% in 1D", rule: { kind: "change", metric: "india_vix", window: "d1", op: "either", amount: 15 } },
  { label: "FII flows exceed threshold", name: "FII 5D selling > ₹15,000 Cr", rule: { kind: "level", metric: "fii_cash_5d", op: "below", level: -15000 } },
  { label: "Breadth falls below threshold", name: "% above 50DMA below 30", rule: { kind: "level", metric: "pct_above_50", op: "below", level: 30 } },
  { label: "NIFTY crosses 200DMA", name: "NIFTY crosses 200DMA", rule: { kind: "cross", metric: "nifty_vs_200dma", direction: "either", level: 0 } },
  { label: "Premium PCR crosses threshold", name: "Premium PCR crosses 1.3", rule: { kind: "cross", metric: "premium_pcr", direction: "either", level: 1.3 } },
  { label: "OI PCR changes sharply", name: "OI PCR ±0.25 in 1W", rule: { kind: "change", metric: "oi_pcr", window: "w1", op: "either", amount: 0.25 } },
  { label: "IV skew changes sharply", name: "IV skew ±2 vol in 1W", rule: { kind: "change", metric: "iv_skew", window: "w1", op: "either", amount: 2 } },
  { label: "USD/INR moves sharply", name: "USD/INR ±1% in 1W", rule: { kind: "change", metric: "usdinr", window: "w1", op: "either", amount: 1 } },
  { label: "10Y G-Sec moves sharply", name: "10Y G-Sec ±0.15 pp in 1W", rule: { kind: "change", metric: "gsec10y", window: "w1", op: "either", amount: 0.15 } },
  { label: "Crude moves sharply", name: "Brent ±8% in 1W", rule: { kind: "change", metric: "brent", window: "w1", op: "either", amount: 8 } },
];
