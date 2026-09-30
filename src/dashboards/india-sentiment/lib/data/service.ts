/**
 * Data service for the India Market Sentiment Terminal: refresh orchestration,
 * authenticated ingestion, caching and alert evaluation. Server-only.
 */
import { after } from "next/server";
import { z } from "zod";
import { fetchFred } from "@/platform/data/fred";
import { mapLimit } from "@/platform/data/http";
import { postWebhook } from "@/platform/data/webhook";
import { sortAndClean, todayISO } from "@/platform/lib/timeseries";
import { describeRule, evaluateRule } from "../alerts";
import { configHash, DEFAULT_CONFIG, resolveConfig, type SentimentConfig } from "../config";
import { prepare, type Prepared } from "../engine/evaluate";
import { backtest, scoreHistory, type BacktestResult, type HistoryPoint } from "../engine/history";
import { aggregatesFor, analyzeChain, bucketIntraday, classifyExpiries, intradayPoint, type ChainAnalysis, type IntradayPoint } from "../engine/options";
import { buildSnapshot, optionsOverview, type Snapshot } from "../engine/snapshot";
import { OPTION_UNDERLYINGS, SERIES, SERIES_BY_KEY } from "../series";
import type { Obs, OptionChainSnapshot, SeriesDef, SeriesMap, SeriesMeta } from "../types";
import { BREADTH_OUTPUT_KEYS } from "./breadth/compute";
import { OFFICIAL_IMPORT_KEYS } from "./official";
import { providerFor, PROVIDERS, type MarketDataProvider, type ProviderStatus } from "./provider";
import { marketMaybeOpen } from "./providers/dhan";
import { demoFallbackStore, getStore, type Store } from "./store";
import { syntheticChain, syntheticSeries } from "./synthetic";

// ------------------------------------------------------------------ data context

/** Why the dashboard shows synthetic data although DATA_MODE is live. */
export interface DemoFallback {
  provider: string;
  state: ProviderStatus["state"];
  expiresAt: string | null;
  lastError: string | null;
}

/**
 * Where data comes from for this request.
 * - `main`: the configured store, in DATA_MODE (live or demo).
 * - `fallback`: DATA_MODE is live but a configured market-data provider is
 *   unusable (expired/invalid token, no data subscription, unreachable), so the
 *   dashboard shows clearly labelled SYNTHETIC data from a separate in-memory
 *   store that is never persisted and never touches the main store.
 */
export interface DataContext {
  key: "main" | "fallback";
  mode: "live" | "demo";
  store: Store;
  fallback: DemoFallback | null;
}

const UNUSABLE: ProviderStatus["state"][] = ["expired", "invalid", "not_subscribed", "unreachable"];

export function providerStatuses(): { name: string; status: ProviderStatus }[] {
  return PROVIDERS.filter((p): p is MarketDataProvider & { status: () => ProviderStatus } => typeof p.status === "function").map((p) => ({ name: p.name, status: p.status() }));
}

export function dataContext(): DataContext {
  if (process.env.DATA_MODE === "demo") return { key: "main", mode: "demo", store: getStore(), fallback: null };
  const bad = providerStatuses().find((p) => p.status.configured && UNUSABLE.includes(p.status.state));
  if (bad) return { key: "fallback", mode: "demo", store: demoFallbackStore, fallback: { provider: bad.name, state: bad.status.state, expiresAt: bad.status.expiresAt, lastError: bad.status.lastError } };
  return { key: "main", mode: "live", store: getStore(), fallback: null };
}

function mainContext(): DataContext {
  return { key: "main", mode: process.env.DATA_MODE === "demo" ? "demo" : "live", store: getStore(), fallback: null };
}

/** Effective data mode ("demo" also while falling back to synthetic data). */
export function dataMode(): "live" | "demo" {
  return dataContext().mode;
}

