import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { addDays } from "@/platform/lib/timeseries";
import { resetDhanState, setDhanFetch } from "../providers/dhan-client";
import { createMemoryStore, type Store } from "../store";
import { addStock, BREADTH_OUTPUT_KEYS, breadthSeries, type Accumulator, type DailyBar } from "./compute";
import { breadthStatus, runBreadthJob } from "./job";

const TUNING = { historyFrom: "2025-09-01", chunk: 4, concurrency: 4, minUniverse: 5, minStocks: 5 };
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const TOKEN = `${b64({ alg: "HS512" })}.${b64({ dhanClientId: "1000000001", exp: Math.floor(Date.now() / 1000) + 86_400 })}.sig`;
const epoch = (d: string) => Date.parse(`${d}T00:00:00+05:30`) / 1000;
/** 10:30 IST on a date: that day's session is still open. */
const at = (d: string) => Date.parse(`${d}T10:30:00+05:30`);

function weekdays(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d);
  }
  return out;
}

const SESSIONS = weekdays("2024-01-01", "2026-10-02");
const IDS = Array.from({ length: 12 }, (_, i) => 101 + i);

/** Deterministic synthetic market: random walks; stock 112 lists late. */
function makeMarket(): Record<number, DailyBar[]> {
  let s = 7;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const out: Record<number, DailyBar[]> = {};
  for (const id of IDS) {
    let px = 100 + r() * 400;
    out[id] = [];
    for (const [i, date] of SESSIONS.entries()) {
      if (id === 112 && i < SESSIONS.length - 180) continue;
      if (r() < 0.02) continue;
      if (r() > 0.1) px = Math.round(px * (1 + (r() - 0.5) * 0.05) * 20) / 20;
      out[id].push({ date, close: px, high: Math.round(px * (1 + r() * 0.02) * 100) / 100, low: Math.round(px * (1 - r() * 0.02) * 100) / 100, volume: Math.floor(r() * 1e6) });
    }
  }
  return out;
}

const CSV = ["EXCH_ID,SEGMENT,SECURITY_ID,ISIN,INSTRUMENT,UNDERLYING_SECURITY_ID,UNDERLYING_SYMBOL,SYMBOL_NAME,DISPLAY_NAME,INSTRUMENT_TYPE,SERIES,LOT_SIZE", ...IDS.map((id) => `NSE,E,${id},INE${id}A01010,EQUITY,,S${id},S${id},S${id},ES,EQ,1.0`), "NSE,E,999,INF999,EQUITY,,ETF1,ETF,ETF,ETF,EQ,1.0"].join("\n");

let market: Record<number, DailyBar[]>;
let failures: Record<number, number>;
let requests: { securityId: string; exchangeSegment: string }[];

function candles(bars: DailyBar[], from: string, toExclusive: string) {
  const sel = bars.filter((b) => b.date >= from && b.date < toExclusive);
  return { open: sel.map((b) => b.close), high: sel.map((b) => b.high), low: sel.map((b) => b.low), close: sel.map((b) => b.close), volume: sel.map((b) => b.volume), timestamp: sel.map((b) => epoch(b.date)) };
}

function fakeDhan(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  const path = String(url).replace("https://api.dhan.co/v2", "");
  if (path === "/instrument/NSE_EQ") return Promise.resolve(new Response(CSV, { status: 200 }));
  if (path !== "/charts/historical") return Promise.resolve(new Response("{}", { status: 404 }));
  const body = JSON.parse(String(init?.body));
  requests.push({ securityId: body.securityId, exchangeSegment: body.exchangeSegment });
  if (body.exchangeSegment === "IDX_I") {
    const nifty = SESSIONS.map((date) => ({ date, close: 1, high: 1, low: 1, volume: 0 }));
    return Promise.resolve(Response.json(candles(nifty, body.fromDate, body.toDate)));
  }
  const id = Number(body.securityId);
  if ((failures[id] ?? 0) > 0) {
    failures[id]--;
    return Promise.reject(new TypeError("fetch failed"));
  }
  if (failures[id] === -1) return Promise.resolve(Response.json({ errorType: "Input_Exception", errorCode: "DH-905", errorMessage: "invalid security" }, { status: 400 }));
  return Promise.resolve(Response.json(candles(market[id] ?? [], body.fromDate, body.toDate)));
}

/** The same computation done directly, for comparison with the job's output. */
function expected(from: string, to: string, ids = IDS) {
  const acc: Accumulator = {};
  for (const id of ids) addStock(acc, market[id].filter((b) => b.date <= to), addDays(from, -45), to);
  return breadthSeries(acc, { sessions: SESSIONS.filter((d) => d <= to), from, to, minStocks: TUNING.minStocks }).series;
}

async function published(store: Store) {
  const all = await store.loadAll();
  return Object.fromEntries(BREADTH_OUTPUT_KEYS.map((k) => [k, all[k]?.obs ?? []]));
}

/** A clock that starts at `start` and moves with real time. */
function clock(start: number) {
  const real = Date.now();
  return () => start + (Date.now() - real);
}

let seq = 0;
const newStore = () => createMemoryStore(`__breadthTest${++seq}`);

beforeEach(() => {
  process.env.DHAN_ACCESS_TOKEN = TOKEN;
  delete process.env.DATA_MODE;
  resetDhanState();
  setDhanFetch(fakeDhan as typeof fetch);
  market = makeMarket();
  failures = {};
  requests = [];
});

afterEach(() => {
  setDhanFetch(null);
  delete process.env.DHAN_ACCESS_TOKEN;
});

