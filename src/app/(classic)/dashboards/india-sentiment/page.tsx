import Link from "next/link";
import { getSnapshot } from "@/dashboards/india-sentiment/lib/data/service";
import { configOverridesFromCookie } from "@/dashboards/india-sentiment/lib/server-config";
import { fmtCr, fmtNum, fmtRupeesCr, fmtSigned } from "@/dashboards/india-sentiment/lib/format";
import { zone } from "@/dashboards/india-sentiment/lib/engine/snapshot";
import { BandBadge, Delta, FactorBars, Panel, SentimentScale, Tone } from "@/dashboards/india-sentiment/components/ui";
import { BASE } from "@/dashboards/india-sentiment/routes";

export const dynamic = "force-dynamic";

export default async function Terminal() {
  const s = await getSnapshot(await configOverridesFromCookie());
  const nifty = s.options.find((o) => o.underlying === "NIFTY") ?? null;
  const near = nifty?.near ?? null;
  const change = s.changes.d1?.significant ? s.changes.d1 : s.changes.w1;
  const bullish = s.divergences.filter((d) => d.kind === "bullish");
  const bearish = s.divergences.filter((d) => d.kind === "bearish");
  const flowRows: [string, keyof typeof s.flows.fii][] = [
    ["1D", "d1"],
    ["5D", "d5"],
    ["1M", "m1"],
    ["3M", "m3"],
    ["6M", "m6"],
  ];

  return (
    <div className="space-y-5">
      {/* Headline row */}
      <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
        <div className="panel flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between">
            <span className="panel-title">India Market Sentiment</span>
            <span className="text-xs text-muted">as of {s.asOf}</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="num text-5xl font-semibold tracking-tight">{s.score === null ? "—" : s.score.toFixed(0)}</span>
            <span className="text-muted">/ 100</span>
            <BandBadge band={s.band} />
          </div>
          <SentimentScale score={s.score} bands={s.bands} />
          <div>
            <div className="mb-1 text-[11px] text-muted">Sentiment momentum (points)</div>
            <div className="flex gap-6">
              <Delta v={s.momentum.d1} label="1D" />
              <Delta v={s.momentum.w1} label="1W" />
              <Delta v={s.momentum.m1} label="1M" />
              <Delta v={s.momentum.m3} label="3M" />
            </div>
          </div>
        </div>
        <div className="panel flex flex-col gap-3 p-5">
          <div>
            <div className="panel-title mb-1">Model confidence</div>
            <div className="flex items-baseline gap-2">
              <span className="num text-3xl font-semibold">{s.confidence.score}</span>
              <span className="text-sm text-muted">/ 100</span>
            </div>
            <div className="num mt-1 text-[11px] text-muted">
              coverage {(s.confidence.coverage * 100).toFixed(0)}% · freshness {(s.confidence.freshness * 100).toFixed(0)}% · core segments {(s.confidence.criticalCoverage * 100).toFixed(0)}% · source agreement {(s.confidence.agreement * 100).toFixed(0)}%
            </div>
            <ul className="mt-2 space-y-0.5 text-xs text-ink-2">
              {s.confidence.reasons.slice(0, 3).map((r) => (
                <li key={r}>· {r}</li>
              ))}
            </ul>
          </div>
          <div className="border-t border-line pt-3">
            <div className="panel-title mb-1">Current regime</div>
            <div className="font-mono text-lg font-semibold">{s.regime.primary ?? "UNAVAILABLE"}</div>
            {s.regime.secondary.length > 0 && <div className="text-xs text-ink-2">also: {s.regime.secondary.join(", ")}</div>}
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer text-muted">Regime conditions</summary>
              <p className="mt-1 text-ink-2">{s.regime.text}</p>
              <ul className="mt-1 space-y-1">
                {s.regime.candidates.map((c) => (
                  <li key={c.id}>
                    <span className={c.matched ? "font-semibold" : "text-muted"}>{c.id}</span>
                    <span className="text-muted"> — {c.conditions.map((x) => `${x.met === null ? "n/a" : x.met ? "✓" : "✗"} ${x.text}`).join("; ")}</span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </div>
        <div className="panel p-5">
          <div className="panel-title mb-2">Why?</div>
          <div className="text-xs text-muted">Positive contributors</div>
          <ul className="mb-3 mt-1 space-y-0.5 text-sm">
            {s.drivers.positive.slice(0, 5).map((d) => (
              <li key={d.id}>
                <span className="trend-good">+</span> {d.phrase} <span className="num text-xs text-muted">({fmtSigned(d.points, 1)})</span>
              </li>
            ))}
            {!s.drivers.positive.length && <li className="text-muted">none</li>}
          </ul>
          <div className="text-xs text-muted">Negative contributors</div>
          <ul className="mt-1 space-y-0.5 text-sm">
            {s.drivers.negative.slice(0, 5).map((d) => (
              <li key={d.id}>
                <span className="trend-bad">−</span> {d.phrase} <span className="num text-xs text-muted">({fmtSigned(d.points, 1)})</span>
              </li>
            ))}
            {!s.drivers.negative.length && <li className="text-muted">none</li>}
          </ul>
        </div>
      </section>

      <Panel title="Summary">
        <p className="text-sm leading-relaxed">{s.headline}</p>
        {change && <p className="mt-2 text-sm leading-relaxed text-ink-2">{change.text}</p>}
      </Panel>

      {/* Twenty questions */}
      <section aria-label="Key questions" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {s.answers.map((a) => (
          <div key={a.n} className="panel p-3">
            <div className="panel-title mb-1">
              {a.n} · {a.q}
            </div>
            <div className="text-[13px] leading-snug">
              <Tone tone={a.tone}>{a.a}</Tone>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Factor contribution" right={<Link href={`${BASE}/factors`} className="link text-xs">All indicators →</Link>}>
          <FactorBars factors={s.factors} />
          <p className="mt-2 text-[11px] text-muted">Bars show each factor score around neutral 50; points = effective weight × (score − 50) and sum to the master score − 50.</p>
        </Panel>
        <Panel title="Market driver analysis">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="mb-1 text-xs text-muted">Top positive drivers</div>
              <ol className="list-decimal space-y-1 pl-5">
                {s.drivers.positive.slice(0, 5).map((d) => (
                  <li key={d.id}>
                    {d.label} <span className="num text-xs text-muted">{d.score.toFixed(0)} · {fmtSigned(d.points, 1)} pts</span>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <div className="mb-1 text-xs text-muted">Top negative drivers</div>
              <ol className="list-decimal space-y-1 pl-5">
                {s.drivers.negative.slice(0, 5).map((d) => (
                  <li key={d.id}>
                    {d.label} <span className="num text-xs text-muted">{d.score.toFixed(0)} · {fmtSigned(d.points, 1)} pts</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3 text-xs sm:grid-cols-3">
            {(
              [
                ["Market momentum", s.subScores.momentum],
                ["Market internal strength", s.subScores.internalStrength],
                ["Sector risk appetite", s.subScores.sectorRiskAppetite],
                ["Institutional flow", s.subScores.institutionalFlow],
                ["India liquidity", s.subScores.liquidity],
                ["Credit stress (higher = worse)", s.subScores.creditStress],
                ["Global risk appetite", s.subScores.globalRisk],
                ["Earnings momentum", s.subScores.earningsMomentum],
                ["Retail speculation", s.subScores.retailSpeculation],
              ] as const
            ).map(([l, v]) => (
              <div key={l} className="flex justify-between gap-2">
                <span className="text-ink-2">{l}</span>
                <span className="num">{v === null ? "n/a" : v.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title="NIFTY option chain · current expiry" right={<Link href={`${BASE}/options`} className="link text-xs">Option chain →</Link>}>
          {near ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-ink-2">Expiry</dt>
              <dd className="num text-right">{near.expiry}</dd>
              <dt className="text-ink-2">Spot / ATM</dt>
              <dd className="num text-right">
                {fmtNum(near.spot, 1)} / {near.atmStrike}
              </dd>
              <dt className="text-ink-2">Call premium</dt>
              <dd className="num text-right">{fmtRupeesCr(near.totals.callPremium)}</dd>
              <dt className="text-ink-2">Put premium</dt>
              <dd className="num text-right">{fmtRupeesCr(near.totals.putPremium)}</dd>
              <dt className="text-ink-2">Premium PCR</dt>
              <dd className="num text-right">{fmtNum(near.totals.premiumPcr, 2)}</dd>
              <dt className="text-ink-2">OI PCR</dt>
              <dd className="num text-right">{fmtNum(near.totals.oiPcr, 2)}</dd>
              <dt className="text-ink-2">Max Pain (theoretical)</dt>
              <dd className="num text-right">
                {near.maxPain ? `${near.maxPain.strike} (${fmtSigned(near.maxPain.distancePct, 1)}%)` : "—"}
              </dd>
              <dt className="text-ink-2">Potential support</dt>
              <dd className="num text-right">{zone(near.zones.support)}</dd>
              <dt className="text-ink-2">Potential resistance</dt>
              <dd className="num text-right">{zone(near.zones.resistance)}</dd>
            </dl>
          ) : (
            <p className="text-sm text-muted">No option-chain data. Ingest chains via the API (see Settings & Sources).</p>
          )}
          {nifty && (
            <div className="mt-3 space-y-1 border-t border-line pt-2 text-xs text-ink-2">
              <p>{nifty.shift.text}</p>
              <p className={nifty.pcr.divergent ? "font-semibold" : ""}>{nifty.pcr.text}</p>
            </div>
          )}
        </Panel>
        <Panel title={`FII / DII flows · ${s.flows.label}`} right={<Link href={`${BASE}/markets`} className="link text-xs">Flows →</Link>}>
          <table className="data">
            <thead>
              <tr>
                <th>Window</th>
                <th className="r">FII / FPI</th>
                <th className="r">DII</th>
              </tr>
            </thead>
            <tbody>
              {flowRows.map(([l, k]) => (
                <tr key={k}>
                  <td>{l}</td>
                  <td className="r">{fmtCr(s.flows.fii[k])}</td>
                  <td className="r">{fmtCr(s.flows.dii[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-2 space-y-1 text-xs text-ink-2">
            {s.flows.detections.map((d) => (
              <li key={d}>· {d}</li>
            ))}
          </ul>
        </Panel>
        <Panel title="Sentiment divergences">
          <p className="mb-2 text-[11px] text-muted">Describe current conditions; not reversal signals.</p>
          {[
            ["Bullish divergences", bullish],
            ["Bearish divergences", bearish],
          ].map(([title, list]) => (
            <div key={title as string} className="mb-3">
              <div className="mb-1 text-xs text-muted">{title as string}</div>
              <ul className="space-y-0.5 text-[13px]">
                {(list as typeof bullish).map((d) => (
                  <li key={d.id} className={d.active ? "" : "text-muted"} title={d.evidence}>
                    {d.active === null ? "○" : d.active ? "●" : "○"} {d.label}
                    {d.active === null && <span className="text-[11px]"> · data n/a</span>}
                    {d.active && <div className="pl-4 text-[11px] text-ink-2">{d.evidence}</div>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="border-t border-line pt-2 text-xs text-ink-2">
            <span className="font-semibold">{s.breadth.divergence.label}.</span> {s.breadth.divergence.text}
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        {(
          [
            ["What changed?", s.narrative.whatChanged],
            ["Why does it matter?", s.narrative.whyItMatters],
            ["What confirms the signal?", s.narrative.confirms],
            ["What contradicts the signal?", s.narrative.contradicts],
            ["What should be monitored?", s.narrative.monitor],
          ] as const
        ).map(([t, items]) => (
          <Panel key={t} title={t}>
            <ul className="space-y-1.5 text-[13px] leading-snug">
              {items.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </Panel>
        ))}
      </section>

      <Panel title="Data quality" right={<Link href={`${BASE}/factors`} className="link text-xs">Per-indicator status →</Link>}>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="status-LIVE">LIVE {s.dataQuality.live}</span>
          <span className="status-RECENT">RECENT {s.dataQuality.recent}</span>
          <span className="status-STALE">STALE {s.dataQuality.stale}</span>
          <span className="status-UNAVAILABLE">UNAVAILABLE {s.dataQuality.unavailable}</span>
          {s.dataQuality.synthetic && <span style={{ color: "var(--demo)" }}>SYNTHETIC data in use</span>}
        </div>
      </Panel>
    </div>
  );
}