interface Cache {
  refreshing: Promise<RefreshReport> | null;
  liveRefreshing: Promise<void> | null;
  lastLiveRefresh: number;
  lastProbe: number;
  lastBackfill: number;
  prepared: { version: string; series: SeriesMap; chains: OptionChainSnapshot[]; prepared: Prepared[] } | null;
  snapshots: Map<string, Snapshot>;
  history: Map<string, HistoryPoint[]>;
}
const g = globalThis as unknown as { __imsCaches?: Record<string, Cache> };
function cache(ctx: DataContext): Cache {
  g.__imsCaches ??= {};
  return (g.__imsCaches[ctx.key] ??= { refreshing: null, liveRefreshing: null, lastLiveRefresh: 0, lastProbe: 0, lastBackfill: 0, prepared: null, snapshots: new Map(), history: new Map() });
}
function invalidate(ctx: DataContext) {
  const c = cache(ctx);
  c.prepared = null;
  c.snapshots.clear();
  c.history.clear();
}

/** While falling back, re-check unusable providers every few minutes (a recovered provider switches the dashboard back to live data). */
async function probeProviders(ctx: DataContext, force = false) {
  if (!ctx.fallback) return;
  const c = cache(ctx);
  if (!force && Date.now() - c.lastProbe < 5 * 60_000) return;
  c.lastProbe = Date.now();
  await Promise.all(PROVIDERS.filter((p) => p.probe && p.configured()).map((p) => p.probe!().catch(() => undefined)));
}

export interface RefreshReport {
  startedAt: string;
  finishedAt: string;
  mode: "live" | "demo";
  ok: string[];
  failed: { key: string; error: string }[];
  skipped: { key: string; reason: string }[];
}

const meta = (def: SeriesDef, origin: string, status: "ok" | "error", error: string | null, synthetic: boolean, sourceLastUpdated: string | null = null): SeriesMeta => ({
  key: def.key,
  kind: def.kind,
  sourceId: def.sourceId,
  origin,
  fetchedAt: new Date().toISOString(),
  sourceLastUpdated,
  fetchStatus: status,
  fetchError: error,
  synthetic,
});

// ------------------------------------------------------------------ option chains

/** Stores a chain, appends an intraday pressure point and updates the derived daily option series. */
async function storeChain(ctx: DataContext, chain: OptionChainSnapshot, origin: string): Promise<void> {
  const store = ctx.store;
  const prev = (await store.getChains()).find((c) => c.underlying === chain.underlying);
  const opts = { window: DEFAULT_CONFIG.strikeWindow, atmBandSteps: DEFAULT_CONFIG.atmBandSteps, riskFreeRate: DEFAULT_CONFIG.riskFreeRate };
  if (prev && prev.timestamp < chain.timestamp) {
    const pt = intradayPoint(prev, chain, opts);
    if (pt) await store.addIntraday(chain.underlying, [pt]);
  }
  await store.saveChain(chain);
  if (!(OPTION_UNDERLYINGS as readonly string[]).includes(chain.underlying)) return;
  const ov = optionsOverview(chain, DEFAULT_CONFIG);
  if (!ov?.near) return;
  const a = aggregatesFor(ov.near, ov.shift);
  const date = chain.timestamp.slice(0, 10);
  const values: Record<string, number | null> = {
    oi_pcr: a.oiPcr,
    premium_pcr: a.premiumPcr,
    call_premium: a.callPremiumCr,
    put_premium: a.putPremiumCr,
    pressure: a.pressure,
    writing_balance: a.writingBalance,
    atm_iv: a.atmIv,
    skew25d: a.skew25d,
    maxpain_dist: a.maxPainDistPct,
    later_positioning: a.laterPositioning,
  };
  for (const [m, v] of Object.entries(values)) {
    const def = SERIES_BY_KEY[`opt:${chain.underlying}:${m}`];
    if (!def || v === null || !Number.isFinite(v)) continue;
    await store.saveSeries(meta(def, origin, "ok", null, chain.synthetic), [{ date, value: v }], "merge");
  }
}

