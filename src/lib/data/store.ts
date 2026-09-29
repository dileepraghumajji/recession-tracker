/**
 * Persistence. PostgreSQL when DATABASE_URL is set; otherwise an in-process
 * memory store (suitable for local use / single instance; data re-fetched on
 * cold start, alerts not persisted across restarts).
 */
import type { Pool } from "pg";
import type { Alert, AlertEvent, AlertRule } from "../alerts";
import type { Obs, SeriesMap, SeriesMeta } from "../types";

export interface SnapshotRow {
  asOf: string;
  recession: number | null;
  inflation: number | null;
  financial: number | null;
  overall: number | null;
  regime: string;
  freshness: number;
}

export interface Store {
  kind: "postgres" | "memory";
  loadAll(): Promise<SeriesMap>;
  saveSeries(meta: SeriesMeta, obs: Obs[] | null): Promise<void>;
  dataVersion(): Promise<string>;
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

function newId(): string {
  return globalThis.crypto.randomUUID();
}

// ------------------------------------------------------------------- memory
interface MemState {
  series: SeriesMap;
  version: number;
  snapshots: SnapshotRow[];
  alerts: Alert[];
  events: AlertEvent[];
  eventSeq: number;
}

const g = globalThis as unknown as { __mrsmMem?: MemState; __mrsmPool?: Pool };

function mem(): MemState {
  if (!g.__mrsmMem) g.__mrsmMem = { series: {}, version: 0, snapshots: [], alerts: [], events: [], eventSeq: 0 };
  return g.__mrsmMem;
}

export const memoryStore: Store = {
  kind: "memory",
  async loadAll() {
    return { ...mem().series };
  },
  async saveSeries(meta, obs) {
    const s = mem();
    const prev = s.series[meta.key];
    s.series[meta.key] = { meta, obs: obs ?? prev?.obs ?? [] };
    s.version++;
  },
  async dataVersion() {
    return `mem-${mem().version}`;
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
    const a: Alert = {
      id: newId(),
      name,
      rule,
      enabled: true,
      createdAt: new Date().toISOString(),
      lastState: null,
      lastValue: null,
      lastEvaluatedAt: null,
      lastTriggeredAt: null,
    };
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

// ----------------------------------------------------------------- postgres
async function pool(): Promise<Pool> {
  if (g.__mrsmPool) return g.__mrsmPool;
  const { Pool } = await import("pg");
  g.__mrsmPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: true } : undefined,
  });
  return g.__mrsmPool;
}

