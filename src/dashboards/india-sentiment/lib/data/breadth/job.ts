/**
 * Market-breadth job: fetches every NSE mainboard stock's daily candles from
 * Dhan (read-only /charts/historical) and publishes the breadth:* series.
 *
 * About 2,600 stocks at Dhan's 5 requests/second take ~10 minutes, longer than
 * one serverless invocation may run, so the work is a resumable *cycle*:
 *
 * 1. A cycle targets the last completed NSE session T (from NIFTY 50 candles,
 *    never today's unfinished session) and covers every session after the last
 *    published one (the first cycle reconstructs history from BREADTH_HISTORY_FROM).
 * 2. Stocks are processed in chunks; after each chunk the per-date counters and
 *    the position are checkpointed together, so a crash or time-out never counts
 *    a stock twice or skips one. A lease ensures one instance at a time.
 * 3. Stocks that fail transiently are retried in up to two more passes. The
 *    cycle publishes only when no more than 1% of the universe is missing;
 *    otherwise nothing is published and the next cycle starts over.
 * 4. Only official sessions with a normal number of traded stocks are published
 *    (see breadthSeries); published values are never revised afterwards.
 */
import { mapLimit } from "@/platform/data/http";
import { addDays } from "@/platform/lib/timeseries";
import { SERIES_BY_KEY } from "../../series";
import type { SeriesMeta } from "../../types";
import { DhanError, dhanCredentials, dhanRequest, dhanStatus, dhanUnusable } from "../providers/dhan-client";
import { DHAN_INDEX_IDS, istDate } from "../providers/dhan";
import { getStore, type Store } from "../store";
import { addStock, BREADTH_OUTPUT_KEYS, breadthSeries, candlesToBars, mergeAcc, type Accumulator, type CandleArrays } from "./compute";
import { parseUniverse } from "./universe";

const JOB_KEY = "breadth";
/** First session of the reconstructed history (≥ 10 years for the percentile window). */
export const BREADTH_HISTORY_FROM = "2011-01-03";
/** Calendar days of candles fetched before the first published session: ≥ 200 sessions and 52 weeks. */
const WARMUP_DAYS = 450;
/** Earlier sessions accumulated only so that the completeness check of published sessions has neighbours. */
const CONTEXT_DAYS = 45;
/** Limits; overridable in tests only. */
export interface BreadthTuning {
  historyFrom: string;
  chunk: number;
  concurrency: number;
  minUniverse: number;
  minStocks: number;
}
const DEFAULT_TUNING: BreadthTuning = { historyFrom: BREADTH_HISTORY_FROM, chunk: 40, concurrency: 4, minUniverse: 1000, minStocks: 100 };
const SAVE_EVERY_MS = 20_000;
/** Stop starting chunks this long before the deadline (a chunk takes ~10 s). */
const DEADLINE_MARGIN_MS = 25_000;
const MAX_PASSES = 3;
const MAX_MISSING_SHARE = 0.01;
const MAX_NO_DATA_SHARE = 0.05;

interface Cycle {
  target: string;
  publishFrom: string;
  fetchFrom: string;
  sessions: string[];
  universe: number;
  queue: number[];
  next: number;
  pass: number;
  retry: number[];
  noData: number;
  acc: Accumulator;
  startedAt: string;
}

export interface BreadthLast {
  target: string;
  finishedAt: string;
  universe: number;
  missing: number;
  noData: number;
  publishedFrom: string | null;
  publishedTo: string | null;
  sessionsPublished: number;
  withheld: { date: string; reason: string }[];
}

interface JobState {
  version: 1;
  cycle: Cycle | null;
  last: BreadthLast | null;
  lastError: { at: string; message: string } | null;
}

export interface BreadthRunReport {
  status: "skipped" | "busy" | "idle" | "progress" | "published" | "error";
  message: string;
  target?: string;
  remaining?: number;
}

export interface BreadthStatus {
  last: BreadthLast | null;
  running: { target: string; publishFrom: string; done: number; total: number; pass: number; startedAt: string } | null;
  lastError: { at: string; message: string } | null;
}

const emptyState = (): JobState => ({ version: 1, cycle: null, last: null, lastError: null });

interface Candles extends CandleArrays {
  open?: number[];
}

/** NIFTY 50 daily session dates in [from, today] — the official trading calendar. */
async function sessionDates(from: string, today: string): Promise<string[]> {
  const c = await dhanRequest<Candles>("historicalDaily", { securityId: String(DHAN_INDEX_IDS.NIFTY50), exchangeSegment: "IDX_I", instrument: "INDEX", expiryCode: 0, oi: false, fromDate: from, toDate: addDays(today, 1) }, { cache: false });
  return candlesToBars(c, today).map((b) => b.date);
}