async function refreshDemoChains(ctx: DataContext) {
  const store = ctx.store;
  for (const u of OPTION_UNDERLYINGS) {
    // Intraday snapshots every 5 minutes through the session, then the closing chain.
    const snaps = Array.from({ length: 76 }, (_, k) => syntheticChain(u, k * 5));
    const pts: IntradayPoint[] = [];
    const opts = { window: DEFAULT_CONFIG.strikeWindow, atmBandSteps: DEFAULT_CONFIG.atmBandSteps, riskFreeRate: DEFAULT_CONFIG.riskFreeRate };
    for (let k = 1; k < snaps.length; k++) {
      const p = intradayPoint(snaps[k - 1], snaps[k], opts);
      if (p) pts.push(p);
    }
    await store.addIntraday(u, pts);
    await storeChain(ctx, snaps[snaps.length - 1], "synthetic");
  }
}

// ------------------------------------------------------------------ refresh

/** Full refresh of every series and option chain for the current data context (cron, first load, stale data). */
export async function refreshAll(): Promise<RefreshReport> {
  let ctx = dataContext();
  if (ctx.fallback) {
    // A scheduled refresh is the natural moment to see whether the provider works again.
    await probeProviders(ctx, true);
    ctx = dataContext();
  }
  return refreshContext(ctx);
}

async function refreshContext(ctx: DataContext): Promise<RefreshReport> {
  const c = cache(ctx);
  if (c.refreshing) return c.refreshing;
  c.refreshing = (async () => {
    const store = ctx.store;
    const mode = ctx.mode;
    const startedAt = new Date().toISOString();
    const ok: string[] = [];
    const failed: { key: string; error: string }[] = [];
    const skipped: { key: string; reason: string }[] = [];
    const todo = SERIES.filter((d) => {
      if (mode === "demo") return true;
      if (d.kind === "derived") return false; // computed from ingested chains
      if (d.kind === "fred") return true;
      if (providerFor(d)) return true;
      const breadthJob = PROVIDERS.some((p) => p.name === "dhan" && p.configured()) && (BREADTH_OUTPUT_KEYS as readonly string[]).includes(d.key);
      skipped.push({
        key: d.key,
        reason: breadthJob
          ? "computed from Dhan stock candles by the breadth job (/api/cron/india-breadth)"
          : OFFICIAL_IMPORT_KEYS.includes(d.key)
            ? "imported by the official-series job (/api/cron/india-official)"
            : d.kind === "market"
              ? "no market-data provider configured (ingest via API)"
              : "official release: load via ingestion API",
      });
      return false;
    });
    // Live option chains have their own rate bucket: fetch them alongside the series so a slow
    // source (e.g. FRED throttling) does not delay them. Demo chains must follow the series.
    const liveChains =
      mode === "demo"
        ? Promise.resolve()
        : (async () => {
            for (const p of PROVIDERS.filter((x) => x.configured() && x.fetchOptionChain))
              for (const u of OPTION_UNDERLYINGS) {
                const chain = await p.fetchOptionChain!(u).catch((e) => {
                  failed.push({ key: `chain:${u}`, error: e instanceof Error ? e.message : String(e) });
                  return null;
                });
                if (chain) await storeChain(ctx, chain, p.name);
              }
          })().catch((e) => {
            failed.push({ key: "option-chains", error: e instanceof Error ? e.message : String(e) });
          });
    let timeouts = 0;
    await mapLimit(todo, mode === "demo" ? 8 : 4, async (def) => {
      try {
        if (mode !== "demo" && timeouts >= 6 && ok.length === 0) throw new Error("source unreachable (repeated timeouts); skipped this run");
        let obs: Obs[];
        let origin: string;
        let lastUpdated: string | null = null;
        if (mode === "demo") {
          obs = syntheticSeries(def);
          origin = "synthetic";
          if (!obs.length) {
            skipped.push({ key: def.key, reason: "no synthetic definition" });
            return;
          }
        } else if (def.kind === "fred") {
          const r = await fetchFred(def);
          obs = r.obs;
          lastUpdated = r.sourceLastUpdated;
          origin = "fred";
        } else {
          const p = providerFor(def)!;
          obs = sortAndClean(await p.fetchSeries(def));
          origin = p.name;
        }
        if (!obs.length) throw new Error("no observations returned");
        await store.saveSeries(meta(def, origin, "ok", null, mode === "demo", lastUpdated), obs, "replace");
        ok.push(def.key);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/timed out/.test(msg)) timeouts++;
        failed.push({ key: def.key, error: msg });
        await store.saveSeries(meta(def, def.kind, "error", msg.slice(0, 500), mode === "demo"), null, "merge");
      }
    });
    try {
      if (mode === "demo") await refreshDemoChains(ctx);
    } catch (e) {
      failed.push({ key: "option-chains", error: e instanceof Error ? e.message : String(e) });
    }
    await liveChains;
    invalidate(ctx);
    await afterDataChange(ctx);
    c.lastLiveRefresh = Date.now();
    return { startedAt, finishedAt: new Date().toISOString(), mode, ok, failed, skipped };
  })();
  try {
    return await c.refreshing;
  } finally {
    c.refreshing = null;
  }
}