const iso = (d: Date | string | null): string | null => (d === null ? null : d instanceof Date ? d.toISOString() : new Date(d).toISOString());
const dateStr = (d: Date | string): string => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

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
    const metas = await p.query("SELECT * FROM series_meta");
    // Parse DATE as text to avoid timezone shifts.
    const obs = await p.query({ text: "SELECT series_key, to_char(obs_date, 'YYYY-MM-DD') AS d, value FROM observations ORDER BY series_key, obs_date" });
    const out: SeriesMap = {};
    for (const m of metas.rows) {
      out[m.series_key] = {
        meta: {
          key: m.series_key,
          provider: m.provider,
          sourceId: m.source_id,
          fetchedAt: iso(m.fetched_at),
          sourceLastUpdated: iso(m.source_last_updated),
          fetchStatus: m.fetch_status,
          fetchError: m.fetch_error,
          synthetic: m.synthetic,
        },
        obs: [],
      };
    }
    for (const r of obs.rows) out[r.series_key]?.obs.push({ date: r.d, value: Number(r.value) });
    return out;
  },
  async saveSeries(meta, obs) {
    const p = await pool();
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO series_meta (series_key, provider, source_id, fetched_at, source_last_updated, fetch_status, fetch_error, synthetic)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (series_key) DO UPDATE SET provider=EXCLUDED.provider, source_id=EXCLUDED.source_id, fetched_at=EXCLUDED.fetched_at,
           source_last_updated=COALESCE(EXCLUDED.source_last_updated, series_meta.source_last_updated),
           fetch_status=EXCLUDED.fetch_status, fetch_error=EXCLUDED.fetch_error, synthetic=EXCLUDED.synthetic`,
        [meta.key, meta.provider, meta.sourceId, meta.fetchedAt, meta.sourceLastUpdated, meta.fetchStatus, meta.fetchError, meta.synthetic],
      );
      if (obs && obs.length) {
        // Full replace captures revisions to historical values.
        await client.query("DELETE FROM observations WHERE series_key=$1", [meta.key]);
        const chunk = 5000;
        for (let i = 0; i < obs.length; i += chunk) {
          const part = obs.slice(i, i + chunk);
          await client.query(
            `INSERT INTO observations (series_key, obs_date, value)
             SELECT $1, d::date, v FROM unnest($2::text[], $3::float8[]) AS t(d, v)`,
            [meta.key, part.map((o) => o.date), part.map((o) => o.value)],
          );
        }
        await client.query(
          "UPDATE series_meta SET obs_count=$2, first_date=$3, last_date=$4 WHERE series_key=$1",
          [meta.key, obs.length, obs[0].date, obs[obs.length - 1].date],
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
    const r = await p.query("SELECT COALESCE(MAX(fetched_at)::text,'none') AS v, COUNT(*) AS n FROM series_meta");
    return `pg-${r.rows[0].v}-${r.rows[0].n}`;
  },
  async saveSnapshot(row, payload) {
    const p = await pool();
    await p.query(
      `INSERT INTO score_snapshots (as_of, recession, inflation, financial, overall, regime, freshness, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (as_of) DO UPDATE SET computed_at=now(), recession=$2, inflation=$3, financial=$4, overall=$5, regime=$6, freshness=$7, payload=$8`,
      [row.asOf, row.recession, row.inflation, row.financial, row.overall, row.regime, row.freshness, JSON.stringify(payload)],
    );
  },
  async listSnapshots(limit) {
    const p = await pool();
    const r = await p.query(
      "SELECT to_char(as_of,'YYYY-MM-DD') AS as_of, recession, inflation, financial, overall, regime, freshness FROM score_snapshots ORDER BY as_of DESC LIMIT $1",
      [limit],
    );
    return r.rows.map((x) => ({
      asOf: dateStr(x.as_of),
      recession: x.recession,
      inflation: x.inflation,
      financial: x.financial,
      overall: x.overall,
      regime: x.regime,
      freshness: x.freshness,
    }));
  },
  async listAlerts() {
    const p = await pool();
    const r = await p.query("SELECT * FROM alerts ORDER BY created_at");
    return r.rows.map(rowToAlert);
  },
  async createAlert(name, rule) {
    const p = await pool();
    const r = await p.query("INSERT INTO alerts (id, name, rule) VALUES ($1,$2,$3) RETURNING *", [newId(), name, JSON.stringify(rule)]);
    return rowToAlert(r.rows[0]);
  },
  async deleteAlert(id) {
    const p = await pool();
    await p.query("DELETE FROM alerts WHERE id=$1", [id]);
  },
  async setAlertEnabled(id, enabled) {
    const p = await pool();
    await p.query("UPDATE alerts SET enabled=$2 WHERE id=$1", [id, enabled]);
  },
  async recordAlertEvaluation(id, state, value, triggered) {
    const p = await pool();
    await p.query(
      `UPDATE alerts SET last_state=$2, last_value=$3, last_evaluated_at=now(), last_triggered_at=CASE WHEN $4 THEN now() ELSE last_triggered_at END WHERE id=$1`,
      [id, state, value, triggered],
    );
  },
  async addAlertEvent(alertId, message, value) {
    const p = await pool();
    await p.query("INSERT INTO alert_events (alert_id, message, value) VALUES ($1,$2,$3)", [alertId, message, value]);
  },
  async listAlertEvents(limit) {
    const p = await pool();
    const r = await p.query("SELECT * FROM alert_events ORDER BY triggered_at DESC LIMIT $1", [limit]);
    return r.rows.map((x) => ({ id: Number(x.id), alertId: x.alert_id, triggeredAt: iso(x.triggered_at) as string, message: x.message, value: x.value }));
  },
};

export function getStore(): Store {
  return process.env.DATABASE_URL ? pgStore : memoryStore;
}
