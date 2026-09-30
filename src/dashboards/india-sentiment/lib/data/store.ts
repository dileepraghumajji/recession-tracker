/**
 * Persistence for the India Market Sentiment Terminal: PostgreSQL (india_* tables,
 * db/migrations/002_india_sentiment.sql) when DATABASE_URL is set, otherwise an
 * in-process memory store (single instance; data re-loaded on cold start).
 */
import { databaseConfigured, pool } from "@/platform/data/db";
import type { Alert, AlertEvent, AlertRule } from "../alerts";
import type { IntradayPoint } from "../engine/options";
import type { Obs, OptionChainSnapshot, SeriesMap, SeriesMeta } from "../types";

export interface SnapshotRow {
  asOf: string;
  score: number | null;
  confidence: number;
  band: string | null;
  regime: string | null;
}

export interface Store {
  kind: "postgres" | "memory";
  loadAll(): Promise<SeriesMap>;
  /** replace = full history (captures revisions); merge = upsert the given observations. */
  saveSeries(meta: SeriesMeta, obs: Obs[] | null, mode: "replace" | "merge"): Promise<void>;
  dataVersion(): Promise<string>;
  getChains(): Promise<OptionChainSnapshot[]>;
  saveChain(snap: OptionChainSnapshot): Promise<void>;
  getIntraday(underlying: string, since: string): Promise<IntradayPoint[]>;
  addIntraday(underlying: string, points: IntradayPoint[]): Promise<void>;
  saveSnapshot(row: SnapshotRow, payload: unknown): Promise<void>;
  listSnapshots(limit: number): Promise<SnapshotRow[]>;
  listAlerts(): Promise<Alert[]>;
  createAlert(name: string, rule: AlertRule): Promise<Alert>;
  deleteAlert(id: string): Promise<void>;
  setAlertEnabled(id: string, enabled: boolean): Promise<void>;
  recordAlertEvaluation(id: string, state: boolean | null, value: number | null, triggered: boolean): Promise<void>;
  addAlertEvent(alertId: string, message: string, value: number | null): Promise<void>;
  listAlertEvents(limit: number): Promise<AlertEvent[]>;
}

const newId = () => globalThis.crypto.randomUUID();

function mergeObs(a: Obs[], b: Obs[]): Obs[] {
  const m = new Map(a.map((o) => [o.date, o.value]));
  for (const o of b) m.set(o.date, o.value);
  return [...m.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([date, value]) => ({ date, value }));
}

// ------------------------------------------------------------------- memory
interface MemState {
  series: SeriesMap;
  version: number;
  chains: Map<string, OptionChainSnapshot>;
  intraday: Map<string, IntradayPoint[]>;
  snapshots: SnapshotRow[];
  alerts: Alert[];
  events: AlertEvent[];
  eventSeq: number;
}
const g = globalThis as unknown as Record<string, MemState | undefined>;

/** An in-process store whose state lives under `globalThis[stateKey]` (survives dev hot reloads). */
function createMemoryStore(stateKey: string): Store {
  const mem = (): MemState => (g[stateKey] ??= { series: {}, version: 0, chains: new Map(), intraday: new Map(), snapshots: [], alerts: [], events: [], eventSeq: 0 });
  return {
    kind: "memory",
    async loadAll() {
      return { ...mem().series };
    },
    async saveSeries(meta, obs, mode) {
      const s = mem();
      const prev = s.series[meta.key];
      const next = obs === null ? (prev?.obs ?? []) : mode === "merge" ? mergeObs(prev?.obs ?? [], obs) : obs;
      s.series[meta.key] = { meta, obs: next };
      s.version++;
    },
    async dataVersion() {
      return `mem-${mem().version}`;
    },
    async getChains() {
      return [...mem().chains.values()];
    },
    async saveChain(snap) {
      const s = mem();
      s.chains.set(snap.underlying, snap);
      s.version++;
    },
    async getIntraday(u, since) {
      return (mem().intraday.get(u) ?? []).filter((p) => p.ts >= since);
    },
    async addIntraday(u, points) {
      const s = mem();
      const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const byTs = new Map((s.intraday.get(u) ?? []).filter((p) => p.ts >= cutoff).map((p) => [p.ts, p]));
      for (const p of points) byTs.set(p.ts, p);
      s.intraday.set(u, [...byTs.values()].sort((a, b) => (a.ts < b.ts ? -1 : 1)));
    },
    async saveSnapshot(row) {
      const s = mem();
      s.snapshots = [row, ...s.snapshots.filter((x) => x.asOf !== row.asOf)].slice(0, 500);
    },
    async listSnapshots(limit) {
      return mem().snapshots.slice(0, limit);
    },
    async listAlerts() {
      return mem().alerts.map((a) => ({ ...a }));
    },
    async createAlert(name, rule) {
      const a: Alert = { id: newId(), name, rule, enabled: true, createdAt: new Date().toISOString(), lastState: null, lastValue: null, lastEvaluatedAt: null, lastTriggeredAt: null };
      mem().alerts.push(a);
      return a;
    },
    async deleteAlert(id) {
      const s = mem();
      s.alerts = s.alerts.filter((a) => a.id !== id);
      s.events = s.events.filter((e) => e.alertId !== id);
    },
    async setAlertEnabled(id, enabled) {
      const a = mem().alerts.find((x) => x.id === id);
      if (a) a.enabled = enabled;
    },
    async recordAlertEvaluation(id, state, value, triggered) {
      const a = mem().alerts.find((x) => x.id === id);
      if (!a) return;
      a.lastState = state;
      a.lastValue = value;
      a.lastEvaluatedAt = new Date().toISOString();
      if (triggered) a.lastTriggeredAt = a.lastEvaluatedAt;
    },
    async addAlertEvent(alertId, message, value) {
      const s = mem();
      s.events.unshift({ id: ++s.eventSeq, alertId, triggeredAt: new Date().toISOString(), message, value });
      s.events = s.events.slice(0, 1000);
    },
    async listAlertEvents(limit) {
      return mem().events.slice(0, limit);
    },
  };
}

