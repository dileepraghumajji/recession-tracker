import type { DashboardManifest } from "@/platform/dashboards";
import { API, BASE } from "./routes";

const recession: DashboardManifest = {
  id: "recession",
  name: "Macro Recession Stress Monitor",
  shortName: "Recession Stress",
  tagline: "US macro and financial-market stress: recession, inflation and market stress scores, regime and 30Y Treasury module.",
  description: "Transparent monitor of US macro and financial-market stress. An analytical dashboard, not a recession predictor.",
  basePath: BASE,
  apiBase: API,
  region: "United States",
  icon: "activity",
  status: "live",
  nav: [
    { path: "", label: "Dashboard" },
    { path: "indicators", label: "Indicators" },
    { path: "rates", label: "30Y / Rates" },
    { path: "methodology", label: "How the Score Works" },
    { path: "history", label: "Historical Comparison" },
    { path: "backtest", label: "Backtest" },
    { path: "alerts", label: "Alerts" },
    { path: "settings", label: "Settings & Data" },
  ],
  disclaimer:
    "Analytical decision-support tool. Scores describe how current conditions compare with historical stress patterns; they are not recession probabilities or forecasts, and nothing here is investment advice. Data: Federal Reserve Board, BLS, BEA, Census, Chicago Fed, NY Fed, Atlanta Fed, EIA and others via FRED; each series lists its source and timestamps.",
  async refresh() {
    const { refreshAll } = await import("./lib/data/service");
    const r = await refreshAll();
    return { ok: r.ok.length, failed: r.failed.length, skipped: r.skipped.length, detail: r };
  },
  // Sources update daily at most; a 5-minute check is plenty.
  live: {
    pollSeconds: 300,
    async status() {
      const { liveStatus } = await import("./lib/data/service");
      return liveStatus();
    },
  },
  async summary() {
    const { getSnapshot } = await import("./lib/data/service");
    const { modelOverridesFromCookie } = await import("./lib/server-config");
    const { SIGNAL_META } = await import("./lib/format");
    const snap = await getSnapshot(await modelOverridesFromCookie());
    const s = snap.scores.recession;
    const tone = s.signal === "normal" ? "good" : s.signal === "watch" ? "warning" : s.signal === "unavailable" ? "neutral" : "bad";
    return {
      value: s.score === null ? "—" : `${s.score.toFixed(0)} / 100`,
      label: `Recession Stress · ${SIGNAL_META[s.signal].label}`,
      detail: `Regime: ${snap.regime.display}`,
      asOf: snap.asOf,
      tone,
    };
  },
};

export default recession;
