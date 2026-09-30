"use client";
import { useCallback, useEffect, useState } from "react";
import type { AlertRule } from "../lib/alerts";
import { API } from "../routes";
import { fieldClass } from "@/platform/ui/primitives/misc";
import { cn } from "@/platform/ui/cn";
import { buttonVariants } from "@/platform/ui/primitives/button";
import { tableClass } from "@/platform/ui/patterns/content";

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
  triggeredAt: string;
  message: string;
}
export interface MetricOption {
  id: string;
  label: string;
  unit: string;
  changeUnit: string;
}

const tokenKey = "ims-admin-token";
const getToken = () => {
  try {
    return sessionStorage.getItem(tokenKey) ?? "";
  } catch {
    return "";
  }
};

export function AlertsClient({ presets, metrics }: { presets: { label: string; name: string; rule: AlertRule }[]; metrics: MetricOption[] }) {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [meta, setMeta] = useState<{ persistent: boolean; writeProtected: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [rule, setRule] = useState<AlertRule>(presets[0].rule);

  const load = useCallback(async () => {
    const r = await fetch(`${API}/alerts`, { cache: "no-store" });
    if (!r.ok) return setError(`Failed to load alerts (HTTP ${r.status})`);
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
  const create = async () => {
    setError(null);
    const res = await fetch(`${API}/alerts`, { method: "POST", headers: headers(), body: JSON.stringify({ name: name.trim() || "Untitled alert", rule }) });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
    await load();
  };
  const remove = async (id: string) => {
    await fetch(`${API}/alerts/${id}`, { method: "DELETE", headers: headers() });
    await load();
  };
  const toggle = async (id: string, enabled: boolean) => {
    await fetch(`${API}/alerts/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ enabled }) });
    await load();
  };
  const setKind = (kind: AlertRule["kind"]) => {
    const metric = rule.metric;
    if (kind === "level") setRule({ kind, metric, op: "above", level: 70 });
    if (kind === "cross") setRule({ kind, metric, direction: "either", level: 50 });
    if (kind === "change") setRule({ kind, metric, window: "w1", op: "either", amount: 10 });
  };
  const m = metrics.find((x) => x.id === rule.metric);
  const field = (label: string, el: React.ReactNode) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      {el}
    </label>
  );

  return (
    <div className="space-y-5">
      {meta && (
        <div className="text-xs text-muted">
          Storage: {meta.persistent ? "PostgreSQL (persistent)" : "in-memory (lost on restart — set DATABASE_URL to persist)"}. Alerts are evaluated after every refresh and ingestion; fired alerts are posted to ALERT_WEBHOOK_URL when configured.
          {meta.writeProtected && (
            <label className="ml-2 inline-flex items-center gap-2">
              Admin token
              <input
                type="password"
                className={cn(fieldClass, "w-48")}
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
      {error && (
        <div className="rounded-[10px] border border-line bg-surface p-3 text-sm" style={{ borderColor: "var(--critical)" }}>
          {error}
        </div>
      )}
      <section className="rounded-[10px] border border-line bg-surface p-4">
        <h2 className="text-2xs font-medium uppercase tracking-[0.08em] text-muted mb-3">Templates (nothing is created until you click “Create alert”)</h2>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.label}
              className={buttonVariants({ size: "sm" })}
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
      <section className="rounded-[10px] border border-line bg-surface p-4">
        <h2 className="text-2xs font-medium uppercase tracking-[0.08em] text-muted mb-3">Configure alert</h2>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          {field("Name", <input className={cn(fieldClass, "w-56")} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sentiment below 30" />)}
          {field(
            "Metric",
            <select className={cn(fieldClass, "max-w-72")} value={rule.metric} onChange={(e) => setRule({ ...rule, metric: e.target.value })}>
              {metrics.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>,
          )}
          {field(
            "Type",
            <select className={fieldClass} value={rule.kind} onChange={(e) => setKind(e.target.value as AlertRule["kind"])}>
              <option value="cross">Crosses a level</option>
              <option value="level">Is above / below a level</option>
              <option value="change">Changes by</option>
            </select>,
          )}
          {rule.kind === "cross" &&
            field(
              "Direction",
              <select className={fieldClass} value={rule.direction} onChange={(e) => setRule({ ...rule, direction: e.target.value as "up" })}>
                <option value="either">either way</option>
                <option value="up">upward</option>
                <option value="down">downward</option>
              </select>,
            )}
          {rule.kind === "level" &&
            field(
              "Condition",
              <select className={fieldClass} value={rule.op} onChange={(e) => setRule({ ...rule, op: e.target.value as "above" })}>
                <option value="above">above</option>
                <option value="below">below</option>
              </select>,
            )}
          {(rule.kind === "cross" || rule.kind === "level") &&
            field(`Level${m?.unit ? ` (${m.unit.trim()})` : ""}`, <input className={cn(fieldClass, "w-28")} type="number" step="any" value={rule.level} onChange={(e) => setRule({ ...rule, level: Number(e.target.value) })} />)}
          {rule.kind === "change" && (
            <>
              {field(
                "Direction",
                <select className={fieldClass} value={rule.op} onChange={(e) => setRule({ ...rule, op: e.target.value as "rise" })}>
                  <option value="either">moves by (either way)</option>
                  <option value="rise">rises by</option>
                  <option value="fall">falls by</option>
                </select>,
              )}
              {field(`Amount${m?.changeUnit ? ` (${m.changeUnit.trim()})` : ""}`, <input className={cn(fieldClass, "w-28")} type="number" step="any" min={0} value={rule.amount} onChange={(e) => setRule({ ...rule, amount: Number(e.target.value) })} />)}
              {field(
                "Over",
                <select className={fieldClass} value={rule.window} onChange={(e) => setRule({ ...rule, window: e.target.value as "w1" })}>
                  <option value="d1">1 day</option>
                  <option value="w1">1 week</option>
                  <option value="m1">1 month</option>
                </select>,
              )}
            </>
          )}
          <button className={buttonVariants({ size: "sm" })} onClick={create}>
            Create alert
          </button>
        </div>
      </section>
      <section className="rounded-[10px] border border-line bg-surface p-4">
        <h2 className="text-2xs font-medium uppercase tracking-[0.08em] text-muted mb-3">Your alerts</h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted">No alerts configured.</p>
        ) : (
          <table className={tableClass}>
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
                    {a.current.state === null ? <span className="text-muted">data unavailable</span> : a.current.state ? "Condition met" : "Not met"}
                    <div className="text-[11px] text-muted">{a.current.detail}</div>
                  </td>
                  <td className="text-xs text-muted">{a.lastTriggeredAt ? a.lastTriggeredAt.replace("T", " ").slice(0, 16) : "never"}</td>
                  <td className="whitespace-nowrap">
                    <button className={cn(buttonVariants({ size: "sm" }), "mr-2")} onClick={() => toggle(a.id, !a.enabled)}>
                      {a.enabled ? "Disable" : "Enable"}
                    </button>
                    <button className={buttonVariants({ size: "sm" })} onClick={() => remove(a.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="rounded-[10px] border border-line bg-surface p-4">
        <h2 className="text-2xs font-medium uppercase tracking-[0.08em] text-muted mb-3">Alert log</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted">No alerts have fired.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {events.map((e) => (
              <li key={e.id}>
                <span className="tabular-nums mr-2 text-xs text-muted">{e.triggeredAt.replace("T", " ").slice(0, 16)}</span>
                {e.message}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
