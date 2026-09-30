import { environmentStatus, getSnapshot } from "@/dashboards/recession/lib/data/service";
import { getStore } from "@/dashboards/recession/lib/data/store";
import { SERIES } from "@/dashboards/recession/lib/series-catalog";
import { DEFAULT_CONFIG, resolveConfig } from "@/dashboards/recession/lib/model-config";
import { modelOverridesFromCookie } from "@/dashboards/recession/lib/server-config";
import { fmtDate } from "@/dashboards/recession/lib/format";
import { PageHeader, Panel } from "@/dashboards/recession/components/ui";
import { WeightsEditor } from "./WeightsEditor";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const overrides = await modelOverridesFromCookie();
  const cfg = resolveConfig(overrides);
  await getSnapshot(overrides); // ensures data has been loaded at least once
  const env = environmentStatus();
  const store = getStore();
  const all = await store.loadAll();
  const flag = (b: boolean) => (b ? <span className="status-LIVE">configured</span> : <span className="text-muted">not set</span>);
  const current = Object.fromEntries(
    (["recession", "inflation", "financial"] as const).map((s) => [s, Object.fromEntries(cfg.scores[s].categories.map((c) => [c.id, c.weight]))]),
  );
  const defaults = Object.fromEntries(
    (["recession", "inflation", "financial"] as const).map((s) => [s, Object.fromEntries(DEFAULT_CONFIG.scores[s].categories.map((c) => [c.id, c.weight]))]),
  );
  const labels = Object.fromEntries(
    (["recession", "inflation", "financial"] as const).map((s) => [s, { label: cfg.scores[s].label, cats: cfg.scores[s].categories.map((c) => ({ id: c.id, label: c.label })) }]),
  );
  return (
    <div className="space-y-5">
      <PageHeader title="Settings & data sources" subtitle="Model weights, environment configuration (secrets are never displayed) and per-series retrieval status." />
      <Panel title="Model weights">
        <WeightsEditor current={current} defaults={defaults} labels={labels} overall={cfg.overall} overallDefaults={DEFAULT_CONFIG.overall} />
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Environment">
          <table className="data">
            <tbody>
              <tr>
                <td>Data mode</td>
                <td>{env.dataMode === "demo" ? <strong style={{ color: "var(--demo)" }}>DEMO (synthetic)</strong> : "live"}</td>
              </tr>
              <tr>
                <td>FRED_API_KEY</td>
                <td>{flag(env.fredApiKey)} {!env.fredApiKey && <span className="text-xs text-muted">(public CSV fallback; no source timestamps)</span>}</td>
              </tr>
              <tr>
                <td>TWELVE_DATA_API_KEY</td>
                <td>{flag(env.twelveDataKey)} <span className="text-xs text-muted">gold, Russell 2000 proxy</span></td>
              </tr>
              <tr>
                <td>DATABASE_URL</td>
                <td>{flag(env.database)} <span className="text-xs text-muted">store: {store.kind}</span></td>
              </tr>
              <tr>
                <td>CRON_SECRET</td>
                <td>{flag(env.cronSecret)}</td>
              </tr>
              <tr>
                <td>ADMIN_TOKEN</td>
                <td>{flag(env.adminToken)}</td>
              </tr>
              <tr>
                <td>ALERT_WEBHOOK_URL</td>
                <td>{flag(env.alertWebhook)}</td>
              </tr>
              <tr>
                <td>MODEL_CONFIG_OVERRIDES</td>
                <td>{flag(env.modelOverrides)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted">
            Copy <code>.env.example</code> to <code>.env.local</code>. Keys are read server-side only and never sent to the browser.
          </p>
        </Panel>
        <Panel title="Loading proprietary data (optional)">
          <div className="prose-sm text-sm text-ink-2">
            <p>ISM indices are proprietary and are not redistributed by FRED. If you hold a licence, load them via the authenticated endpoint (requires ADMIN_TOKEN):</p>
            <pre className="overflow-x-auto rounded bg-surface-2 p-2 text-xs">{`curl -X POST $HOST/api/recession/manual \\
  -H "x-admin-token: $ADMIN_TOKEN" -H "Content-Type: application/json" \\
  -d '{"seriesKey":"ISM_MFG_PMI","observations":[{"date":"2026-08-01","value":49.1}]}'`}</pre>
            <p>Accepted keys: {SERIES.filter((s) => s.provider === "manual").map((s) => s.key).join(", ")}.</p>
          </div>
        </Panel>
      </div>
      <Panel title="Series retrieval status">
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Series</th>
                <th>Source</th>
                <th>ID</th>
                <th>Freq.</th>
                <th>Status</th>
                <th>Last observation</th>
                <th>Source updated</th>
                <th>Retrieved</th>
                <th className="r">Obs</th>
              </tr>
            </thead>
            <tbody>
              {SERIES.map((d) => {
                const s = all[d.key];
                return (
                  <tr key={d.key}>
                    <td>{d.title}</td>
                    <td className="text-xs text-ink-2">{s?.meta.synthetic ? "SYNTHETIC" : d.source}</td>
                    <td className="font-mono text-xs">{d.sourceId}</td>
                    <td>{d.frequency}</td>
                    <td className="text-xs">
                      {!s ? (
                        <span className="text-muted">{d.provider === "manual" ? "not loaded (proprietary)" : d.provider === "twelvedata" && !env.twelveDataKey ? "key not configured" : "never fetched"}</span>
                      ) : s.meta.fetchStatus === "ok" ? (
                        <span className="status-LIVE">ok</span>
                      ) : (
                        <span className="status-STALE" title={s.meta.fetchError ?? ""}>
                          error: {(s.meta.fetchError ?? "").slice(0, 80)}
                        </span>
                      )}
                    </td>
                    <td className="num text-xs">{s?.obs.length ? s.obs[s.obs.length - 1].date : "—"}</td>
                    <td className="num text-xs">{s?.meta.sourceLastUpdated ? fmtDate(s.meta.sourceLastUpdated) : "—"}</td>
                    <td className="num text-xs">{fmtDate(s?.meta.fetchedAt)}</td>
                    <td className="r">{s?.obs.length ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
