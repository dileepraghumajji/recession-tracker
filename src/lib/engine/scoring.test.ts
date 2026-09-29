import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, applyOverrides, parseOverrides } from "../model-config";
import type { IndicatorReading } from "../types";
import { computeComposite } from "./scoring";

function reading(id: string, stress: number | null, memberships: IndicatorReading["memberships"], status: IndicatorReading["status"] = "LIVE"): IndicatorReading {
  return {
    id,
    name: id,
    group: "x",
    units: "",
    frequency: "M",
    polarity: "higher_worse",
    polarityNote: "",
    available: stress !== null,
    latest: stress === null ? null : { date: "2026-01-01", value: 1 },
    changes: { w1: null, m1: null, m3: null, m6: null, m12: null },
    changeMode: "diff",
    percentile: null,
    percentile12m: null,
    zScore: null,
    historyStart: null,
    historyYears: null,
    stressMetricLabel: "",
    stressMetric: null,
    scored: true,
    stress,
    signal: "normal",
    trend: "stable",
    status: stress === null ? "UNAVAILABLE" : status,
    sources: [],
    memberships,
    description: "",
  };
}

const infl = (cluster: string) => [{ score: "inflation" as const, category: "realized", cluster }];

describe("cluster pooling (anti double counting)", () => {
  it("adding correlated members to a cluster does not increase its weight", () => {
    const one = computeComposite("inflation", [reading("cpi", 100, infl("headline")), reading("core", 0, infl("core"))], DEFAULT_CONFIG);
    const many = computeComposite(
      "inflation",
      [reading("cpi", 100, infl("headline")), reading("pce", 100, infl("headline")), reading("core", 0, infl("core"))],
      DEFAULT_CONFIG,
    );
    expect(one.score).toBeCloseTo(many.score as number, 8);
    // headline cluster weight 40 of 100 within realized; only realized has data
    expect(one.score).toBeCloseTo(40, 8);
  });

  it("contributions sum to the composite score", () => {
    const rs = [
      reading("a", 80, [{ score: "recession", category: "growth_labor", cluster: "unemployment" }]),
      reading("b", 20, [{ score: "recession", category: "growth_labor", cluster: "claims" }]),
      reading("c", 60, [{ score: "recession", category: "credit_financial", cluster: "high_yield" }]),
      reading("d", null, [{ score: "recession", category: "housing", cluster: "construction" }]),
    ];
    const s = computeComposite("recession", rs, DEFAULT_CONFIG);
    const sum = s.contributions.reduce((a, c) => a + c.points, 0);
    expect(sum).toBeCloseTo(s.score as number, 8);
    expect(s.coverage).toBeLessThan(1);
    const w = s.contributions.reduce((a, c) => a + c.effectiveWeight, 0);
    expect(w).toBeCloseTo(1, 8);
  });

  it("stale data reduces freshness but not the score", () => {
    const m = [{ score: "financial" as const, category: "volatility", cluster: "vix" }];
    const live = computeComposite("financial", [reading("v", 50, m, "LIVE")], DEFAULT_CONFIG);
    const stale = computeComposite("financial", [reading("v", 50, m, "STALE")], DEFAULT_CONFIG);
    expect(live.score).toBe(stale.score);
    expect(stale.freshness).toBeLessThan(live.freshness);
  });
});

describe("config overrides", () => {
  it("parses and applies category weights safely", () => {
    const ov = parseOverrides(JSON.stringify({ categoryWeights: { recession: { housing: 20, "bad key!": 5 } }, overall: { recession: 60, nope: 1 } }));
    const cfg = applyOverrides(DEFAULT_CONFIG, ov);
    expect(cfg.scores.recession.categories.find((c) => c.id === "housing")!.weight).toBe(20);
    expect(cfg.overall.recession).toBe(60);
    expect(DEFAULT_CONFIG.scores.recession.categories.find((c) => c.id === "housing")!.weight).toBe(10);
  });
  it("rejects garbage", () => {
    expect(parseOverrides("{not json")).toBeNull();
    expect(applyOverrides(DEFAULT_CONFIG, parseOverrides(JSON.stringify({ overall: { recession: -5 } }))).overall.recession).toBe(50);
  });
});

describe("default weights", () => {
  it("recession category weights match the specified 30/25/15/10/10/5/5", () => {
    expect(DEFAULT_CONFIG.scores.recession.categories.map((c) => c.weight)).toEqual([30, 25, 15, 10, 10, 5, 5]);
  });
});
