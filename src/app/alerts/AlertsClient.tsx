"use client";
import { useCallback, useEffect, useState } from "react";
import type { AlertRule } from "@/dashboards/recession/lib/alerts";

interface AlertRow {
  id: string;
  name: string;
  rule: AlertRule;
  enabled: boolean;
  description: string;
  lastTriggeredAt: string | null;
  current: { state: boolean | null; value: number | null; detail: string };
}
interface EventRow {
  id: number;
  alertId: string;
  triggeredAt: string;
  message: string;
}
type Ind = { id: string; name: string; units: string; changeUnits: string };

const tokenKey = "mrsm-admin-token";
function getToken() {
  try {
    return sessionStorage.getItem(tokenKey) ?? "";
  } catch {
    return "";
  }
}

export function AlertsClient({ presets, indicators }: { presets: { label: string; name: string; rule: AlertRule }[]; indicators: Ind[] }) {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [meta, setMeta] = useState<{ persistent: boolean; writeProtected: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [rule, setRule] = useState<AlertRule>(presets[0].rule);

  const load = useCallback(async () => {
    const r = await fetch("/api/alerts", { cache: "no-store" });
    if (!r.ok) {
      setError(`Failed to load alerts (HTTP ${r.status})`);
      return;
    }
    const j = await r.json();
    setAlerts(j.alerts);
    setEvents(j.events);
    setMeta({ persistent: j.persistent, writeProtected: j.writeProtected });
  }, []);
  useEffect(() => {
    setToken(getToken());
    void load();
  }, [load]);

  const headers = () => ({ "Content-Type": "application/json", ...(token ? { "x-admin-token": token } : {}) });
  const create = async (n: string, r: AlertRule) => {
    setError(null);
    const res = await fetch("/api/alerts", { method: "POST", headers: headers(), body: JSON.stringify({ name: n, rule: r }) });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
    await load();
  };
  const remove = async (id: string) => {
    await fetch(`/api/alerts/${id}`, { method: "DELETE", headers: headers() });
    await load();
  };
  const toggle = async (id: string, enabled: boolean) => {
    await fetch(`/api/alerts/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ enabled }) });
    await load();
  };

  const setKind = (kind: AlertRule["kind"]) => {
    if (kind === "indicator_level") setRule({ kind, indicatorId: "ust30y", op: "above", level: 5 });
    if (kind === "indicator_change") setRule({ kind, indicatorId: "hy_oas", window: "m1", op: "rise", amount: 50 });
    if (kind === "score_level") setRule({ kind, score: "recession", op: "above", level: 60 });
    if (kind === "score_change") setRule({ kind, score: "recession", window: "m1", op: "either", amount: 10 });
  };
  const ind = "indicatorId" in rule ? indicators.find((i) => i.id === rule.indicatorId) : undefined;
  const changeUnitLabel = ind ? (ind.changeUnits === "bps" ? "bps" : ind.changeUnits === "pp" ? "pp" : ind.changeUnits === "%" ? "%" : ind.changeUnits) : "pts";

  return (
    <div className="space-y-5">
      {meta && (
        <div className="text-xs text-muted">
          Storage: {meta.persistent ? "PostgreSQL (persistent)" : "in-memory (lost on restart — set DATABASE_URL to persist)"}.{" "}
          {meta.writeProtected && (
            <label className="ml-2 inline-flex items-center gap-2">
              Admin token
              <input
                type="password"
                className="input w-48"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  try {
                    sessionStorage.setItem(tokenKey, e.target.value);
                  } catch {
                    /* ignore */
                  }
                }}
              />
            </label>
          )}
        </div>
      )}
      {error && <div className="panel p-3 text-sm" style={{ borderColor: "var(--critical)" }}>{error}</div>}

      <section className="panel p-4">
        <h2 className="panel-title mb-3">Quick start from a template (you choose the values)</h2>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.label}
              className="btn"
              onClick={() => {
                setRule(p.rule);
                setName(p.name);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="panel-title mb-3">Configure alert</h2>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Name</span>
            <input className="input w-56" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HY spreads widening" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Type</span>
            <select className="input" value={rule.kind} onChange={(e) => setKind(e.target.value as AlertRule["kind"])}>
              <option value="indicator_level">Indicator crosses level</option>
              <option value="indicator_change">Indicator changes by</option>
              <option value="score_level">Score crosses level</option>
              <option value="score_change">Score changes by</option>
            </select>
          </label>
          {"indicatorId" in rule && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Indicator</span>
              <select className="input max-w-64" value={rule.indicatorId} onChange={(e) => setRule({ ...rule, indicatorId: e.target.value })}>
                {indicators.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {"score" in rule && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Score</span>
              <select className="input" value={rule.score} onChange={(e) => setRule({ ...rule, score: e.target.value as "recession" })}>
                <option value="recession">Recession</option>
                <option value="inflation">Inflation</option>
                <option value="financial">Financial</option>
                <option value="overall">Overall</option>
              </select>
            </label>
          )}
          {(rule.kind === "indicator_level" || rule.kind === "score_level") && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Condition</span>
                <select className="input" value={rule.op} onChange={(e) => setRule({ ...rule, op: e.target.value as "above" | "below" })}>
                  <option value="above">above</option>
                  <option value="below">below</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Level {ind ? `(${ind.units})` : "(0–100)"}</span>
                <input className="input w-28" type="number" step="any" value={rule.level} onChange={(e) => setRule({ ...rule, level: Number(e.target.value) })} />
              </label>
            </>
          )}
          {(rule.kind === "indicator_change" || rule.kind === "score_change") && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Direction</span>
                <select className="input" value={rule.op} onChange={(e) => setRule({ ...rule, op: e.target.value as "rise" })}>
                  <option value="rise">rises by</option>
                  <option value="fall">falls by</option>
                  <option value="either">moves by (either way)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Amount ({rule.kind === "score_change" ? "pts" : changeUnitLabel})</span>
                <input className="input w-28" type="number" step="any" min={0} value={rule.amount} onChange={(e) => setRule({ ...rule, amount: Number(e.target.value) })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Over</span>
                <select className="input" value={rule.window} onChange={(e) => setRule({ ...rule, window: e.target.value as "m1" })}>
                  <option value="w1">1 week</option>
                  <option value="m1">1 month</option>
                  <option value="m3">3 months</option>
                </select>
              </label>
            </>
          )}
          <button className="btn" onClick={() => create(name.trim() || "Untitled alert", rule)}>
            Create alert
          </button>
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="panel-title mb-3">Your alerts</h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted">No alerts configured.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Condition</th>
                <th>Now</th>
                <th>Last fired</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td className="text-ink-2">{a.description}</td>
                  <td>
                    {a.current.state === null ? (
                      <span className="text-muted">data unavailable</span>
                    ) : a.current.state ? (
                      <span className="sig-severe inline-flex items-center gap-1.5">
                        <span className="sig-dot" /> Condition met
                      </span>
                    ) : (
                      <span className="sig-normal inline-flex items-center gap-1.5">
                        <span className="sig-dot" /> Not met
                      </span>
                    )}
                    <div className="text-[11px] text-muted">{a.current.detail}</div>
                  </td>
                  <td className="text-xs text-muted">{a.lastTriggeredAt ? a.lastTriggeredAt.replace("T", " ").slice(0, 16) : "never"}</td>
                  <td className="whitespace-nowrap">
                    <button className="btn mr-2" onClick={() => toggle(a.id, !a.enabled)}>
                      {a.enabled ? "Disable" : "Enable"}
                    </button>
                    <button className="btn" onClick={() => remove(a.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel p-4">
        <h2 className="panel-title mb-3">Alert log</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted">No alerts have fired.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {events.map((e) => (
              <li key={e.id}>
                <span className="num mr-2 text-xs text-muted">{e.triggeredAt.replace("T", " ").slice(0, 16)}</span>
                {e.message}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