type StockResult = { id: number; kind: "ok" } | { id: number; kind: "no_data" } | { id: number; kind: "retry"; error: string } | { id: number; kind: "fatal"; error: DhanError };

/** Fetches one stock and adds its contribution to `chunkAcc` (merged into the cycle only when the whole chunk succeeds). */
async function processStock(id: number, cycle: Cycle, accFrom: string, chunkAcc: Accumulator): Promise<StockResult> {
  try {
    const c = await dhanRequest<Candles>(
      "historicalDaily",
      { securityId: String(id), exchangeSegment: "NSE_EQ", instrument: "EQUITY", expiryCode: 0, oi: false, fromDate: cycle.fetchFrom, toDate: addDays(cycle.target, 1) },
      { cache: false },
    );
    addStock(chunkAcc, candlesToBars(c, cycle.target), accFrom, cycle.target);
    return { id, kind: "ok" };
  } catch (e) {
    if (!(e instanceof DhanError)) return { id, kind: "retry", error: e instanceof Error ? e.message : String(e) };
    // Credentials, subscription or the daily request budget: stop this run; the cycle resumes later.
    if (e.kind === "auth" || e.kind === "subscription" || e.code === "budget") return { id, kind: "fatal", error: e };
    // Dhan rejects the security or has no candles for it (e.g. suspended since before the window).
    if (e.kind === "no_data" || e.kind === "input") return { id, kind: "no_data" };
    return { id, kind: "retry", error: e.message };
  }
}

const accFromOf = (c: Cycle) => addDays(c.publishFrom, -CONTEXT_DAYS);

function meta(key: string, fetchedAt: string): SeriesMeta {
  const def = SERIES_BY_KEY[key];
  return { key, kind: def.kind, sourceId: def.sourceId, origin: "dhan-breadth", fetchedAt, sourceLastUpdated: null, fetchStatus: "ok", fetchError: null, synthetic: false };
}

/** Last published breadth session in the store (published sessions are never recomputed). */
async function lastPublished(store: Store): Promise<string | null> {
  const obs = (await store.loadAll())["breadth:adv"]?.obs;
  return obs?.length ? obs[obs.length - 1].date : null;
}

export function breadthEnabled(): { ok: true } | { ok: false; reason: string } {
  if (process.env.DATA_MODE === "demo") return { ok: false, reason: "DATA_MODE=demo" };
  if (!dhanCredentials()) return { ok: false, reason: "Dhan is not configured (DHAN_ACCESS_TOKEN)" };
  const s = dhanStatus();
  if (dhanUnusable(s)) return { ok: false, reason: `Dhan is unusable (${s.state})` };
  return { ok: true };
}

/**
 * Runs the breadth job until it is done or `deadline` (epoch ms) approaches.
 * Returns what happened; `published` means new breadth sessions were stored.
 */
