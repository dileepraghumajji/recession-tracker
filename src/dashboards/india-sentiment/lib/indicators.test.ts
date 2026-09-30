import { describe, expect, it } from "vitest";
import { INDICATORS, netAdvanceShare, type Get } from "./indicators";
import type { Obs } from "./types";

const byId = (id: string) => INDICATORS.find((d) => d.id === id)!;

/** Weekday dates starting 2024-01-01 (a Monday). */
function sessions(n: number): string[] {
  const out: string[] = [];
  for (let t = Date.UTC(2024, 0, 1); out.length < n; t += 86_400_000) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Breadth series for a universe of `total` issues, with `share[i]` of them advancing on day i (rest declining). */
function breadth(dates: string[], share: number[], total: number): Get {
  const adv: Obs[] = dates.map((date, i) => ({ date, value: Math.round(share[i] * total) }));
  const dec: Obs[] = dates.map((date, i) => ({ date, value: total - Math.round(share[i] * total) }));
  return (k) => (k === "breadth:adv" ? adv : k === "breadth:dec" ? dec : []);
}

describe("ad_line_1m (net-advance-share A/D line)", () => {
  const ad = byId("ad_line_1m");
  const dates = sessions(80);
  // Multiples of 1/20 so every universe size below (a multiple of 20) gets exact integer counts.
  const share = dates.map((_, i) => Math.round((0.5 + 0.2 * Math.sin(i / 6)) * 20) / 20);

  it("does not depend on the size of the breadth universe", () => {
    // Roughly the 2011 and 2026 NSE breadth universes.
    const small = ad.compute(breadth(dates, share, 980));
    const large = ad.compute(breadth(dates, share, 2340));
    expect(small.length).toBeGreaterThan(40);
    expect(large.map((o) => o.date)).toEqual(small.map((o) => o.date));
    large.forEach((o, i) => expect(o.value).toBeCloseTo(small[i].value, 12));
    // The raw advance-minus-decline count would have scaled with the universe (the bias being removed).
    const raw = (total: number) => share.slice(-21).reduce((s, x) => s + Math.round(x * total) - (total - Math.round(x * total)), 0);
    expect(raw(2340) / raw(980)).toBeCloseTo(2340 / 980, 6);
  });

  it("equals the sum of daily (adv − dec) / (adv + dec) over the last month", () => {
    const g = breadth(dates, share, 2000);
    const out = ad.compute(g);
    const last = out[out.length - 1];
    const adv = g("breadth:adv");
    const dec = g("breadth:dec");
    // chg(…, 30): cumulative line on the last date minus its value 30 calendar days earlier.
    const start = new Date(Date.parse(last.date) - 30 * 86_400_000).toISOString().slice(0, 10);
    let expected = 0;
    for (let i = 0; i < dates.length; i++) if (dates[i] > start && dates[i] <= last.date) expected += (adv[i].value - dec[i].value) / (adv[i].value + dec[i].value);
    expect(last.value).toBeCloseTo(expected, 12);
  });

  it("is bounded by the number of sessions in the window and keeps the sign of net breadth", () => {
    const allUp = ad.compute(breadth(dates, dates.map(() => 1), 1500));
    const allDown = ad.compute(breadth(dates, dates.map(() => 0), 1500));
    const last = allUp[allUp.length - 1].value;
    expect(last).toBeGreaterThan(0);
    expect(last).toBeLessThanOrEqual(23);
    expect(allDown[allDown.length - 1].value).toBeCloseTo(-last, 12);
  });

  it("skips sessions with no advances or declines instead of inventing a value", () => {
    expect(netAdvanceShare(0, 0)).toBeNull();
    expect(netAdvanceShare(3, 1)).toBeCloseTo(0.5);
    expect(netAdvanceShare(1, 3)).toBeCloseTo(-0.5);
  });

  it("is still a scored breadth indicator", () => {
    expect(ad.factor).toBe("breadth");
    expect(ad.scoring).toEqual({ kind: "percentile", polarity: 1, fallback: undefined });
  });
});

describe("India 3M interbank rate", () => {
  it("uses the current OECD series on FRED (IR3TIB01INM156N no longer exists)", () => {
    const d = byId("interbank_3m_chg");
    expect(d.series).toEqual(["fred:INDIR3TIB01STM"]);
    expect(INDICATORS.some((x) => x.series.includes("fred:IR3TIB01INM156N"))).toBe(false);
  });
});
