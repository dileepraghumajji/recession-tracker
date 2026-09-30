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
import { providerFor, PROVIDERS } from "./provider";
import { getStore } from "./store";
import { syntheticChain, syntheticSeries } from "./synthetic";

export function dataMode(): "live" | "demo" {
  return process.env.DATA_MODE === "demo" ? "demo" : "live";
}

interface Cache {
  refreshing: Promise<RefreshReport> | null;
  prepared: { version: string; series: SeriesMap; chains: OptionChainSnapshot[]; prepared: Prepared[] } | null;
  snapshots: Map<string, Snapshot>;
  history: Map<string, HistoryPoint[]>;
}
const g = globalThis as unknown as { __imsCache?: Cache };
function cache(): Cache {
  if (!g.__imsCache) g.__imsCache = { refreshing: null, prepared: null, snapshots: new Map(), history: new Map() };
  return g.__imsCache;
}
function invalidate() {
  const c = cache();
  c.prepared = null;
  c.snapshots.clear();
  c.history.clear();
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
async function storeChain(chain: OptionChainSnapshot, origin: string): Promise<void> {
  const store = getStore();
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

async function refreshDemoChains() {
  const store = getStore();
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
    await storeChain(snaps[snaps.length - 1], "synthetic");
  }
}

// ------------------------------------------------------------------ refresh

export async function refreshAll(): Promise<RefreshReport> {
  const c = cache();
  if (c.refreshing) return c.refreshing;
  c.refreshing = (async () => {
    const store = getStore();
    const mode = dataMode();
    const startedAt = new Date().toISOString();
    const ok: string[] = [];
    const failed: { key: string; error: string }[] = [];
    const skipped: { key: string; reason: string }[] = [];
    const todo = SERIES.filter((d) => {
      if (mode === "demo") return true;
      if (d.kind === "derived") return false; // computed from ingested chains
      if (d.kind === "fred") return true;
      if (providerFor(d)) return true;
      skipped.push({ key: d.key, reason: d.kind === "market" ? "no market-data provider configured (ingest via API)" : "official release: load via ingestion API" });
      return false;
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
      if (mode === "demo") await refreshDemoChains();
      else
        for (const p of PROVIDERS.filter((x) => x.configured() && x.fetchOptionChain))
          for (const u of OPTION_UNDERLYINGS) {
            const chain = await p.fetchOptionChain!(u).catch((e) => {
              failed.push({ key: `chain:${u}`, error: e instanceof Error ? e.message : String(e) });
              return null;
            });
            if (chain) await storeChain(chain, p.name);
          }
    } catch (e) {
      failed.push({ key: "option-chains", error: e instanceof Error ? e.message : String(e) });
    }
    invalidate();
    await afterDataChange();
    return { startedAt, finishedAt: new Date().toISOString(), mode, ok, failed, skipped };
  })();
  try {
    return await c.refreshing;
  } finally {
    c.refreshing = null;
  }
}

async function afterDataChange() {
  try {
    const snap = await getSnapshot(null);
    await getStore().saveSnapshot(
      { asOf: snap.asOf, score: snap.score, confidence: snap.confidence.score, band: snap.band?.label ?? null, regime: snap.regime.primary },
      { momentum: snap.momentum, factors: snap.factors.map((f) => ({ id: f.id, score: f.score, weight: f.effectiveWeight })) },
    );
    await evaluateAlerts(snap);
  } catch (e) {
    console.error("india-sentiment post-refresh processing failed", e);
  }
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
  const store = getStore();
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
    await storeChain({ ...ch, source: `ingest:${p.source}`, synthetic: false }, `ingest:${p.source}`);
    chains.push(ch.underlying);
  }
  invalidate();
  if (done.length || chains.length) await afterDataChange();
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

async function ensureData(): Promise<void> {
  const store = getStore();
  const all = await store.loadAll();
  const keys = Object.keys(all);
  if (!keys.length) {
    const job = refreshAll();
    keepAlive(job);
    await Promise.race([job, new Promise((r) => setTimeout(r, FIRST_LOAD_BUDGET_MS))]);
    return;
  }
  const demoMismatch = (dataMode() === "demo") !== keys.some((k) => all[k]?.meta.synthetic);
  if (demoMismatch) {
    await refreshAll();
    return;
  }
  const newest = keys.reduce<string | null>((m, k) => {
    const f = all[k]?.meta.origin === "fred" || all[k]?.meta.origin === "synthetic" ? (all[k]?.meta.fetchedAt ?? null) : null;
    return f && (!m || f > m) ? f : m;
  }, null);
  const age = newest ? Date.now() - Date.parse(newest) : Infinity;
  const limit = store.kind === "memory" ? TTL_MS() : 26 * 3600 * 1000;
  if (age > limit && !cache().refreshing) keepAlive(refreshAll());
}

async function loadPrepared() {
  await ensureData();
  const store = getStore();
  const version = await store.dataVersion();
  const c = cache();
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

export async function getSnapshot(overridesRaw: string | null): Promise<Snapshot> {
  const { version, series, chains, prepared } = await loadPrepared();
  const cfg = resolveConfig(overridesRaw);
  const asOf = asOfFor(series);
  const key = `${version}|${configHash(cfg)}|${asOf}|${todayISO()}`;
  const c = cache();
  const hit = c.snapshots.get(key);
  if (hit) return hit;
  const snap = buildSnapshot({ prepared, series, chains, cfg, asOf, dataMode: dataMode() });
  if (c.snapshots.size > 20) c.snapshots.clear();
  c.snapshots.set(key, snap);
  return snap;
}

export async function getHistory(overridesRaw: string | null): Promise<{ history: HistoryPoint[]; cfg: SentimentConfig; series: SeriesMap }> {
  const { version, series, prepared } = await loadPrepared();
  const cfg = resolveConfig(overridesRaw);
  const key = `${version}|${configHash(cfg)}`;
  const c = cache();
  let h = c.history.get(key);
  if (!h) {
    h = scoreHistory(prepared, series, cfg, "2006-01-01", asOfFor(series));
    if (c.history.size > 4) c.history.clear();
    c.history.set(key, h);
  }
  return { history: h, cfg, series };
}

export async function getSnapshotWithAnalogues(overridesRaw: string | null): Promise<Snapshot> {
  const { series, chains, prepared } = await loadPrepared();
  const { history, cfg } = await getHistory(overridesRaw);
  return buildSnapshot({ prepared, series, chains, history, cfg, asOf: asOfFor(series), dataMode: dataMode() });
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
  const { chains } = await loadPrepared();
  const chain = chains.find((c) => c.underlying === underlying);
  if (!chain) return [];
  const day = chain.timestamp.slice(0, 10);
  const pts = await getStore().getIntraday(underlying, new Date(Date.parse(day + "T00:00:00+05:30")).toISOString());
  return minutes > 5 ? bucketIntraday(pts, minutes) : pts;
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
  };
}
