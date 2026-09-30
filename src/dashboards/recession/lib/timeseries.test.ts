import { describe, expect, it } from "vitest";
import { drawdown, lagChange, movingAverage, percentileOf, piecewise, rollingMin, sahmRule, spread, yoy, monthEnds } from "./timeseries";
import type { Obs } from "./types";

const monthly = (vals: number[], start = 2020): Obs[] =>
  vals.map((v, i) => ({ date: `${start + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`, value: v }));

describe("sahmRule", () => {
  it("computes 3M avg minus min of prior 12 months' 3M averages", () => {
    // 15 months flat at 4.0 then rises
    const u = monthly([...Array(15).fill(4.0), 4.3, 4.6, 4.9]);
    const s = sahmRule(u);
    const last = s[s.length - 1];
    // current 3M avg = (4.3+4.6+4.9)/3 = 4.6; prior-12 min = 4.0
    expect(last.value).toBeCloseTo(0.6, 6);
    expect(last.date).toBe(u[u.length - 1].date);
  });
  it("excludes the current month from the minimum (can be negative)", () => {
    const u = monthly([...Array(14).fill(5.0), 4.0, 4.0, 4.0]);
    const s = sahmRule(u);
    expect(s[s.length - 1].value).toBeLessThan(0);
  });
  it("needs 12 prior 3M averages", () => {
    expect(sahmRule(monthly(Array(14).fill(4)))).toHaveLength(0);
    expect(sahmRule(monthly(Array(15).fill(4)))).toHaveLength(1);
  });
});

describe("percentileOf", () => {
  it("uses mid-rank for ties", () => {
    expect(percentileOf([1, 2, 3, 4], 2)).toBeCloseTo(37.5);
    expect(percentileOf([1, 1, 1, 1], 1)).toBe(50);
    expect(percentileOf([], 1)).toBeNull();
  });
});

describe("yoy / lagChange", () => {
  it("computes percent change over one year with date tolerance", () => {
    const s = monthly(Array.from({ length: 25 }, (_, i) => 100 * 1.01 ** i));
    const y = yoy(s);
    expect(y[0].date).toBe("2021-01-01");
    expect(y[0].value).toBeCloseTo((1.01 ** 12 - 1) * 100, 6);
  });
  it("skips points without a reference inside tolerance", () => {
    const s: Obs[] = [
      { date: "2020-01-01", value: 1 },
      { date: "2021-06-01", value: 2 },
    ];
    expect(lagChange(s, 365, "diff", 20)).toHaveLength(0);
  });
});

describe("spread", () => {
  it("aligns on the first series' dates and respects staleness", () => {
    const a: Obs[] = [
      { date: "2024-01-02", value: 4 },
      { date: "2024-01-20", value: 5 },
    ];
    const b: Obs[] = [{ date: "2024-01-01", value: 3 }];
    expect(spread(a, b, 7)).toEqual([{ date: "2024-01-02", value: 1 }]);
  });
});

describe("rolling helpers", () => {
  it("drawdown from trailing high", () => {
    const s: Obs[] = [
      { date: "2024-01-01", value: 100 },
      { date: "2024-02-01", value: 120 },
      { date: "2024-03-01", value: 90 },
    ];
    expect(drawdown(s, 365)[2].value).toBeCloseTo(-25);
  });
  it("rollingMin over calendar window", () => {
    const s: Obs[] = [
      { date: "2020-01-01", value: -1 },
      { date: "2021-01-01", value: 0.5 },
      { date: "2022-06-01", value: 1 },
    ];
    const r = rollingMin(s, 730);
    expect(r[1].value).toBe(-1);
    expect(r[2].value).toBe(0.5);
  });
  it("movingAverage", () => {
    expect(movingAverage(monthly([1, 2, 3, 4]), 2).map((o) => o.value)).toEqual([1.5, 2.5, 3.5]);
  });
});

describe("piecewise", () => {
  it("handles descending anchors (lower is worse)", () => {
    const xs = [2.5, 0.75, 0, -0.75, -1.5];
    const ys = [0, 50, 75, 90, 100];
    expect(piecewise(0, xs, ys)).toBe(75);
    expect(piecewise(3, xs, ys)).toBe(0);
    expect(piecewise(-2, xs, ys)).toBe(100);
    expect(piecewise(0.375, xs, ys)).toBeCloseTo(62.5);
  });
});

describe("monthEnds", () => {
  it("lists month ends inclusive", () => {
    expect(monthEnds("2024-01-15", "2024-03-31")).toEqual(["2024-01-31", "2024-02-29", "2024-03-31"]);
  });
});
