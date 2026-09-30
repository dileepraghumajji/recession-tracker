import { describe, expect, it } from "vitest";
import { addDays } from "@/platform/lib/timeseries";
import { addStock, breadthSeries, C, candlesToBars, COUNTER_COUNT, mergeAcc, type Accumulator, type DailyBar } from "./compute";
import { parseUniverse } from "./universe";

const epoch = (d: string) => Date.parse(`${d}T00:00:00+05:30`) / 1000;

/** Weekday dates from `start`, `n` of them. */
function weekdays(start: string, n: number): string[] {
  const out: string[] = [];
  for (let d = start; out.length < n; d = addDays(d, 1)) {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d);
  }
  return out;
}

const bar = (date: string, close: number, extra: Partial<DailyBar> = {}): DailyBar => ({ date, close, high: close, low: close, volume: 1000, ...extra });

/** Straightforward O(n²) reference implementation of every per-stock definition. */
function naive(bars: DailyBar[], from: string, to: string): Accumulator {
  const acc: Accumulator = {};
  bars.forEach((b, i) => {
    if (b.date < from || b.date > to) return;
    const row = (acc[b.date] ??= new Array(COUNTER_COUNT).fill(0));
    row[C.traded]++;
    if (i > 0) {
      const p = bars[i - 1].close;
      if (b.close > p) {
        row[C.adv]++;
        row[C.advVol] += b.volume;
      } else if (b.close < p) {
        row[C.dec]++;
        row[C.decVol] += b.volume;
      } else row[C.unch]++;
    }
    for (const [w, n, a] of [
      [20, C.n20, C.above20],
      [50, C.n50, C.above50],
      [100, C.n100, C.above100],
      [200, C.n200, C.above200],
    ]) {
      if (i + 1 < w) continue;
      row[n]++;
      const closes = bars.slice(i + 1 - w, i + 1).map((x) => x.close);
      if (b.close > closes.reduce((s, x) => s + x, 0) / w) row[a]++;
    }
    const ws = addDays(b.date, -364);
    const prior = bars.slice(0, i).filter((x) => x.date >= ws);
    if (bars[0].date <= ws && prior.length) {
      row[C.hlEligible]++;
      if (b.high > Math.max(...prior.map((x) => x.high))) row[C.newHigh]++;
      if (b.low < Math.min(...prior.map((x) => x.low))) row[C.newLow]++;
    }
  });
  return acc;
}