describe("breadth job", () => {
  it("publishes history up to the last completed session, identical to a direct computation", async () => {
    const store = newStore();
    const r = await runBreadthJob({ store, now: clock(at("2026-09-30")), tuning: TUNING });
    expect(r.status).toBe("published");
    expect(r.target).toBe("2026-09-29"); // today's session (still open) is excluded
    const got = await published(store);
    expect(got).toEqual(expected(TUNING.historyFrom, "2026-09-29"));
    expect(got["breadth:adv"][0].date).toBe("2025-09-01");
    expect(got["breadth:adv"].at(-1)?.date).toBe("2026-09-29");
    expect(got["breadth:pct_above_200"].length).toBeGreaterThan(200);
    // Only equities of the universe plus the NIFTY calendar were requested (the ETF is excluded).
    expect(new Set(requests.map((q) => q.securityId))).toEqual(new Set(["13", ...IDS.map(String)]));
    const st = await breadthStatus(store);
    expect(st).toMatchObject({ running: null, lastError: null, last: { target: "2026-09-29", universe: 12, missing: 0, noData: 0 } });
  }, 60_000);

  it("resumes after hitting the deadline without counting any stock twice", async () => {
    const whole = newStore();
    await runBreadthJob({ store: whole, now: clock(at("2026-09-30")), tuning: TUNING });
    resetDhanState();
    const split = newStore();
    const now = clock(at("2026-09-30"));
    const first = await runBreadthJob({ store: split, now, deadline: now() + 25_000 + 1_200, tuning: TUNING });
    expect(first.status).toBe("progress");
    expect((await breadthStatus(split)).running?.done).toBeGreaterThan(0);
    expect(await published(split)).toEqual(Object.fromEntries(BREADTH_OUTPUT_KEYS.map((k) => [k, []])));
    const second = await runBreadthJob({ store: split, now, tuning: TUNING });
    expect(second.status).toBe("published");
    expect(await published(split)).toEqual(await published(whole));
  }, 60_000);

  it("retries a stock that failed transiently in a later pass", async () => {
    failures = { 105: 2 }; // the client's own retry fails too
    const store = newStore();
    const r = await runBreadthJob({ store, now: clock(at("2026-09-30")), tuning: TUNING });
    expect(r.status).toBe("published");
    expect(requests.filter((q) => q.securityId === "105").length).toBe(3);
    expect(await published(store)).toEqual(expected(TUNING.historyFrom, "2026-09-29"));
  }, 60_000);

  it("publishes nothing when more than 1% of the universe is missing", async () => {
    failures = { 105: 99, 106: 99 };
    const store = newStore();
    const r = await runBreadthJob({ store, now: clock(at("2026-09-30")), tuning: TUNING });
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/2 stocks failed/);
    expect((await store.loadAll())["breadth:adv"]).toBeUndefined();
    expect(await breadthStatus(store)).toMatchObject({ running: null, last: null });
  }, 60_000);

  it("adds only new sessions afterwards and never revises published values", async () => {
    const store = newStore();
    await runBreadthJob({ store, now: clock(at("2026-09-30")), tuning: TUNING });
    const before = await published(store);
    expect((await runBreadthJob({ store, now: clock(at("2026-09-30")), tuning: TUNING })).status).toBe("idle");
    // A later correction of old source data must not rewrite what was published then.
    market[101] = market[101].map((b) => (b.date === "2026-09-28" ? { ...b, close: b.close * 2 } : b));
    resetDhanState();
    const r = await runBreadthJob({ store, now: clock(at("2026-10-02")), tuning: TUNING });
    expect(r).toMatchObject({ status: "published", target: "2026-10-01" });
    const after = await published(store);
    for (const k of BREADTH_OUTPUT_KEYS) {
      expect(after[k].slice(0, before[k].length)).toEqual(before[k]);
      expect(after[k].slice(before[k].length).map((o) => o.date)).toEqual(["2026-09-30", "2026-10-01"]);
    }
    expect(after["breadth:adv"].slice(-2)).toEqual(expected("2026-09-30", "2026-10-01")["breadth:adv"]);
  }, 60_000);

  it("does not run while another instance holds the lease, without Dhan, or in demo mode", async () => {
    const store = newStore();
    expect(await store.acquireJobLease("breadth", "someone-else", 60_000)).toBe(true);
    expect((await runBreadthJob({ store, now: clock(at("2026-09-30")), tuning: TUNING })).status).toBe("busy");
    process.env.DATA_MODE = "demo";
    expect((await runBreadthJob({ store: newStore(), tuning: TUNING })).status).toBe("skipped");
    delete process.env.DATA_MODE;
    delete process.env.DHAN_ACCESS_TOKEN;
    expect((await runBreadthJob({ store: newStore(), tuning: TUNING })).status).toBe("skipped");
    expect(requests).toEqual([]);
  });

  it("only the lease holder can save job state", async () => {
    const store = newStore();
    expect(await store.acquireJobLease("breadth", "a", 60_000)).toBe(true);
    expect(await store.acquireJobLease("breadth", "b", 60_000)).toBe(false);
    expect(await store.saveJobState("breadth", "b", { x: 1 })).toBe(false);
    expect(await store.saveJobState("breadth", "a", { x: 1 })).toBe(true);
    await store.releaseJobLease("breadth", "a");
    expect(await store.acquireJobLease("breadth", "b", 60_000)).toBe(true);
    expect(await store.loadJobState("breadth")).toEqual({ x: 1 });
  });
});
