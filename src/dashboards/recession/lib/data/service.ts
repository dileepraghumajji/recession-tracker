/**
 * Data service: refresh orchestration, caching and snapshot/backtest access.
 * Server-only (reads secrets from the environment).
 */
import { after } from "next/server";
import { evaluateRule, describeRule } from "../alerts";
import { prepareIndicators, type PreparedIndicator } from "../engine/analyze";
import { runHistorical, type MonthRecord } from "../engine/historical";
import { buildSnapshot, type Snapshot } from "../engine/snapshot";
import { configHash, resolveConfig, type ModelConfig } from "../model-config";
import { SERIES } from "../series-catalog";
import type { SeriesDef, SeriesMap, SeriesMeta } from "../types";
import { mapLimit } from "@/platform/data/http";
import { fetchFred } from "./providers/fred";
import { syntheticSeries } from "./providers/synthetic";
import { fetchTwelveData, twelveDataConfigured } from "./providers/twelvedata";
import { getStore } from "./store";
import { postWebhook } from "@/platform/data/webhook";

export function dataMode(): "live" | "demo" {
  return process.env.DATA_MODE === "demo" ? "demo" : "live";
}

interface Cache {
  refreshing: Promise<RefreshReport> | null;
  prepared: { version: string; series: SeriesMap; prepared: PreparedIndicator[] } | null;
  snapshots: Map<string, Snapshot>;
  historical: Map<string, MonthRecord[]>;
}
const g = globalThis as unknown as { __mrsmCache?: Cache };
function cache(): Cache {
  if (!g.__mrsmCache) g.__mrsmCache = { refreshing: null, prepared: null, snapshots: new Map(), historical: new Map() };
  return g.__mrsmCache;
}

export interface RefreshReport {
  startedAt: string;
  finishedAt: string;
  ok: string[];
  failed: { key: string; error: string }[];
  skipped: { key: string; reason: string }[];
  mode: "live" | "demo";
}

async function fetchOne(def: SeriesDef, mode: "live" | "demo") {
  if (mode === "demo") return { obs: syntheticSeries(def), sourceLastUpdated: null };
  if (def.provider === "fred") return fetchFred(def);
  if (def.provider === "twelvedata") return fetchTwelveData(def);
  throw new Error("manual series are not fetched");
}

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
      if (mode === "demo") return d.provider !== "manual";
      if (d.provider === "manual") {
        skipped.push({ key: d.key, reason: "manual (proprietary) series" });
        return false;
      }
      if (d.provider === "twelvedata" && !twelveDataConfigured()) {
        skipped.push({ key: d.key, reason: "TWELVE_DATA_API_KEY not configured" });
        return false;
      }
      return true;
    });
    // Circuit breaker: if the source is unreachable (several timeouts and no
    // success yet), fail the remaining series fast instead of waiting minutes.
    let timeouts = 0;
    const tripped = () => timeouts >= 6 && ok.length === 0;
    // FRED allows ~120 requests/minute per key; 4 concurrent series is well inside that.
    await mapLimit(todo, mode === "demo" ? 8 : 4, async (def) => {
      const now = new Date().toISOString();
      try {
        if (tripped()) throw new Error("source unreachable (repeated timeouts); skipped this run");
        const res = await fetchOne(def, mode);
        if (res.obs.length === 0) throw new Error("no observations returned");
        const meta: SeriesMeta = {
          key: def.key,
          provider: def.provider,
          sourceId: def.sourceId,
          fetchedAt: now,
          sourceLastUpdated: res.sourceLastUpdated,
          fetchStatus: "ok",
          fetchError: null,
          synthetic: mode === "demo",
        };
        await store.saveSeries(meta, res.obs);
        ok.push(def.key);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/timed out/.test(msg)) timeouts++;
        failed.push({ key: def.key, error: msg });
        await store.saveSeries(
          { key: def.key, provider: def.provider, sourceId: def.sourceId, fetchedAt: now, sourceLastUpdated: null, fetchStatus: "error", fetchError: msg.slice(0, 500), synthetic: mode === "demo" },
          null,
        );
      }
    });
    c.snapshots.clear();
    c.historical.clear();
    c.prepared = null;
    const report: RefreshReport = { startedAt, finishedAt: new Date().toISOString(), ok, failed, skipped, mode };
    try {
      const snap = await getSnapshot(null);
      await store.saveSnapshot(
        {
          asOf: snap.asOf,
          recession: snap.scores.recession.score,
          inflation: snap.scores.inflation.score,
          financial: snap.scores.financial.score,
          overall: snap.scores.overall.score,
          regime: snap.regime.display,
          freshness: snap.dataQuality.freshness,
        },
        { scores: snap.scoreChanges, regime: snap.regime.primary, confluence: snap.confluence.stressed },
      );
      await evaluateAlerts(snap);
    } catch (e) {
      console.error("post-refresh processing failed", e);
    }
    return report;
  })();
  try {
    return await c.refreshing;
  } finally {
    c.refreshing = null;
  }
}

