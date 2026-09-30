import type { DashboardManifest } from "@/platform/dashboards";
import { API, BASE } from "./routes";

const india: DashboardManifest = {
  id: "india-sentiment",
  name: "India Market Sentiment Terminal",
  shortName: "India Sentiment",
  tagline: "Multi-factor fear/greed and risk-appetite read of Indian markets: breadth, flows, option-chain positioning, volatility, rates, credit, macro.",
  description: "Measures the sentiment and risk appetite of Indian financial markets across 16 factor groups. Describes current conditions; not a prediction or trading advice.",
  basePath: BASE,
  apiBase: API,
  region: "India",
  icon: "gauge",
  status: "beta",
  nav: [
    { path: "", label: "Terminal" },
    { path: "options", label: "Option Chain" },
    { path: "markets", label: "Markets & Flows" },
    { path: "factors", label: "Factors & Data" },
    { path: "charts", label: "Charts" },
    { path: "history", label: "Analogues & Backtest" },
    { path: "alerts", label: "Alerts" },
    { path: "methodology", label: "Methodology" },
    { path: "settings", label: "Settings & Sources" },
  ],
  disclaimer:
    "Sentiment and positioning measurement, not a market prediction: fear does not imply the market will rise and greed does not imply it will fall. Nothing here is a recommendation to buy or sell. Option-flow labels are probabilistic, OI zones are potential (not guaranteed) support/resistance and Max Pain is a theoretical metric. Every indicator lists its source, timestamp and data status; unavailable data is never estimated.",
  async refresh() {
    const { refreshAll } = await import("./lib/data/service");
    const r = await refreshAll();
    return { ok: r.ok.length, failed: r.failed.length, skipped: r.skipped.length, detail: r };
  },
  async summary() {
    const { getSnapshot } = await import("./lib/data/service");
    const { configOverridesFromCookie } = await import("./lib/server-config");
    const s = await getSnapshot(await configOverridesFromCookie());
    if (s.score === null || !s.band) return { value: "—", label: "Insufficient data", detail: `Model confidence ${s.confidence.score}/100`, asOf: s.asOf, tone: "neutral" };
    return {
      value: `${s.score.toFixed(0)} / 100`,
      label: `${s.band.emoji} ${s.band.label}`,
      detail: `Confidence ${s.confidence.score}/100 · ${s.regime.primary ?? ""}`,
      asOf: s.asOf,
      tone: s.band.tone.startsWith("greed") ? "good" : s.band.tone === "neutral" ? "neutral" : s.band.tone === "fear" ? "warning" : "bad",
    };
  },
};

export default india;
