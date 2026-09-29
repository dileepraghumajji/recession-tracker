/**
 * User-configured alerts. None are created automatically. An alert "fires"
 * when its condition transitions from false to true between evaluations.
 */
import { z } from "zod";
import { INDICATOR_BY_ID } from "./indicators";
import type { Snapshot } from "./engine/snapshot";
import { fmtNum } from "./format";

const ScoreIdZ = z.enum(["recession", "inflation", "financial", "overall"]);
const WindowZ = z.enum(["w1", "m1", "m3"]);

export const AlertRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("indicator_level"), indicatorId: z.string().max(40), op: z.enum(["above", "below"]), level: z.number().finite() }),
  z.object({
    kind: z.literal("indicator_change"),
    indicatorId: z.string().max(40),
    window: WindowZ,
    op: z.enum(["rise", "fall", "either"]),
    amount: z.number().finite().positive(),
  }),
  z.object({ kind: z.literal("score_level"), score: ScoreIdZ, op: z.enum(["above", "below"]), level: z.number().min(0).max(100) }),
  z.object({ kind: z.literal("score_change"), score: ScoreIdZ, window: WindowZ, op: z.enum(["rise", "fall", "either"]), amount: z.number().positive().max(100) }),
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

export function validateRule(rule: AlertRule): string | null {
  if ((rule.kind === "indicator_level" || rule.kind === "indicator_change") && !INDICATOR_BY_ID[rule.indicatorId]) return "Unknown indicator";
  return null;
}

const WINDOW_LABEL = { w1: "1 week", m1: "1 month", m3: "3 months" } as const;

export function describeRule(rule: AlertRule): string {
  switch (rule.kind) {
    case "indicator_level": {
      const d = INDICATOR_BY_ID[rule.indicatorId];
      return `${d?.name ?? rule.indicatorId} ${rule.op} ${rule.level}${d?.units === "%" ? "%" : d?.units === "bps" ? " bps" : ""}`;
    }
    case "indicator_change": {
      const d = INDICATOR_BY_ID[rule.indicatorId];
      const u = d?.changeUnits === "bps" ? " bps" : d?.changeUnits === "%" ? "%" : d?.changeUnits === "pp" ? " pp" : "";
      return `${d?.name ?? rule.indicatorId} ${rule.op === "either" ? "moves" : rule.op === "rise" ? "rises" : "falls"} by ≥ ${rule.amount}${u} over ${WINDOW_LABEL[rule.window]}`;
    }
    case "score_level":
      return `${rule.score} stress score ${rule.op} ${rule.level}`;
    case "score_change":
      return `${rule.score} stress score ${rule.op === "either" ? "moves" : rule.op === "rise" ? "rises" : "falls"} by ≥ ${rule.amount} pts over ${WINDOW_LABEL[rule.window]}`;
  }
}

/** Evaluates a rule against a snapshot. Returns null state when data is unavailable. */
export function evaluateRule(rule: AlertRule, snap: Snapshot): { state: boolean | null; value: number | null; detail: string } {
  const cmpChange = (v: number, op: "rise" | "fall" | "either", amt: number) => (op === "rise" ? v >= amt : op === "fall" ? v <= -amt : Math.abs(v) >= amt);
  switch (rule.kind) {
    case "indicator_level": {
      const r = snap.indicators.find((x) => x.id === rule.indicatorId);
      const v = r?.available ? (r.latest?.value ?? null) : null;
      if (v === null) return { state: null, value: null, detail: "data unavailable" };
      return { state: rule.op === "above" ? v > rule.level : v < rule.level, value: v, detail: `current ${fmtNum(v, 2)}` };
    }
    case "indicator_change": {
      const r = snap.indicators.find((x) => x.id === rule.indicatorId);
      const def = INDICATOR_BY_ID[rule.indicatorId];
      let v = r?.available ? r.changes[rule.window] : null;
      if (v === null || v === undefined || !def) return { state: null, value: null, detail: "change unavailable" };
      if (def.changeUnits === "bps" && def.units !== "bps") v = v * 100;
      return { state: cmpChange(v, rule.op, rule.amount), value: v, detail: `change ${fmtNum(v, 2)}` };
    }
    case "score_level": {
      const v = snap.scores[rule.score].score;
      if (v === null) return { state: null, value: null, detail: "score unavailable" };
      return { state: rule.op === "above" ? v > rule.level : v < rule.level, value: v, detail: `score ${v.toFixed(0)}` };
    }
    case "score_change": {
      const v = snap.scoreChanges[rule.score][rule.window];
      if (v === null) return { state: null, value: null, detail: "change unavailable" };
      return { state: cmpChange(v, rule.op, rule.amount), value: v, detail: `change ${v.toFixed(1)} pts` };
    }
  }
}

export const ALERT_PRESETS: { label: string; name: string; rule: AlertRule }[] = [
  { label: "30Y yield crosses a level", name: "30Y above 5.25%", rule: { kind: "indicator_level", indicatorId: "ust30y", op: "above", level: 5.25 } },
  { label: "HY spread widens by X bps", name: "HY OAS +75 bps in 1M", rule: { kind: "indicator_change", indicatorId: "hy_oas", window: "m1", op: "rise", amount: 75 } },
  { label: "Sahm Rule approaches 0.5", name: "Sahm above 0.40", rule: { kind: "indicator_level", indicatorId: "sahm", op: "above", level: 0.4 } },
  { label: "ISM Manufacturing below 50", name: "ISM Mfg below 50", rule: { kind: "indicator_level", indicatorId: "ism_mfg", op: "below", level: 50 } },
  { label: "10Y–3M spread changes by X bps", name: "10Y–3M moves 40 bps in 1M", rule: { kind: "indicator_change", indicatorId: "spread_10y3m", window: "m1", op: "either", amount: 40 } },
  { label: "Unemployment rises by X pp", name: "Unemployment +0.3pp in 3M", rule: { kind: "indicator_change", indicatorId: "unrate", window: "m3", op: "rise", amount: 0.3 } },
  { label: "VIX crosses X", name: "VIX above 30", rule: { kind: "indicator_level", indicatorId: "vix", op: "above", level: 30 } },
  { label: "Recession score changes by X pts", name: "Recession stress ±10 in 1M", rule: { kind: "score_change", score: "recession", window: "m1", op: "either", amount: 10 } },
];