/**
 * Intraday refresh while the market may be open: today's index values (one
 * quote request) and the current-expiry option chains, merged with the stored
 * later expiries. Runs at most every INDIA_LIVE_REFRESH_SECONDS (default 180).
 */
async function refreshLive(ctx: DataContext): Promise<void> {
  const c = cache(ctx);
  const every = Math.max(60, Number(process.env.INDIA_LIVE_REFRESH_SECONDS) || 180) * 1000;
  // Runs even while a full refresh is in progress (a slow source must not freeze intraday data);
  // provider requests are serialised per rate bucket by the provider client.
  if (ctx.mode !== "live" || c.liveRefreshing || Date.now() - c.lastLiveRefresh < every || !marketMaybeOpen(Date.now())) return;
  const providers = PROVIDERS.filter((p) => p.configured() && (p.fetchTodayValues || p.fetchOptionChain));
  if (!providers.length) return;
  c.lastLiveRefresh = Date.now();
  c.liveRefreshing = (async () => {
    const store = ctx.store;
    let changed = false;
    for (const p of providers) {
      try {
        for (const { key, obs } of (await p.fetchTodayValues?.()) ?? []) {
          const def = SERIES_BY_KEY[key];
          if (!def) continue;
          await store.saveSeries(meta(def, p.name, "ok", null, false), [obs], "merge");
          changed = true;
        }
      } catch (e) {
        console.error(`india-sentiment ${p.name} intraday index refresh failed`, e instanceof Error ? e.message : e);
      }
      if (!p.fetchOptionChain) continue;
      for (const u of OPTION_UNDERLYINGS) {
        try {
          const near = await p.fetchOptionChain(u, "near");
          if (!near) continue;
          const prev = (await store.getChains()).find((x) => x.underlying === u);
          const nearExp = new Set(near.records.map((r) => r.expiry));
          const later = prev && prev.source === near.source ? prev.records.filter((r) => !nearExp.has(r.expiry)) : [];
          await storeChain(ctx, { ...near, records: [...near.records, ...later] }, p.name);
          changed = true;
        } catch (e) {
          console.error(`india-sentiment ${p.name} intraday chain refresh failed for ${u}`, e instanceof Error ? e.message : e);
        }
      }
    }
    if (changed) {
      invalidate(ctx);
      await afterDataChange(ctx);
    }
  })().finally(() => {
    c.liveRefreshing = null;
  });
  keepAlive(c.liveRefreshing);
}

async function afterDataChange(ctx: DataContext) {
  try {
    const snap = await snapshotFor(ctx, null);
    await ctx.store.saveSnapshot(
      { asOf: snap.asOf, score: snap.score, confidence: snap.confidence.score, band: snap.band?.label ?? null, regime: snap.regime.primary },
      { momentum: snap.momentum, factors: snap.factors.map((f) => ({ id: f.id, score: f.score, weight: f.effectiveWeight })) },
    );
    // Alerts are real user settings: never evaluate them against fallback (synthetic) data.
    if (!ctx.fallback) await evaluateAlerts(snap);
  } catch (e) {
    console.error("india-sentiment post-refresh processing failed", e);
  }
}