export const memoryStore: Store = createMemoryStore("__imsMem");

/**
 * Separate, never-persisted store for the synthetic data shown when a configured
 * market-data provider is unusable (e.g. an expired token). Keeping it apart
 * guarantees demo data can never overwrite real stored data.
 */
export const demoFallbackStore: Store = createMemoryStore("__imsDemoFallback");

// ----------------------------------------------------------------- postgres
const iso = (d: Date | string | null): string | null => (d === null ? null : d instanceof Date ? d.toISOString() : new Date(d).toISOString());

function rowToAlert(r: Record<string, unknown>): Alert {
  return {
    id: r.id as string,
    name: r.name as string,
    rule: r.rule as AlertRule,
    enabled: r.enabled as boolean,
    createdAt: iso(r.created_at as Date) as string,
    lastState: (r.last_state as boolean | null) ?? null,
    lastValue: (r.last_value as number | null) ?? null,
    lastEvaluatedAt: iso((r.last_evaluated_at as Date | null) ?? null),
    lastTriggeredAt: iso((r.last_triggered_at as Date | null) ?? null),
  };
}

export const pgStore: Store = {
  kind: "postgres",
  async loadAll() {
    const p = await pool();
    const metas = await p.query("SELECT * FROM india_series_meta");
    const obs = await p.query({ text: "SELECT series_key, to_char(obs_date, 'YYYY-MM-DD') AS d, value FROM india_observations ORDER BY series_key, obs_date" });
    const out: SeriesMap = {};
    for (const m of metas.rows) {
      out[m.series_key] = {
        meta: { key: m.series_key, kind: m.kind, sourceId: m.source_id, origin: m.origin, fetchedAt: iso(m.fetched_at), sourceLastUpdated: iso(m.source_last_updated), fetchStatus: m.fetch_status, fetchError: m.fetch_error, synthetic: m.synthetic },
        obs: [],
      };
    }
    for (const r of obs.rows) out[r.series_key]?.obs.push({ date: r.d, value: Number(r.value) });
    return out;
  },
  async saveSeries(meta, obs, mode) {
    const p = await pool();
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO india_series_meta (series_key, kind, source_id, origin, fetched_at, source_last_updated, fetch_status, fetch_error, synthetic)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (series_key) DO UPDATE SET kind=EXCLUDED.kind, source_id=EXCLUDED.source_id, origin=EXCLUDED.origin, fetched_at=EXCLUDED.fetched_at,
           source_last_updated=COALESCE(EXCLUDED.source_last_updated, india_series_meta.source_last_updated),
           fetch_status=EXCLUDED.fetch_status, fetch_error=EXCLUDED.fetch_error, synthetic=EXCLUDED.synthetic`,
        [meta.key, meta.kind, meta.sourceId, meta.origin, meta.fetchedAt, meta.sourceLastUpdated, meta.fetchStatus, meta.fetchError, meta.synthetic],
      );
      if (obs && obs.length) {
        if (mode === "replace") await client.query("DELETE FROM india_observations WHERE series_key=$1", [meta.key]);
        for (let i = 0; i < obs.length; i += 5000) {
          const part = obs.slice(i, i + 5000);
          await client.query(
            `INSERT INTO india_observations (series_key, obs_date, value)
             SELECT $1, d::date, v FROM unnest($2::text[], $3::float8[]) AS t(d, v)
             ON CONFLICT (series_key, obs_date) DO UPDATE SET value=EXCLUDED.value`,
            [meta.key, part.map((o) => o.date), part.map((o) => o.value)],
          );
        }
        await client.query(
          `UPDATE india_series_meta SET (obs_count, first_date, last_date) =
             (SELECT COUNT(*), MIN(obs_date), MAX(obs_date) FROM india_observations WHERE series_key=$1) WHERE series_key=$1`,
          [meta.key],
        );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },
  async dataVersion() {
    const p = await pool();
    const r = await p.query(
      "SELECT COALESCE((SELECT MAX(fetched_at)::text FROM india_series_meta),'none') AS v, (SELECT COUNT(*) FROM india_series_meta) AS n, COALESCE((SELECT MAX(updated_at)::text FROM india_option_chains),'none') AS c",
    );
    return `pg-${r.rows[0].v}-${r.rows[0].n}-${r.rows[0].c}`;
  },
  async getChains() {
    const p = await pool();
    const r = await p.query("SELECT snapshot FROM india_option_chains");
    return r.rows.map((x) => x.snapshot as OptionChainSnapshot);
  },
  async saveChain(snap) {
    const p = await pool();
    await p.query(
      `INSERT INTO india_option_chains (underlying, snapshot, updated_at) VALUES ($1,$2,now())
       ON CONFLICT (underlying) DO UPDATE SET snapshot=EXCLUDED.snapshot, updated_at=now()`,
      [snap.underlying, JSON.stringify(snap)],
    );
  },
  async getIntraday(u, since) {
    const p = await pool();
    const r = await p.query("SELECT point FROM india_option_intraday WHERE underlying=$1 AND ts >= $2 ORDER BY ts", [u, since]);
    return r.rows.map((x) => x.point as IntradayPoint);
  },
  async addIntraday(u, points) {
    if (!points.length) return;
    const p = await pool();
    await p.query(
      `INSERT INTO india_option_intraday (underlying, ts, point)
       SELECT $1, t::timestamptz, pt::jsonb FROM unnest($2::text[], $3::text[]) AS x(t, pt)
       ON CONFLICT (underlying, ts) DO UPDATE SET point=EXCLUDED.point`,
      [u, points.map((x) => x.ts), points.map((x) => JSON.stringify(x))],
    );
    await p.query("DELETE FROM india_option_intraday WHERE ts < now() - interval '7 days'");
  },
  async saveSnapshot(row, payload) {
    const p = await pool();
    await p.query(
      `INSERT INTO india_score_snapshots (as_of, score, confidence, band, regime, payload) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (as_of) DO UPDATE SET computed_at=now(), score=$2, confidence=$3, band=$4, regime=$5, payload=$6`,
      [row.asOf, row.score, row.confidence, row.band, row.regime, JSON.stringify(payload)],
    );
  },
  async listSnapshots(limit) {
    const p = await pool();
    const r = await p.query("SELECT to_char(as_of,'YYYY-MM-DD') AS as_of, score, confidence, band, regime FROM india_score_snapshots ORDER BY as_of DESC LIMIT $1", [limit]);
    return r.rows.map((x) => ({ asOf: x.as_of, score: x.score, confidence: x.confidence, band: x.band, regime: x.regime }));
  },
  async listAlerts() {
    const p = await pool();
    return (await p.query("SELECT * FROM india_alerts ORDER BY created_at")).rows.map(rowToAlert);
  },
  async createAlert(name, rule) {
    const p = await pool();
    const r = await p.query("INSERT INTO india_alerts (id, name, rule) VALUES ($1,$2,$3) RETURNING *", [newId(), name, JSON.stringify(rule)]);
    return rowToAlert(r.rows[0]);
  },
  async deleteAlert(id) {
    await (await pool()).query("DELETE FROM india_alerts WHERE id=$1", [id]);
  },
  async setAlertEnabled(id, enabled) {
    await (await pool()).query("UPDATE india_alerts SET enabled=$2 WHERE id=$1", [id, enabled]);
  },
  async recordAlertEvaluation(id, state, value, triggered) {
    await (await pool()).query(
      "UPDATE india_alerts SET last_state=$2, last_value=$3, last_evaluated_at=now(), last_triggered_at=CASE WHEN $4 THEN now() ELSE last_triggered_at END WHERE id=$1",
      [id, state, value, triggered],
    );
  },
  async addAlertEvent(alertId, message, value) {
    await (await pool()).query("INSERT INTO india_alert_events (alert_id, message, value) VALUES ($1,$2,$3)", [alertId, message, value]);
  },
  async listAlertEvents(limit) {
    const r = await (await pool()).query("SELECT * FROM india_alert_events ORDER BY triggered_at DESC LIMIT $1", [limit]);
    return r.rows.map((x) => ({ id: Number(x.id), alertId: x.alert_id, triggeredAt: iso(x.triggered_at) as string, message: x.message, value: x.value }));
  },
};

export function getStore(): Store {
  return databaseConfigured() ? pgStore : memoryStore;
}
