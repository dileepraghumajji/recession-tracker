import { bandsFor, resolveConfig } from "@/dashboards/india-sentiment/lib/config";
import { MIN_SCORE_COVERAGE } from "@/dashboards/india-sentiment/lib/engine/evaluate";
import { INDICATORS } from "@/dashboards/india-sentiment/lib/indicators";
import { configOverridesFromCookie } from "@/dashboards/india-sentiment/lib/server-config";
import { FACTOR_IDS } from "@/dashboards/india-sentiment/lib/types";
import { PageHeader, Panel } from "@/dashboards/india-sentiment/components/ui";
import { proseClass, tableClass } from "@/platform/ui/patterns/content";
import { cn } from "@/platform/ui/cn";

export const dynamic = "force-dynamic";

export default async function Methodology() {
  const cfg = resolveConfig(await configOverridesFromCookie());
  const total = FACTOR_IDS.reduce((s, id) => s + cfg.factors[id].weight, 0);
  let lo = 0;
  return (
    <div className="space-y-5">
      <PageHeader title="Methodology" description="How the India Market Sentiment score, confidence, regime and explanations are computed." />
      <Panel title="Principles">
        <div className={cn(proseClass, "max-w-4xl text-sm")}>
          <ul>
            <li>
              <strong>Measurement, not prediction.</strong> The score describes current sentiment and positioning. Fear does not mean the market will rise; greed does not mean it will fall. No trading instructions are given.
            </li>
            <li>
              <strong>Multi-factor, not “VIX + PCR”.</strong> {FACTOR_IDS.length} factor groups and {INDICATORS.filter((d) => d.scoring).length} scored indicators (plus {INDICATORS.filter((d) => !d.scoring).length} context
              readings). Highly correlated indicators share a <em>cluster</em> and are averaged, so they count once.
            </li>
            <li>
              <strong>No invented data.</strong> Missing or too-old data is shown as UNAVAILABLE/STALE and lowers Model Confidence. If coverage-weighted factor weight falls below {Math.round(MIN_SCORE_COVERAGE * 100)}%, no
              score is published.
            </li>
            <li>
              <strong>Point-in-time.</strong> Percentiles use only trailing history (default {cfg.percentileYears} years, minimum {cfg.minHistoryYears}); historical scores apply publication lags (weekly 5 days, monthly 45 days,
              quarterly 100 days).
            </li>
          </ul>
        </div>
      </Panel>
      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Scoring pipeline">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            <li>Each indicator's metric (return, spread, ratio, flow sum…) is mapped to 0–100, higher = greed / risk-on: a point-in-time percentile (polarity-adjusted) or, for bounded or target-based measures (PMI, CPI vs target, PCR, breadth thrust), fixed anchors.</li>
            <li>Indicators in the same cluster are averaged; clusters are weighted within their factor. Factor coverage = share of cluster weight with data.</li>
            <li>Factor weight × (0.5 + 0.5 × coverage) gives the raw weight; weights are renormalised across available factors and any factor above {Math.round(cfg.maxFactorShare * 100)}% is capped (excess redistributed).</li>
            <li>Master score = 50 + Σ effective weight × (factor score − 50). Each factor's “points” are its term in that sum, so contributions add up exactly.</li>
            <li>Sentiment momentum compares today's score with the same computation 1 day, 1 week, 1 month and 3 months ago.</li>
          </ol>
        </Panel>
        <Panel title="Bands">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Range</th>
                <th>Band</th>
                <th>Class</th>
              </tr>
            </thead>
            <tbody>
              {bandsFor(cfg).map((b) => {
                const row = (
                  <tr key={b.label}>
                    <td className="tabular-nums">
                      {lo}–{Math.min(100, Math.round(b.max))}
                    </td>
                    <td>
                      {b.emoji} {b.label}
                    </td>
                    <td>{b.cls}</td>
                  </tr>
                );
                lo = Math.min(100, Math.round(b.max));
                return row;
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted">Thresholds are configurable on Settings & Sources.</p>
        </Panel>
      </section>
      <Panel title={`Factor weights (sum ${total}; applied as relative weights)`}>
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Factor</th>
                <th className="r">Weight</th>
                <th className="r">Share</th>
                <th>Clusters (weight)</th>
                <th>What it measures</th>
              </tr>
            </thead>
            <tbody>
              {FACTOR_IDS.map((id) => {
                const f = cfg.factors[id];
                return (
                  <tr key={id}>
                    <td className="whitespace-nowrap">{f.label}</td>
                    <td className="r">{f.weight}</td>
                    <td className="r">{((f.weight / total) * 100).toFixed(1)}%</td>
                    <td className="text-xs text-ink-2">{f.clusters.map((c) => `${c.label} (${c.weight})`).join(" · ")}</td>
                    <td className="text-xs">{f.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Sector rotation is the “sector risk appetite” cluster of Equity Momentum; market internals are a cluster of Market Breadth; IV skew is a cluster of Volatility; expiry-specific positioning is a cluster of
          Derivatives Positioning; Credit Stress Score = 100 − Credit factor.
        </p>
      </Panel>
      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Model confidence">
          <p className="text-sm">0.35 × factor coverage + 0.25 × freshness (LIVE 1, RECENT 0.85, STALE 0.4) + 0.25 × coverage of core Indian segments (momentum, breadth, derivatives, volatility, FII/DII) + 0.15 × agreement between independent sources (USD/INR: market vs Fed H.10; 10Y G-Sec: CCIL vs OECD). Capped at 20 when no score can be published.</p>
        </Panel>
        <Panel title="Regime classifier">
          <p className="text-sm">
            Separate from the score. Specialised regimes (high-volatility, event-driven, stagflationary, deflationary, risk-off, risk-on) require every one of their conditions — drawn from different factor groups — to hold.
            Liquidity-, earnings- and macro-driven tags describe what is carrying the score. Otherwise the regime is cautious risk-on (≥ 55), neutral or cautious risk-off (≤ 45). Conditions are listed with the regime.
          </p>
        </Panel>
        <Panel title="Option-chain analytics">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Premium traded = LTP × volume × lot size (volume in contracts; historical calculations must use the lot size in force on the date).</li>
            <li>OI PCR = put OI / call OI; premium PCR = put premium / call premium; both within ±{cfg.strikeWindow} strikes of ATM by default. Divergence: OI PCR ≥ {cfg.oiPcrBullish} with premium PCR ≥ {cfg.premiumPcrBearish}, or OI PCR ≤ {cfg.oiPcrBearish} with premium PCR ≤ {cfg.premiumPcrBullish}.</li>
            <li>Buying/writing: sign of price change × sign of OI change, strength from the size of both moves, volume/OI and IV change. Reported as “Possible / Likely / Evidence suggests”.</li>
            <li>Premium pressure: Σ premium × direction (buying +1, writing −1, short covering +0.5, long unwinding −0.5) × evidence × IV context; net = calls − puts (bullish +).</li>
            <li>Max Pain: strike minimising the intrinsic value payable to option holders. OI zones: contiguous strikes with ≥ 60% of the peak OI, above spot for calls and below for puts.</li>
            <li>IV skew: 25-delta put IV − 25-delta call IV (Black-Scholes deltas, risk-free {(cfg.riskFreeRate * 100).toFixed(1)}%).</li>
          </ul>
        </Panel>
        <Panel title="Limitations">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Weights and anchors are judgement-based starting points, not fitted to returns (to avoid overfitting); change them in Settings.</li>
            <li>Many Indian series are released monthly or quarterly; their contribution lags fast-moving markets.</li>
            <li>Option-flow classification uses end-of-period snapshots and cannot see individual trades.</li>
            <li>Backtest statistics are historical observations with heavily overlapping windows; they are not expected returns.</li>
          </ul>
        </Panel>
      </section>
    </div>
  );
}