/** Recomputes caches, the stored snapshot and alerts after data was written outside refresh/ingest (e.g. by the breadth job). */
export async function afterExternalWrite(): Promise<void> {
  const ctx = mainContext();
  invalidate(ctx);
  await afterDataChange(ctx);
}

// ------------------------------------------------------------------ ingestion

const DateZ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const RecordZ = z.object({
  underlying: z.string().regex(/^[A-Z0-9&-]{1,20}$/),
  expiry: DateZ,
  strike: z.number().finite().positive(),
  type: z.enum(["CE", "PE"]),
  ltp: z.number().finite().nonnegative().nullable(),
  prevClose: z.number().finite().nonnegative().nullable().optional(),
  volume: z.number().finite().nonnegative(),
  oi: z.number().finite().nonnegative(),
  changeInOi: z.number().finite(),
  iv: z.number().finite().min(0).max(500).nullable(),
  prevIv: z.number().finite().min(0).max(500).nullable().optional(),
  bid: z.number().finite().nonnegative().nullable().optional(),
  ask: z.number().finite().nonnegative().nullable().optional(),
  timestamp: z.string().max(40),
  lotSize: z.number().int().positive().max(100000),
});
const ChainZ = z.object({
  underlying: z.string().regex(/^[A-Z0-9&-]{1,20}$/),
  spot: z.number().finite().positive(),
  timestamp: z.string().refine((s) => Number.isFinite(Date.parse(s)), "invalid timestamp"),
  volumeUnit: z.enum(["contracts", "shares"]),
  records: z.array(RecordZ).min(1).max(20000),
});
export const IngestSchema = z.object({
  source: z.string().trim().min(1).max(60),
  series: z
    .array(z.object({ key: z.string().max(80), observations: z.array(z.object({ date: DateZ, value: z.number().finite() })).min(1).max(50000), replace: z.boolean().optional() }))
    .max(300)
    .optional(),
  optionChains: z.array(ChainZ).max(10).optional(),
});
export type IngestPayload = z.infer<typeof IngestSchema>;

export async function ingest(p: IngestPayload): Promise<{ series: { key: string; count: number }[]; chains: string[]; rejected: { key: string; reason: string }[] }> {
  // Ingested data always goes to the main store, even while the dashboard shows fallback data.
  const ctx = mainContext();
  const store = ctx.store;
  const rejected: { key: string; reason: string }[] = [];
  const done: { key: string; count: number }[] = [];
  for (const s of p.series ?? []) {
    const def = SERIES_BY_KEY[s.key];
    if (!def) {
      rejected.push({ key: s.key, reason: "unknown series key" });
      continue;
    }
    if (def.kind === "fred" || def.kind === "derived") {
      rejected.push({ key: s.key, reason: `${def.kind} series are fetched/computed automatically` });
      continue;
    }
    const obs = sortAndClean(s.observations);
    await store.saveSeries(meta(def, `ingest:${p.source}`, "ok", null, false), obs, s.replace ? "replace" : "merge");
    done.push({ key: s.key, count: obs.length });
  }
  const chains: string[] = [];
  for (const ch of p.optionChains ?? []) {
    if (ch.records.some((r) => r.underlying !== ch.underlying)) {
      rejected.push({ key: `chain:${ch.underlying}`, reason: "record underlying does not match chain underlying" });
      continue;
    }
    await storeChain(ctx, { ...ch, source: `ingest:${p.source}`, synthetic: false }, `ingest:${p.source}`);
    chains.push(ch.underlying);
  }
  invalidate(ctx);
  if (done.length || chains.length) await afterDataChange(ctx);
  return { series: done, chains, rejected };
}

// ------------------------------------------------------------------ reads