const FIRST_LOAD_BUDGET_MS = 25_000;

/** Keeps a serverless invocation alive until background work finishes (Next.js `after`), when inside a request. */
function keepAlive(p: Promise<unknown>) {
  const guarded = p.catch((e) => console.error("background refresh failed", e));
  try {
    after(() => guarded);
  } catch {
    /* outside a request scope (scripts): the promise simply runs */
  }
}

const TTL_MS = () => Math.max(60, Number(process.env.CACHE_TTL_SECONDS) || 3600) * 1000;

async function ensureData(): Promise<void> {
  const store = getStore();
  const all = await store.loadAll();
  const keys = Object.keys(all);
  if (keys.length === 0) {
    // First load on this instance: wait up to FIRST_LOAD_BUDGET_MS, then render
    // with whatever is available (marked unavailable) while loading continues.
    const job = refreshAll();
    keepAlive(job);
    await Promise.race([job, new Promise((r) => setTimeout(r, FIRST_LOAD_BUDGET_MS))]);
    return;
  }
  const newest = keys.reduce<string | null>((m, k) => {
    const f = all[k]?.meta.fetchedAt ?? null;
    return f && (!m || f > m) ? f : m;
  }, null);
  const age = newest ? Date.now() - Date.parse(newest) : Infinity;
  const demoMismatch = (dataMode() === "demo") !== keys.some((k) => all[k]?.meta.synthetic);
  if (demoMismatch) {
    await refreshAll();
    return;
  }
  const limit = store.kind === "memory" ? TTL_MS() : 26 * 3600 * 1000;
  if (age > limit && !cache().refreshing) {
    // Serve current data; refresh in the background (the scheduled cron is the primary mechanism).
    keepAlive(refreshAll());
  }
}

async function loadPrepared(): Promise<{ version: string; series: SeriesMap; prepared: PreparedIndicator[] }> {
  await ensureData();
  const store = getStore();
  const version = await store.dataVersion();
  const c = cache();
  if (c.prepared && c.prepared.version === version) return c.prepared;
  const series = await store.loadAll();
  const prepared = prepareIndicators(series);
  c.prepared = { version, series, prepared };
  c.snapshots.clear();
  c.historical.clear();
  return c.prepared;
}

export async function getSnapshot(overridesRaw: string | null): Promise<Snapshot> {
  const { version, series, prepared } = await loadPrepared();
  const cfg = resolveConfig(overridesRaw);
  const key = `${version}|${configHash(cfg)}|${new Date().toISOString().slice(0, 10)}`;
  const c = cache();
  const hit = c.snapshots.get(key);
  if (hit) return hit;
  const snap = buildSnapshot(prepared, series, cfg, { dataMode: dataMode() });
  if (c.snapshots.size > 20) c.snapshots.clear();
  c.snapshots.set(key, snap);
  return snap;
}

export async function getHistorical(overridesRaw: string | null): Promise<{ records: MonthRecord[]; cfg: ModelConfig }> {
  const { version, prepared } = await loadPrepared();
  const cfg = resolveConfig(overridesRaw);
  const key = `${version}|${configHash(cfg)}`;
  const c = cache();
  const hit = c.historical.get(key);
  if (hit) return { records: hit, cfg };
  const records = runHistorical(prepared, cfg);
  if (c.historical.size > 5) c.historical.clear();
  c.historical.set(key, records);
  return { records, cfg };
}

export async function getPrepared() {
  return loadPrepared();
}

export async function getSeriesForIndicator(id: string) {
  const { prepared, series } = await loadPrepared();
  const p = prepared.find((x) => x.def.id === id);
  if (!p) return null;
  return { prepared: p, series };
}

export async function evaluateAlerts(snap: Snapshot) {
  const store = getStore();
  const alerts = await store.listAlerts();
  for (const a of alerts) {
    if (!a.enabled) continue;
    const res = evaluateRule(a.rule, snap);
    const triggered = res.state === true && a.lastState !== true;
    await store.recordAlertEvaluation(a.id, res.state, res.value, triggered);
    if (triggered) {
      const message = `${a.name}: ${describeRule(a.rule)} (${res.detail})`;
      await store.addAlertEvent(a.id, message, res.value);
      await postWebhook({ alert: a.name, rule: a.rule, message, value: res.value, asOf: snap.asOf, synthetic: snap.dataMode === "demo" });
    }
  }
}

export function environmentStatus() {
  return {
    dataMode: dataMode(),
    fredApiKey: !!process.env.FRED_API_KEY,
    twelveDataKey: !!process.env.TWELVE_DATA_API_KEY,
    database: !!process.env.DATABASE_URL,
    cronSecret: !!process.env.CRON_SECRET,
    adminToken: !!process.env.ADMIN_TOKEN,
    alertWebhook: !!process.env.ALERT_WEBHOOK_URL,
    modelOverrides: !!process.env.MODEL_CONFIG_OVERRIDES,
  };
}