export async function runBreadthJob(opts: { deadline?: number; store?: Store; now?: () => number; tuning?: Partial<BreadthTuning> } = {}): Promise<BreadthRunReport> {
  const enabled = breadthEnabled();
  if (!enabled.ok) return { status: "skipped", message: enabled.reason };
  const now = opts.now ?? Date.now;
  const store = opts.store ?? getStore();
  const deadline = opts.deadline ?? Infinity;
  const t = { ...DEFAULT_TUNING, ...opts.tuning };
  const owner = globalThis.crypto.randomUUID();
  const leaseMs = Number.isFinite(deadline) ? Math.max(60_000, deadline - now() + 60_000) : 3 * 3600_000;
  if (!(await store.acquireJobLease(JOB_KEY, owner, leaseMs))) return { status: "busy", message: "another instance is running the breadth job" };
  let state = (await store.loadJobState<JobState>(JOB_KEY)) ?? emptyState();
  const save = async () => {
    if (!(await store.saveJobState(JOB_KEY, owner, state))) throw new Error("breadth job lease lost");
  };
  try {
    const today = istDate(now());
    if (!state.cycle) {
      const published = await lastPublished(store);
      const publishFrom = published ? addDays(published, 1) : t.historyFrom;
      const fetchFrom = addDays(publishFrom, -WARMUP_DAYS);
      // The last *completed* session: today's candle may still be forming.
      const sessions = (await sessionDates(addDays(publishFrom, -CONTEXT_DAYS), today)).filter((d) => d < today);
      const target = sessions[sessions.length - 1];
      if (!target || target < publishFrom) return { status: "idle", message: `breadth is up to date${published ? ` (last session ${published})` : ""}` };
      const universe = parseUniverse(await dhanRequest<string>("instrumentsNseEq", null, { text: true }));
      if (universe.length < t.minUniverse) throw new Error(`NSE_EQ instrument list has only ${universe.length} mainboard stocks; not computing breadth`);
      state.cycle = { target, publishFrom, fetchFrom, sessions, universe: universe.length, queue: universe.map((s) => s.id), next: 0, pass: 1, retry: [], noData: 0, acc: {}, startedAt: new Date(now()).toISOString() };
      await save();
    }
    const cycle = state.cycle;
    const accFrom = accFromOf(cycle);
    let lastSave = now();
    for (;;) {
      if (cycle.next >= cycle.queue.length) {
        if (cycle.retry.length && cycle.pass < MAX_PASSES) {
          cycle.queue = cycle.retry;
          cycle.retry = [];
          cycle.next = 0;
          cycle.pass++;
          continue;
        }
        break;
      }
      if (now() > deadline - DEADLINE_MARGIN_MS) {
        await save();
        return { status: "progress", message: `processed ${cycle.next} of ${cycle.queue.length} stocks (pass ${cycle.pass}); continues on the next run`, target: cycle.target, remaining: cycle.queue.length - cycle.next };
      }
      const chunk = cycle.queue.slice(cycle.next, cycle.next + t.chunk);
      const chunkAcc: Accumulator = {};
      const results = await mapLimit(chunk, t.concurrency, (id) => processStock(id, cycle, accFrom, chunkAcc));
      const fatal = results.find((r): r is Extract<StockResult, { kind: "fatal" }> => r.kind === "fatal");
      if (fatal) {
        // Nothing from this chunk is counted; the checkpoint still points at its first stock.
        state.lastError = { at: new Date(now()).toISOString(), message: fatal.error.message };
        await save();
        return { status: "error", message: fatal.error.message, target: cycle.target, remaining: cycle.queue.length - cycle.next };
      }
      mergeAcc(cycle.acc, chunkAcc);
      state.lastError = null;
      for (const r of results) {
        if (r.kind === "no_data") cycle.noData++;
        else if (r.kind === "retry") cycle.retry.push(r.id);
      }
      cycle.next += chunk.length;
      if (now() - lastSave > SAVE_EVERY_MS) {
        await save();
        lastSave = now();
      }
    }

    // ---- finalize
    const missing = cycle.retry.length;
    if (missing > cycle.universe * MAX_MISSING_SHARE || cycle.noData > cycle.universe * MAX_NO_DATA_SHARE) {
      const message = `breadth for ${cycle.target} not published: ${missing} stocks failed and ${cycle.noData} returned no data out of ${cycle.universe}; the next run starts a new cycle`;
      state = { ...state, cycle: null, lastError: { at: new Date(now()).toISOString(), message } };
      await save();
      return { status: "error", message, target: cycle.target };
    }
    const { series, withheld } = breadthSeries(cycle.acc, { sessions: cycle.sessions, from: cycle.publishFrom, to: cycle.target, minStocks: t.minStocks });
    const fetchedAt = new Date(now()).toISOString();
    for (const key of BREADTH_OUTPUT_KEYS) if (series[key].length) await store.saveSeries(meta(key, fetchedAt), series[key], "merge");
    const dates = series["breadth:adv"].map((o) => o.date);
    state = {
      version: 1,
      cycle: null,
      lastError: null,
      last: { target: cycle.target, finishedAt: fetchedAt, universe: cycle.universe, missing, noData: cycle.noData, publishedFrom: dates[0] ?? null, publishedTo: dates[dates.length - 1] ?? null, sessionsPublished: dates.length, withheld: withheld.slice(-20) },
    };
    await save();
    const w = withheld.length ? `; ${withheld.length} session(s) withheld` : "";
    return dates.length
      ? { status: "published", message: `published ${dates.length} session(s) ${dates[0]} … ${dates[dates.length - 1]} from ${cycle.universe - missing - cycle.noData} of ${cycle.universe} stocks${w}`, target: cycle.target }
      : { status: "idle", message: `no publishable sessions up to ${cycle.target}${w}`, target: cycle.target };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    try {
      state.lastError = { at: new Date(now()).toISOString(), message };
      await store.saveJobState(JOB_KEY, owner, state);
    } catch {
      /* the store itself failed */
    }
    return { status: "error", message };
  } finally {
    await store.releaseJobLease(JOB_KEY, owner).catch(() => undefined);
  }
}

/** Progress and last result of the breadth job (for Settings & Sources). */
export async function breadthStatus(store: Store = getStore()): Promise<BreadthStatus> {
  const s = await store.loadJobState<JobState>(JOB_KEY).catch(() => null);
  const c = s?.cycle ?? null;
  return {
    last: s?.last ?? null,
    running: c ? { target: c.target, publishFrom: c.publishFrom, done: c.pass === 1 ? c.next : c.universe - (c.queue.length - c.next), total: c.universe, pass: c.pass, startedAt: c.startedAt } : null,
    lastError: s?.lastError ?? null,
  };
}