/** Deterministic pseudo-random numbers. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("candlesToBars", () => {
  it("dates candles in IST, drops invalid closes and later dates, keeps one bar per date", () => {
    const bars = candlesToBars(
      {
        timestamp: [epoch("2026-09-28"), epoch("2026-09-29"), epoch("2026-09-29"), epoch("2026-09-30"), epoch("2026-10-01"), epoch("2026-09-25")],
        close: [100, 0, 102, NaN, 105, 99],
        high: [101, 1, 104, 1, 106, 0],
        low: [99, 1, 101, 1, 104, 98],
        volume: [10, 1, 20, 1, 30, -5],
      },
      "2026-09-30",
    );
    expect(bars).toEqual([
      { date: "2026-09-25", close: 99, high: 99, low: 98, volume: 0 },
      { date: "2026-09-28", close: 100, high: 101, low: 99, volume: 10 },
      { date: "2026-09-29", close: 102, high: 104, low: 101, volume: 20 },
    ]);
  });

  it("widens a high/low that is inconsistent with the close", () => {
    expect(candlesToBars({ timestamp: [epoch("2026-09-28")], close: [100], high: [99], low: [101] }, "2026-09-30")[0]).toMatchObject({ high: 100, low: 100 });
  });
});

describe("addStock", () => {
  it("counts advances, declines and unchanged against the previous traded close", () => {
    const d = weekdays("2026-01-05", 5);
    const acc: Accumulator = {};
    addStock(acc, [bar(d[0], 100), bar(d[1], 101, { volume: 7 }), bar(d[2], 101), bar(d[4], 99, { volume: 3 })], d[0], d[4]);
    expect(acc[d[0]][C.adv] + acc[d[0]][C.dec] + acc[d[0]][C.unch]).toBe(0); // first candle: no previous close
    expect(acc[d[1]]).toMatchObject({ [C.traded]: 1, [C.adv]: 1, [C.advVol]: 7 });
    expect(acc[d[2]][C.unch]).toBe(1);
    expect(acc[d[3]]).toBeUndefined(); // did not trade
    expect(acc[d[4]]).toMatchObject({ [C.dec]: 1, [C.decVol]: 3 }); // vs d[2], its previous traded session
  });

  it("counts a stock in a moving-average denominator only once it has that many sessions", () => {
    const d = weekdays("2026-01-05", 25);
    const acc: Accumulator = {};
    addStock(acc, d.map((x, i) => bar(x, i + 1)), d[0], d[24]);
    expect(acc[d[18]][C.n20]).toBe(0);
    expect(acc[d[19]][C.n20]).toBe(1);
    expect(acc[d[19]][C.above20]).toBe(1); // 20 > mean(1..20) = 10.5
    expect(acc[d[24]][C.n50]).toBe(0);
  });

  it("a close equal to its average is not above it", () => {
    const d = weekdays("2026-01-05", 20);
    const acc: Accumulator = {};
    addStock(acc, d.map((x) => bar(x, 0.1 + 0.2)), d[0], d[19]);
    expect(acc[d[19]]).toMatchObject({ [C.n20]: 1, [C.above20]: 0 });
  });

  it("52-week highs use the preceding 52 weeks only and need 52 weeks of listing", () => {
    const start = "2025-01-01";
    const days = Array.from({ length: 800 }, (_, i) => addDays(start, i));
    const spike = days[10];
    const bars = days.map((d) => bar(d, 100, d === spike ? { high: 200 } : {}));
    const after = addDays(spike, 365); // spike is 365 days back: outside the window
    const inside = addDays(spike, 364); // spike is exactly 364 days back: inside
    bars[days.indexOf(inside)] = bar(inside, 100, { high: 150 });
    bars[days.indexOf(after)] = bar(after, 100, { high: 160 });
    bars[days.indexOf(after) + 1] = bar(addDays(after, 1), 100, { high: 155, low: 90 });
    const acc: Accumulator = {};
    addStock(acc, bars, days[0], days[799]);
    expect(acc[addDays(start, 363)][C.hlEligible]).toBe(0); // listed < 52 weeks
    expect(acc[addDays(start, 364)][C.hlEligible]).toBe(1);
    expect(acc[inside][C.newHigh]).toBe(0); // 150 < the spike's 200
    expect(acc[after][C.newHigh]).toBe(1); // the spike dropped out: 160 > 150
    expect(acc[addDays(after, 1)]).toMatchObject({ [C.newHigh]: 0, [C.newLow]: 1 }); // 155 < 160; 90 < 100
  });

  it("matches the reference implementation on random data with gaps, ties and splits-free noise", () => {
    const r = rng(42);
    const dates = weekdays("2022-01-03", 900);
    for (let stock = 0; stock < 25; stock++) {
      let px = 50 + r() * 500;
      const bars: DailyBar[] = [];
      const listFrom = Math.floor(r() * 400);
      for (let i = listFrom; i < dates.length; i++) {
        if (r() < 0.03) continue; // not traded that day
        if (r() > 0.1) px = Math.round(px * (1 + (r() - 0.5) * 0.06) * 20) / 20; // else: unchanged close
        const hi = px * (1 + r() * 0.03);
        const lo = px * (1 - r() * 0.03);
        bars.push({ date: dates[i], close: px, high: Math.round(hi * 100) / 100, low: Math.round(lo * 100) / 100, volume: Math.floor(r() * 1e6) });
      }
      const from = dates[500];
      const to = dates[899];
      const fast: Accumulator = {};
      addStock(fast, bars, from, to);
      expect(fast).toEqual(naive(bars, from, to));
    }
  });
});

describe("mergeAcc", () => {
  it("adds counters date by date", () => {
    const a: Accumulator = { "2026-01-05": new Array(COUNTER_COUNT).fill(1) };
    mergeAcc(a, { "2026-01-05": new Array(COUNTER_COUNT).fill(2), "2026-01-06": new Array(COUNTER_COUNT).fill(3) });
    expect(a["2026-01-05"][C.adv]).toBe(3);
    expect(a["2026-01-06"][C.dec]).toBe(3);
  });
});

describe("breadthSeries", () => {
  const row = (over: Partial<Record<number, number>>) => {
    const r = new Array(COUNTER_COUNT).fill(0);
    for (const [k, v] of Object.entries(over)) r[Number(k)] = v;
    return r;
  };
  const full = (traded: number) => row({ [C.traded]: traded, [C.adv]: 600, [C.dec]: 350, [C.advVol]: 9e6, [C.decVol]: 4e6, [C.n20]: 1200, [C.above20]: 700, [C.n50]: 1100, [C.above50]: 550, [C.n100]: 1000, [C.above100]: 333, [C.n200]: 90, [C.above200]: 50, [C.hlEligible]: 900, [C.newHigh]: 40, [C.newLow]: 12 });
  const sessions = weekdays("2026-01-05", 12);

  it("publishes counts and percentages for official sessions in range", () => {
    const acc: Accumulator = Object.fromEntries(sessions.map((d) => [d, full(1250)]));
    acc["2026-01-10"] = full(1250); // a Saturday: not a session, never published
    const { series, withheld } = breadthSeries(acc, { sessions, from: sessions[10], to: sessions[11] });
    expect(withheld).toEqual([]);
    expect(series["breadth:adv"]).toEqual([
      { date: sessions[10], value: 600 },
      { date: sessions[11], value: 600 },
    ]);
    expect(series["breadth:dec_vol"][0].value).toBe(4e6);
    expect(series["breadth:pct_above_20"][0].value).toBe(58.33);
    expect(series["breadth:pct_above_100"][0].value).toBe(33.3);
    expect(series["breadth:pct_above_200"]).toEqual([]); // denominator of 90 < 100 stocks
    expect(series["breadth:new_high"][0].value).toBe(40);
  });

  it("withholds sessions with too few stocks or incomplete data", () => {
    const acc: Accumulator = Object.fromEntries(sessions.map((d) => [d, full(1250)]));
    acc[sessions[11]] = full(700); // well below its neighbours
    delete acc[sessions[9]];
    const { series, withheld } = breadthSeries(acc, { sessions, from: sessions[8], to: sessions[11] });
    expect(series["breadth:adv"].map((o) => o.date)).toEqual([sessions[8], sessions[10]]);
    expect(withheld.map((w) => w.date)).toEqual([sessions[9], sessions[11]]);
  });
});

describe("parseUniverse", () => {
  it("keeps NSE mainboard equity shares (EQ/BE/BZ), one per ISIN", () => {
    const csv = [
      "EXCH_ID,SEGMENT,SECURITY_ID,ISIN,INSTRUMENT,UNDERLYING_SECURITY_ID,UNDERLYING_SYMBOL,SYMBOL_NAME,DISPLAY_NAME,INSTRUMENT_TYPE,SERIES,LOT_SIZE",
      "NSE,E,2885,INE002A01018,EQUITY,,RELIANCE,RELIANCE INDUSTRIES LTD,Reliance Industries,ES,EQ,1.0",
      'NSE,E,100,INE885A01032,EQUITY,,ARE&M,"AMARA RAJA, ENERGY",Amara Raja,ES,BE,1.0',
      "NSE,E,7,INE000000007,EQUITY,,NONCOMP,X,X,ES,BZ,1.0",
      "NSE,E,10176,INF200KA1FS1,EQUITY,,SETFNIF50,SBI-ETF NIFTY 50,SBI Nifty 50 ETF,ETF,EQ,1.0",
      "NSE,E,555,INE000000555,EQUITY,,SMECO,SME CO,SME Co,ES,SM,1.0",
      "NSE,E,556,IN0020000001,EQUITY,,GS2030,GOI,GOI,DBT,GS,1.0",
      "BSE,E,500325,INE002A01018,EQUITY,,RELIANCE,RELIANCE,Reliance,ES,A,1.0",
      "NSE,E,9999,INE002A01018,EQUITY,,RELIANCE,DUP,Dup,ES,BE,1.0",
      "",
    ].join("\n");
    expect(parseUniverse(csv)).toEqual([
      { id: 7, symbol: "NONCOMP", series: "BZ" },
      { id: 100, symbol: "ARE&M", series: "BE" },
      { id: 2885, symbol: "RELIANCE", series: "EQ" },
    ]);
  });

  it("rejects an instrument list without the expected columns", () => {
    expect(() => parseUniverse("A,B\n1,2")).toThrow(/unexpected columns/);
  });
});
