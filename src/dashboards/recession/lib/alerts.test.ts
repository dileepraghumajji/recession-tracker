import { describe, expect, it } from "vitest";
import { AlertRuleSchema, NewAlertSchema, describeRule, evaluateRule, validateRule } from "./alerts";
import type { Snapshot } from "./engine/snapshot";

function snap(partial: { indicators?: unknown[]; scores?: unknown; scoreChanges?: unknown }): Snapshot {
  return {
    indicators: [],
    scores: { recession: { score: 55 }, inflation: { score: 40 }, financial: { score: 30 }, overall: { score: 45 } },
    scoreChanges: {
      recession: { w1: 1, m1: 12, m3: -3 },
      inflation: { w1: 0, m1: 0, m3: 0 },
      financial: { w1: null, m1: null, m3: null },
      overall: { w1: 0, m1: 0, m3: 0 },
    },
    ...partial,
  } as unknown as Snapshot;
}

const hy = { id: "hy_oas", available: true, latest: { date: "2026-09-25", value: 3.4 }, changes: { w1: 0.1, m1: 0.8, m3: 0.2 } };

describe("alert rules", () => {
  it("validates input shape strictly", () => {
    expect(AlertRuleSchema.safeParse({ kind: "indicator_level", indicatorId: "ust30y", op: "above", level: 5 }).success).toBe(true);
    expect(AlertRuleSchema.safeParse({ kind: "indicator_level", indicatorId: "ust30y", op: "sideways", level: 5 }).success).toBe(false);
    expect(AlertRuleSchema.safeParse({ kind: "score_level", score: "recession", op: "above", level: 150 }).success).toBe(false);
    expect(NewAlertSchema.safeParse({ name: "", rule: { kind: "score_level", score: "recession", op: "above", level: 50 } }).success).toBe(false);
    expect(validateRule({ kind: "indicator_level", indicatorId: "nope", op: "above", level: 1 })).toMatch(/Unknown/);
  });

  it("converts spread changes to basis points before comparing", () => {
    const rule = { kind: "indicator_change" as const, indicatorId: "hy_oas", window: "m1" as const, op: "rise" as const, amount: 75 };
    const r = evaluateRule(rule, snap({ indicators: [hy] }));
    expect(r.value).toBeCloseTo(80);
    expect(r.state).toBe(true);
    expect(describeRule(rule)).toMatch(/bps/);
  });

  it("returns null state when data are unavailable (never guesses)", () => {
    const r = evaluateRule({ kind: "indicator_level", indicatorId: "ism_mfg", op: "below", level: 50 }, snap({ indicators: [{ id: "ism_mfg", available: false, latest: null, changes: {} }] }));
    expect(r.state).toBeNull();
    const s = evaluateRule({ kind: "score_change", score: "financial", window: "m1", op: "either", amount: 5 }, snap({}));
    expect(s.state).toBeNull();
  });

  it("evaluates score level and change rules", () => {
    expect(evaluateRule({ kind: "score_level", score: "recession", op: "above", level: 50 }, snap({})).state).toBe(true);
    expect(evaluateRule({ kind: "score_change", score: "recession", window: "m1", op: "either", amount: 10 }, snap({})).state).toBe(true);
    expect(evaluateRule({ kind: "score_change", score: "recession", window: "m3", op: "rise", amount: 2 }, snap({})).state).toBe(false);
    expect(evaluateRule({ kind: "score_change", score: "recession", window: "m3", op: "fall", amount: 2 }, snap({})).state).toBe(true);
  });
});