const FIRST_LOAD_BUDGET_MS = 25_000;
const TTL_MS = () => Math.max(60, Number(process.env.CACHE_TTL_SECONDS) || 3600) * 1000;

function keepAlive(p: Promise<unknown>) {
  const guarded = p.catch((e) => console.error("india-sentiment background refresh failed", e));
  try {
    after(() => guarded);
  } catch {
    /* outside a request scope */
  }
}

async function ensureData(ctx: DataContext): Promise<void> {
  const store = ctx.store;
  const all = await store.loadAll();
  const keys = Object.keys(all);
  if (!keys.length) {
    const job = refreshContext(ctx);
    keepAlive(job);
    await Promise.race([job, new Promise((r) => setTimeout(r, FIRST_LOAD_BUDGET_MS))]);
    return;
  }
  const demoMismatch = (ctx.mode === "demo") !== keys.some((k) => all[k]?.meta.synthetic);
  if (demoMismatch) {
    await refreshContext(ctx);
    return;
  }
  const newest = keys.reduce<string | null>((m, k) => {
    const f = all[k]?.meta.origin === "fred" || all[k]?.meta.origin === "synthetic" ? (all[k]?.meta.fetchedAt ?? null) : null;
    return f && (!m || f > m) ? f : m;
  }, null);
  const age = newest ? Date.now() - Date.parse(newest) : Infinity;
  const limit = store.kind === "memory" ? TTL_MS() : 26 * 3600 * 1000;
  // A provider configured after the last refresh (e.g. a Dhan token added to a running deployment):
  // load what it supplies now instead of waiting for the data to go stale or for the nightly cron.
  // Throttled; a failed fetch stores error metadata, so the same series is not retried on every request.
  const c = cache(ctx);
  const unloaded = ctx.mode === "live" && SERIES.some((d) => !all[d.key] && providerFor(d) !== null);
  const backfill = unloaded && Date.now() - c.lastBackfill > 15 * 60_000;
  if ((age > limit || backfill) && !c.refreshing) {
    if (backfill) c.lastBackfill = Date.now();
    keepAlive(refreshContext(ctx));
  } else void refreshLive(ctx);
  if (ctx.fallback) keepAlive(probeProviders(ctx));
}

function newestFetch(series: SeriesMap, chains: OptionChainSnapshot[]): string | null {
  let m: string | null = null;
  for (const s of Object.values(series)) if (s?.meta.fetchedAt && (!m || s.meta.fetchedAt > m)) m = s.meta.fetchedAt;
  // Chain snapshots carry their market timestamp; ignore any that lie ahead of the clock (e.g. synthetic closes).
  const nowIso = new Date().toISOString();
  for (const ch of chains) {
    const t = new Date(ch.timestamp).toISOString();
    if (t <= nowIso && (!m || t > m)) m = t;
  }
  return m;
}

/**
 * Cheap status for polling pages: the data context and store version plus when
 * the data behind it was last fetched. Never loads observations; starts a
 * background refresh when data is stale (or an intraday refresh while the
 * market may be open) and re-checks an unusable provider while falling back.
 */
export async function liveStatus(): Promise<{ version: string; updatedAt: string | null; note: string | null }> {
  const ctx = dataContext();
  const version = `${ctx.key}:${await ctx.store.dataVersion()}`;
  const c = cache(ctx);
  const current = c.prepared !== null && `${ctx.key}:${c.prepared.version}` === version;
  const updatedAt = current ? newestFetch(c.prepared!.series, c.prepared!.chains) : null;
  const fetched = current ? newestFetch(c.prepared!.series, []) : null;
  const limit = ctx.store.kind === "memory" ? TTL_MS() : 26 * 3600 * 1000;
  if (fetched && Date.now() - Date.parse(fetched) > limit && !c.refreshing) keepAlive(refreshContext(ctx));
  else if (current) void refreshLive(ctx);
  if (ctx.fallback) keepAlive(probeProviders(ctx));
  return { version, updatedAt, note: ctx.fallback ? `Showing synthetic demo data: ${fallbackReason(ctx.fallback)}` : null };
}

