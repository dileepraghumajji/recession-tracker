import Link from "next/link";
import { getSnapshot } from "@/lib/data/service";
import { modelOverridesFromCookie } from "@/lib/server-config";
import { ScoreTile } from "@/components/ScoreTile";
import { IndicatorLink, Panel, SignalBadge } from "@/components/ui";
import { ScoreHistoryChart } from "@/components/charts/ScoreHistoryChart";
import { fmtDate, fmtNum, fmtSigned } from "@/lib/format";

export const dynamic = "force-dynamic";

function Rate({ label, v, suffix = "%", signed = false, href }: { label: string; v: number | null; suffix?: string; signed?: boolean; href?: string }) {
  const txt = v === null ? "n/a" : signed ? `${fmtSigned(v, 2)}${suffix}` : `${fmtNum(v, 2)}${suffix}`;
  const body = (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-0">
      <span className="text-sm text-ink-2">{label}</span>
      <span className={`num font-mono text-sm ${v === null ? "text-muted" : ""}`}>{txt}</span>
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:bg-surface-2">
      {body}
    </Link>
  ) : (
    body
  );
}

export default async function Dashboard() {
  const snap = await getSnapshot(await modelOverridesFromCookie());
  const { scores, scoreChanges: ch, regime, confluence, rates, explanation: ex, dataQuality: dq } = snap;
  const recMove = ch.recession.m1;
  const direction = recMove === null ? "No 1-month comparison available" : recMove > 2 ? `Increasing (+${recMove.toFixed(0)} pts over 1M)` : recMove < -2 ? `Decreasing (${recMove.toFixed(0)} pts over 1M)` : "Broadly stable over 1M";
  // Same rule as the explanation engine: categories at Watch or worse first
  // (by weighted points); if none, the largest weighted contributors.
  const ranked = scores.recession.categories
    .filter((c) => c.score !== null)
    .map((c) => ({ c, pts: c.effectiveWeight * (c.score as number) }))
    .sort((a, b) => b.pts - a.pts);
  const stressed = ranked.filter((x) => (x.c.score as number) >= 50);
  const sources = (stressed.length ? stressed : ranked).slice(0, 3);

  return (
    <div className="space-y-5">
      {/* Five-questions strip */}
      <section className="panel grid gap-3 p-4 text-sm md:grid-cols-5" aria-label="Summary">
        <div>
          <div className="panel-title mb-1">1 · Direction</div>
          <div>{direction}</div>
        </div>
        <div>
          <div className="panel-title mb-1">2 · Main contributors</div>
          <div>{sources.map((s) => `${s.c.label} (${(s.c.score as number).toFixed(0)})`).join(", ") || "n/a"}</div>
        </div>
        <div>
          <div className="panel-title mb-1">3 · Source of stress</div>
          <div>
            Growth/labour {fmtNum(scores.recession.categories.find((c) => c.id === "growth_labor")?.score ?? null, 0)} · Inflation {fmtNum(scores.inflation.score, 0)} ·
            Credit {fmtNum(scores.recession.categories.find((c) => c.id === "credit_financial")?.score ?? null, 0)} · Markets {fmtNum(scores.financial.score, 0)}
          </div>
        </div>
        <div>
          <div className="panel-title mb-1">4 · Confirmation</div>
          <div>
            {confluence.stressed} / {confluence.total} categories stressed; {confluence.deteriorating} deteriorating
          </div>
        </div>
        <div>
          <div className="panel-title mb-1">5 · Watch next</div>
          <div>{snap.watchNext.slice(0, 2).map((w) => w.name).join("; ") || "Nothing near a threshold"}</div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ScoreTile score={scores.recession} change={ch.recession} color="var(--s-recession)" note="Growth, labour, credit, curve, housing, consumer. Not a probability." />
        <ScoreTile score={scores.inflation} change={ch.inflation} color="var(--s-inflation)" note="Realised inflation, expectations (market & survey), wages, energy." />
        <ScoreTile score={scores.financial} change={ch.financial} color="var(--s-financial)" note="Credit spreads, volatility, equities, conditions, rates, dollar." />
        <ScoreTile
          score={scores.overall}
          change={ch.overall}
          color="var(--s-overall)"
          note="Weighted blend of the three. Not equivalent to recession probability."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Current regime" className="lg:col-span-2">
          <div className="font-mono text-lg font-semibold tracking-wide">{regime.display}</div>
          <p className="mt-1 text-sm text-ink-2">{regime.description}</p>
          <div className="mt-4 space-y-2 text-sm leading-relaxed">
            <p className="font-medium">{ex.headline}</p>
            {ex.summary.map((s, i) => (
              <p key={i} className="text-ink-2">
                {s}
              </p>
            ))}
            <p className="text-ink-2">{ex.inflation}</p>
            <p className="text-ink-2">{ex.financial}</p>
          </div>
          <p className="mt-3 text-[11px] text-muted">{ex.disclaimer}</p>
        </Panel>
        <Panel title="Data quality">
          <div className="text-3xl font-semibold">{(dq.freshness * 100).toFixed(0)}%</div>
          <div className="text-xs text-muted">Data freshness (weighted by model importance)</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              Coverage <span className="num float-right">{(dq.coverage * 100).toFixed(0)}%</span>
            </div>
            <div>
              Confidence <span className="float-right">{dq.confidenceLabel}</span>
            </div>
            {(["LIVE", "RECENT", "STALE", "UNAVAILABLE"] as const).map((s) => (
              <div key={s}>
                <span className={`status-${s} font-mono text-xs`}>{s}</span>
                <span className="num float-right">{dq.counts[s]}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-muted">
            As of {snap.asOf}. Last fetch {fmtDate(dq.lastFetchedAt)}.
            {dq.fetchErrors.length > 0 && (
              <>
                {" "}
                <Link href="/settings" className="link">
                  {dq.fetchErrors.length} source error(s)
                </Link>
                .
              </>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Treasury curve" right={<Link href="/rates" className="link text-xs">30Y Treasury Stress →</Link>}>
          <Rate label="30Y Treasury" v={rates.levels.y30} href="/indicators/ust30y" />
          <Rate label="10Y Treasury" v={rates.levels.y10} href="/indicators/ust10y" />
          <Rate label="2Y Treasury" v={rates.levels.y2} href="/indicators/ust2y" />
          <Rate label="3M Treasury" v={rates.levels.y3m} href="/indicators/ust3m" />
          <Rate label="10Y–2Y" v={rates.levels.s10y2y} signed href="/indicators/spread_10y2y" />
          <Rate label="10Y–3M" v={rates.levels.s10y3m} signed href="/indicators/spread_10y3m" />
          <Rate label="10Y real (TIPS)" v={rates.levels.real10} href="/indicators/real10y" />
          <div className="mt-3 text-xs text-ink-2">
            3M driver of long-end move: <span className="font-medium text-ink">{rates.driverLabel}</span>
            {rates.curveMove !== "unknown" && <> · {rates.curveMove}</>}
          </div>
        </Panel>

        <Panel title="Category signals">
          <ul className="space-y-1.5">
            {snap.dashboardSignals.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-sm" title={s.source}>
                <span>{s.label}</span>
                <span className="flex items-center gap-3">
                  <span className="num w-8 text-right text-ink-2">{fmtNum(s.score, 0)}</span>
                  <span className="w-20">
                    <SignalBadge signal={s.signal} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted">Category stress 0–100. Bands: &lt;50 Normal · 50–75 Watch · 75–90 Elevated · ≥90 Severe.</p>
        </Panel>

        <Panel title="Signal confluence">
          <div className="text-2xl font-semibold">
            {confluence.stressed} / {confluence.total}
            <span className="ml-2 text-sm font-normal text-ink-2">major recession categories showing stress</span>
          </div>
          <ul className="mt-3 space-y-1.5">
            {confluence.groups.map((g) => (
              <li key={g.id} className="flex items-center justify-between text-sm">
                <span>{g.label}</span>
                <span className="flex items-center gap-3">
                  <span className={`num text-xs ${g.deteriorating ? "trend-bad" : g.change3m !== null && g.change3m < -5 ? "trend-good" : "trend-flat"}`}>
                    {g.change3m === null ? "—" : `${g.change3m > 0 ? "↑" : g.change3m < 0 ? "↓" : "→"} ${Math.abs(g.change3m).toFixed(0)} (3M)`}
                  </span>
                  <span className="w-20">
                    <SignalBadge signal={g.signal} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted">
            {confluence.elevatedOrWorse} at Elevated/Severe; {confluence.deteriorating} deteriorated by &gt;5 pts over 3M. A breadth count — not a probability.
          </p>
        </Panel>
      </div>

      <Panel title="Stress score history">
        <ScoreHistoryChart weekly={snap.scoreHistory} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="What changed and why it matters">
          <ul className="prose-sm text-sm">
            {ex.whatChanged.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Why it matters</h3>
          <ul className="prose-sm text-sm text-ink-2">
            {ex.whyItMatters.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </Panel>
        <Panel title="What to watch next">
          <table className="data">
            <thead>
              <tr>
                <th>Indicator</th>
                <th className="r">Current</th>
                <th>Next band</th>
                <th>Threshold</th>
              </tr>
            </thead>
            <tbody>
              {snap.watchNext.map((w) => (
                <tr key={w.indicatorId}>
                  <td>
                    <IndicatorLink id={w.indicatorId}>{w.name}</IndicatorLink>
                    <div className="text-[11px] text-muted">{w.why}</div>
                  </td>
                  <td className="r">{w.current}</td>
                  <td>{w.nextBand}</td>
                  <td className="text-xs text-ink-2">{w.threshold}</td>
                </tr>
              ))}
              {snap.watchNext.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted">
                    No scored indicator is within 20 stress points of its next band.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Evidence supporting recession stress">
          <EvidenceList items={ex.supporting} empty="No recession-score indicator is at Watch level or above." />
        </Panel>
        <Panel title="Evidence contradicting it">
          <EvidenceList items={ex.contradicting} empty="No recession-score indicator is clearly benign (stress < 35)." />
        </Panel>
        <Panel title="What would confirm the signal">
          <ul className="prose-sm text-sm">
            {ex.confirm.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </Panel>
        <Panel title="What would invalidate it">
          <ul className="prose-sm text-sm">
            {ex.invalidate.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Energy inflation stress" right={<span className="num text-sm">{fmtNum(snap.energy.score, 0)} / 100</span>}>
        <p className="text-sm text-ink-2">{snap.energy.interpretation}</p>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {(
            [
              ["Energy / inflation impulse pattern", snap.energy.supplyPattern],
              ["Demand shock / growth-scare pattern", snap.energy.demandPattern],
            ] as const
          ).map(([label, p]) => (
            <div key={label}>
              <div className="mb-1 text-xs font-semibold text-muted">
                {label}: {p.matched} of {p.available} conditions met
              </div>
              <ul className="space-y-1 text-sm">
                {p.checks.map((c) => (
                  <li key={c.label} className="flex justify-between gap-2">
                    <span className={c.met ? "" : "text-ink-2"}>
                      {c.met === null ? "○" : c.met ? "●" : "○"} {c.label}
                    </span>
                    <span className="num text-xs text-muted">{c.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function EvidenceList({ items, empty }: { items: { indicatorId: string; text: string }[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="prose-sm text-sm">
      {items.map((s) => (
        <li key={s.indicatorId}>
          <IndicatorLink id={s.indicatorId}>{s.text}</IndicatorLink>
        </li>
      ))}
    </ul>
  );
}
