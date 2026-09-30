import { DEFAULT_CONFIG, resolveConfig, type SentimentConfig } from "@/dashboards/india-sentiment/lib/config";
import { breadthEnabled, breadthStatus } from "@/dashboards/india-sentiment/lib/data/breadth/job";
import { environmentStatus, getSeriesMap } from "@/dashboards/india-sentiment/lib/data/service";
import { getStore } from "@/dashboards/india-sentiment/lib/data/store";
import { SERIES } from "@/dashboards/india-sentiment/lib/series";
import { configOverridesFromCookie } from "@/dashboards/india-sentiment/lib/server-config";
import { FACTOR_IDS } from "@/dashboards/india-sentiment/lib/types";
import { ProviderStatusTable } from "@/dashboards/india-sentiment/components/ProviderStatus";
import { SettingsEditor, type EditableConfig } from "@/dashboards/india-sentiment/components/SettingsEditor";
import { PageHeader, Panel } from "@/dashboards/india-sentiment/components/ui";
import { fmtDate } from "@/platform/lib/format";
import { proseClass, tableClass } from "@/platform/ui/patterns/content";
import { cn } from "@/platform/ui/cn";

export const dynamic = "force-dynamic";

const editable = (c: SentimentConfig): EditableConfig => ({
  factorWeights: Object.fromEntries(FACTOR_IDS.map((id) => [id, c.factors[id].weight])),
  thresholds: [...c.thresholds],
  maxFactorShare: c.maxFactorShare,
  strikeWindow: c.strikeWindow,
  oiPcrBullish: c.oiPcrBullish,
  oiPcrBearish: c.oiPcrBearish,
  premiumPcrBearish: c.premiumPcrBearish,
  premiumPcrBullish: c.premiumPcrBullish,
  changeExplainThreshold: c.changeExplainThreshold,
  divergenceMovePct: c.divergenceMovePct,
});

const KIND_LABEL = { fred: "FRED (automatic)", market: "Licensed market data", manual: "Official release (ingest)", derived: "Computed from option chains" } as const;

const EXAMPLE = `curl -X POST $HOST/api/india-sentiment/ingest \\
  -H "x-admin-token: $ADMIN_TOKEN" -H "Content-Type: application/json" \\
  -d '{
  "source": "my-broker-script",
  "series": [
    { "key": "idx:NIFTY50", "observations": [{ "date": "2026-09-30", "value": 25310.4 }] },
    { "key": "flow:fii_cash", "observations": [{ "date": "2026-09-30", "value": -1834.2 }] },
    { "key": "breadth:adv", "observations": [{ "date": "2026-09-30", "value": 1402 }] }
  ],
  "optionChains": [{
    "underlying": "NIFTY", "spot": 25310.4, "timestamp": "2026-09-30T15:30:00+05:30",
    "volumeUnit": "contracts",
    "records": [{ "underlying": "NIFTY", "expiry": "2026-10-06", "strike": 25300, "type": "CE",
      "ltp": 142.5, "prevClose": 131.0, "volume": 812345, "oi": 9123450, "changeInOi": 402150,
      "iv": 11.8, "prevIv": 11.2, "bid": 142.3, "ask": 142.6,
      "timestamp": "2026-09-30T15:30:00+05:30", "lotSize": 75 }]
  }]
}'`;