/** "30 Sept, 14:05 IST". */
export function istLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) + " IST";
}

/** Short, secret-free reason for a provider fallback. */
export function fallbackReason(f: DemoFallback): string {
  const who = f.provider === "dhan" ? "Dhan" : f.provider;
  if (f.state === "expired") return `${who} access token expired${f.expiresAt ? ` ${istLabel(f.expiresAt)}` : ""}`;
  if (f.state === "invalid") return `${who} rejected the access token or client id`;
  if (f.state === "not_subscribed") return `${who} Data API subscription is not active`;
  return `${who} API is unreachable`;
}

async function loadPrepared(ctx: DataContext = dataContext()) {
  await ensureData(ctx);
  const store = ctx.store;
  const version = await store.dataVersion();
  const c = cache(ctx);
  if (c.prepared?.version === version) return c.prepared;
  const [series, chains] = await Promise.all([store.loadAll(), store.getChains()]);
  c.prepared = { version, series, chains, prepared: prepare(series) };
  c.snapshots.clear();
  c.history.clear();
  return c.prepared;
}

function asOfFor(series: SeriesMap): string {
  // Latest NIFTY session if available (weekends/holidays), else today.
  const n = series["idx:NIFTY50"]?.obs;
  const today = todayISO();
  return n?.length && n[n.length - 1].date <= today ? n[n.length - 1].date : today;
}

async function snapshotFor(ctx: DataContext, overridesRaw: string | null): Promise<Snapshot> {
  const { version, series, chains, prepared } = await loadPrepared(ctx);
  const cfg = resolveConfig(overridesRaw);
  const asOf = asOfFor(series);
  const key = `${version}|${configHash(cfg)}|${asOf}|${todayISO()}`;
  const c = cache(ctx);
  const hit = c.snapshots.get(key);
  if (hit) return hit;
  const snap = buildSnapshot({ prepared, series, chains, cfg, asOf, dataMode: ctx.mode });
  if (c.snapshots.size > 20) c.snapshots.clear();
  c.snapshots.set(key, snap);
  return snap;
}

export async function getSnapshot(overridesRaw: string | null): Promise<Snapshot> {
  return snapshotFor(dataContext(), overridesRaw);
}

async function historyFor(ctx: DataContext, overridesRaw: string | null): Promise<{ history: HistoryPoint[]; cfg: SentimentConfig; series: SeriesMap }> {
  const { version, series, prepared } = await loadPrepared(ctx);
  const cfg = resolveConfig(overridesRaw);
  const key = `${version}|${configHash(cfg)}`;
  const c = cache(ctx);
  let h = c.history.get(key);
  if (!h) {
    h = scoreHistory(prepared, series, cfg, "2006-01-01", asOfFor(series));
    if (c.history.size > 4) c.history.clear();
    c.history.set(key, h);
  }
  return { history: h, cfg, series };
}

export async function getHistory(overridesRaw: string | null): Promise<{ history: HistoryPoint[]; cfg: SentimentConfig; series: SeriesMap }> {
  return historyFor(dataContext(), overridesRaw);
}

export async function getSnapshotWithAnalogues(overridesRaw: string | null): Promise<Snapshot> {
  const ctx = dataContext();
  const { series, chains, prepared } = await loadPrepared(ctx);
  const { history, cfg } = await historyFor(ctx, overridesRaw);
  return buildSnapshot({ prepared, series, chains, history, cfg, asOf: asOfFor(series), dataMode: ctx.mode });
}

export async function getBacktest(overridesRaw: string | null, minCoverage: number): Promise<BacktestResult> {
  const { history, cfg, series } = await getHistory(overridesRaw);
  return backtest(history, series["idx:NIFTY50"]?.obs ?? [], cfg, minCoverage);
}

export async function getSeriesMap(): Promise<SeriesMap> {
  return (await loadPrepared()).series;
}

export async function getPrepared() {
  return loadPrepared();
}

export interface ChainView {
  underlying: string;
  underlyings: string[];
  expiries: { expiry: string; kinds: string[] }[];
  analysis: ChainAnalysis | null;
  synthetic: boolean;
  source: string;
}

export async function getChainView(underlying: string, expiry: string | null, window: number, cfg: SentimentConfig): Promise<ChainView> {
  const { chains } = await loadPrepared();
  const underlyings = chains.map((c) => c.underlying).sort();
  const chain = chains.find((c) => c.underlying === underlying) ?? chains.find((c) => c.underlying === "NIFTY") ?? chains[0];
  if (!chain) return { underlying, underlyings, expiries: [], analysis: null, synthetic: false, source: "—" };
  const expiries = classifyExpiries(chain.records.map((r) => r.expiry), chain.timestamp.slice(0, 10));
  const all = [...new Set(chain.records.map((r) => r.expiry))].sort().map((e) => ({ expiry: e, kinds: expiries.find((x) => x.expiry === e)?.kinds ?? [] }));
  const exp = expiry && all.some((e) => e.expiry === expiry) ? expiry : (expiries[0]?.expiry ?? all[0]?.expiry);
  const analysis = exp ? analyzeChain(chain, { expiry: exp, window, atmBandSteps: cfg.atmBandSteps, riskFreeRate: cfg.riskFreeRate }) : null;
  return { underlying: chain.underlying, underlyings, expiries: all, analysis, synthetic: chain.synthetic, source: chain.source };
}

export async function getIntraday(underlying: string, minutes: number): Promise<IntradayPoint[]> {
  const ctx = dataContext();
  const { chains } = await loadPrepared(ctx);
  const chain = chains.find((c) => c.underlying === underlying);
  if (!chain) return [];
  const day = chain.timestamp.slice(0, 10);
  const pts = await ctx.store.getIntraday(underlying, new Date(Date.parse(day + "T00:00:00+05:30")).toISOString());
  return minutes > 5 ? bucketIntraday(pts, minutes) : pts;
}

/**
 * Today's intraday prices of an option underlying straight from the provider
 * (e.g. Dhan 5-minute candles), for the price panel above premium pressure.
 * Empty in demo/fallback mode, without a provider or outside trading days.
 */
export async function getIntradayPrices(underlying: string): Promise<{ ts: string; value: number }[]> {
  const ctx = dataContext();
  if (ctx.mode !== "live") return [];
  const p = PROVIDERS.find((x) => x.configured() && x.fetchIntradayPrices);
  if (!p) return [];
  return p.fetchIntradayPrices!(underlying).catch(() => []);
}

// ------------------------------------------------------------------ alerts

export async function evaluateAlerts(snap: Snapshot) {
  const store = getStore();
  for (const a of await store.listAlerts()) {
    if (!a.enabled) continue;
    const res = evaluateRule(a.rule, snap, { state: a.lastState, value: a.lastValue });
    await store.recordAlertEvaluation(a.id, res.state, res.value, res.fire);
    if (res.fire) {
      const message = `${a.name}: ${describeRule(a.rule)} (${res.detail})`;
      await store.addAlertEvent(a.id, message, res.value);
      await postWebhook({ dashboard: "india-sentiment", alert: a.name, rule: a.rule, message, value: res.value, asOf: snap.asOf, synthetic: snap.dataMode === "demo" });
    }
  }
}

export function environmentStatus() {
  return {
    dataMode: dataMode(),
    fredApiKey: !!process.env.FRED_API_KEY,
    database: !!process.env.DATABASE_URL,
    adminToken: !!process.env.ADMIN_TOKEN,
    alertWebhook: !!process.env.ALERT_WEBHOOK_URL,
    configOverrides: !!process.env.INDIA_SENTIMENT_CONFIG_OVERRIDES,
    marketProviders: PROVIDERS.filter((p) => p.configured()).map((p) => p.name),
    providers: providerStatuses(),
    fallback: dataContext().fallback,
  };
}