export default async function Settings() {
  const cfg = resolveConfig(await configOverridesFromCookie());
  const [series, env] = [await getSeriesMap(), environmentStatus()];
  const store = getStore();
  const breadth = await breadthStatus(store);
  const breadthOn = breadthEnabled();
  const labels = Object.fromEntries(FACTOR_IDS.map((id) => [id, DEFAULT_CONFIG.factors[id].label]));
  const counts = SERIES.reduce<Record<string, { total: number; loaded: number }>>((m, d) => {
    const k = d.kind;
    m[k] ??= { total: 0, loaded: 0 };
    m[k].total++;
    if (series[d.key]?.obs.length) m[k].loaded++;
    return m;
  }, {});
  return (
    <div className="space-y-5">
      <PageHeader title="Settings & data sources" description="Model weights and thresholds, how data gets in, and the retrieval status of every series." />
      <Panel title="Model settings (this browser)">
        <SettingsEditor current={editable(cfg)} defaults={editable(DEFAULT_CONFIG)} labels={labels} />
        <p className="mt-3 text-[11px] text-muted">
          Deployment-wide defaults can be set with the <code>INDIA_SENTIMENT_CONFIG_OVERRIDES</code> environment variable (same JSON shape). The specified default weights sum to 105; they are applied as relative
          weights.
        </p>
      </Panel>

      <Panel title="Environment">
        <div className="grid gap-1 text-sm sm:grid-cols-3">
          <div>
            Data mode: <span className="font-mono">{env.dataMode}</span>
            {env.fallback && <span className="text-serious"> (fallback: provider unavailable)</span>}
          </div>
          <div>Storage: <span className="font-mono">{env.fallback ? "memory (synthetic fallback)" : store.kind}</span></div>
          <div>FRED API key: {env.fredApiKey ? "configured" : "not set (public CSV fallback)"}</div>
          <div>ADMIN_TOKEN (ingestion/alerts): {env.adminToken ? "configured" : "not set — ingestion disabled"}</div>
          <div>Alert webhook: {env.alertWebhook ? "configured" : "not set"}</div>
          <div>Market-data providers: {env.marketProviders.length ? env.marketProviders.join(", ") : "none connected"}</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-2">
          {Object.entries(counts).map(([k, v]) => (
            <span key={k}>
              {KIND_LABEL[k as keyof typeof KIND_LABEL]}: {v.loaded}/{v.total} series loaded
            </span>
          ))}
        </div>
      </Panel>

      <Panel title="Market-data providers">
        <ProviderStatusTable />
        <p className="mt-3 text-[11px] text-muted">
          Dhan is used for NSE/BSE index history and today&apos;s prices, India VIX, NIFTY / BANKNIFTY / FINNIFTY option chains and intraday prices, through read-only data endpoints only. Credentials:{" "}
          <code>DHAN_ACCESS_TOKEN</code> and <code>DHAN_CLIENT_ID</code> (server environment). If the token expires or is rejected, this dashboard shows clearly labelled synthetic demo data until it is renewed.
        </p>
        <p className="mt-2 text-[11px] text-muted">
          Twelve Data (<code>TWELVE_DATA_API_KEY</code>, free plan) supplies gold spot (XAU/USD) and ETF proxies for the Russell 2000 (IWM), MSCI Emerging Markets (EEM), MSCI World (URTH) and silver (SLV); each proxy&apos;s notes say so. Hang Seng, Shanghai Composite and STOXX Europe 600 are not on the free plan and stay unfilled.
        </p>
      </Panel>

      <Panel title="Market breadth (computed from Dhan stock candles)">
        <div className="grid gap-1 text-sm">
          {!breadthOn.ok && <div className="text-muted">Not running: {breadthOn.reason}.</div>}
          {breadth.last ? (
            <div>
              Last computed session: <span className="font-mono">{breadth.last.target}</span> ({breadth.last.universe - breadth.last.missing - breadth.last.noData} of {breadth.last.universe} stocks
              {breadth.last.noData ? `, ${breadth.last.noData} without data` : ""}
              {breadth.last.missing ? `, ${breadth.last.missing} failed` : ""}), finished {fmtDate(breadth.last.finishedAt)}.
              {breadth.last.sessionsPublished ? ` Published ${breadth.last.sessionsPublished} session(s) ${breadth.last.publishedFrom} … ${breadth.last.publishedTo}.` : ""}
              {breadth.last.withheld.length ? <span className="text-serious"> Withheld: {breadth.last.withheld.map((w) => `${w.date} (${w.reason})`).join("; ")}.</span> : null}
            </div>
          ) : (
            breadthOn.ok && <div className="text-muted">No breadth computed yet.</div>
          )}
          {breadth.running && (
            <div>
              In progress: sessions {breadth.running.publishFrom} … {breadth.running.target}, {breadth.running.done} of {breadth.running.total} stocks (pass {breadth.running.pass}), started {fmtDate(breadth.running.startedAt)}.
            </div>
          )}
          {breadth.lastError && <div className="text-serious">Last error ({fmtDate(breadth.lastError.at)}): {breadth.lastError.message}</div>}
        </div>
        <p className="mt-3 text-[11px] text-muted">
          Universe: NSE mainboard equity shares (series EQ, BE, BZ; no SME, ETFs or debt) from Dhan&apos;s instrument list, using split/bonus-adjusted daily candles. Advances/declines compare each close with
          the stock&apos;s previous close; % above N-DMA counts stocks with at least N sessions; 52-week highs/lows compare the day&apos;s high/low with the preceding 52 weeks. Only the last completed NSE
          session is computed, only complete sessions are published, and published values are never revised. The history before the first run is reconstructed from today&apos;s listed stocks (delisted
          companies are missing). Traded value (up/down value) is not in daily candles and is never estimated. Runs from <code>/api/cron/india-breadth</code> (several times each morning, resuming where it
          stopped) or <code>npm run breadth</code>; a database (<code>DATABASE_URL</code>) is needed to keep progress between runs.
        </p>
      </Panel>

      <Panel title="Getting Indian market data in">
        <div className={cn(proseClass, "max-w-4xl text-sm")}>
          <p>
            Free official data (US/global markets, crude, USD/INR, some India macro and rates) is fetched from <strong>FRED</strong> automatically. NSE/BSE prices, breadth, FII/DII flows and option
            chains require a <strong>licensed market-data source</strong> — this app never scrapes NSE. Two ways to connect one:
          </p>
          <ul>
            <li>
              <strong>Provider adapter</strong>: Dhan (set <code>DHAN_ACCESS_TOKEN</code> and <code>DHAN_CLIENT_ID</code>) and Twelve Data (set <code>TWELVE_DATA_API_KEY</code>) are bundled. For another vendor, implement <code>MarketDataProvider</code> in{" "}
              <code>src/dashboards/india-sentiment/lib/data/providers/</code>, read its credentials from server-side environment variables, and register it in <code>provider.ts</code>. The scheduled refresh
              then pulls it.
            </li>
            <li>
              <strong>Ingestion API</strong>: push series observations and full option chains to <code>POST /api/india-sentiment/ingest</code> (requires <code>ADMIN_TOKEN</code>). Use this for RBI, AMFI,
              MOSPI, SEBI, NSDL/CDSL and Ministry of Finance releases too. Series are merged by date; option chains update the chain view, intraday pressure and the derived daily option series.
            </li>
          </ul>
          <p>Option chains: send every strike and expiry with LTP, previous close, volume (contracts), OI, change in OI, IV, previous IV, bid/ask, timestamp and the lot size in force on that date.</p>
          <pre className="overflow-x-auto rounded bg-surface-2 p-2 text-xs">{EXAMPLE}</pre>
        </div>
      </Panel>

      <Panel title={`Series retrieval status (${SERIES.length})`}>
        <div className="max-h-[600px] overflow-auto">
          <table className={tableClass}>
            <thead className="sticky top-0 bg-surface">
              <tr>
                <th>Key</th>
                <th>Title</th>
                <th>Source</th>
                <th>Type</th>
                <th>Loaded from</th>
                <th className="r">Obs</th>
                <th>Last obs</th>
                <th>Retrieved</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {SERIES.map((d) => {
                const s = series[d.key];
                return (
                  <tr key={d.key}>
                    <td className="font-mono text-xs">{d.key}</td>
                    <td className="text-xs">{d.title}</td>
                    <td className="text-xs text-ink-2">{d.url ? <a className="text-accent hover:underline" href={d.url} target="_blank" rel="noreferrer noopener">{d.source}</a> : d.source}</td>
                    <td className="text-xs">{KIND_LABEL[d.kind]}</td>
                    <td className="text-xs">{s?.meta.origin ?? "—"}</td>
                    <td className="r">{s?.obs.length ?? 0}</td>
                    <td className="tabular-nums text-xs">{s?.obs.at(-1)?.date ?? "—"}</td>
                    <td className="tabular-nums text-xs">{fmtDate(s?.meta.fetchedAt)}</td>
                    <td className="text-xs">{!s ? <span className="text-muted">not loaded</span> : s.meta.fetchStatus === "error" ? <span className="text-serious" title={s.meta.fetchError ?? ""}>error</span> : <span className="text-good-ink">ok</span>}</td>
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
