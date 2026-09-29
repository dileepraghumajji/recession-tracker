# Methodology

> The scores describe how closely current conditions resemble historical stress conditions. They are **not**
> recession probabilities and do not predict that a recession will or will not occur. The live
> "How the Score Works" page shows every number described here for the current data.

## 1. Indicator stress (0–100)

Each scored indicator defines:

* a **stress metric** — the quantity that carries the signal (e.g. the Sahm value; the YoY change in the
  4-week average of claims; the level of the HY OAS; the 52-week drawdown of the S&P 500);
* a **direction** — whether higher or lower values mean more stress;
* a **mapping** to 0–100:
  * **Percentile (default)** — the point-in-time percentile of the current metric within its own history up
    to that date (mid-rank for ties), flipped when lower is worse. At least 1 year of history (5 years in the
    historical engine) is required; otherwise the indicator is treated as unavailable.
  * **Absolute anchors (where economically justified)** — five metric values mapping to stress
    0 / 50 / 75 / 90 / 100, interpolated linearly. Used for: yield-curve spreads (inversion at 0), Sahm
    Rule (0.50 threshold = start of Severe), inflation vs the 2% target, breakevens, UMich expectations, wage
    growth, GDP / GDPNow, PMI-type diffusion indices (50 / 0), SLOOS net tightening, equity drawdowns
    (−10% / −20%), oil and gas price shocks, HY widening speed, 12-month change in unemployment.

### Signal bands

| Stress | Signal |
|---|---|
| < 50 | 🟢 Normal |
| 50–75 | 🟡 Watch |
| 75–90 | 🟠 Elevated |
| ≥ 90 | 🔴 Severe |

For percentile-mapped indicators these are exactly the 50th / 75th / 90th historical percentiles.

### Trend

Trend = change in stress over ~3 months. ↑ deteriorating (> +5), → stable, ↓ improving (< −5). Because
stress is already direction-adjusted, "↑" always means *worse*: unemployment rising, GDP falling, spreads
widening, ISM falling and VIX rising all show ↑. Treasury yield levels, oil, gold and copper are
context-dependent and are shown with "·".

## 2. Avoiding double counting

1. **Factor clusters.** Indicators measuring the same factor are averaged into one cluster that receives a
   single weight. Adding a fourth measure of inflation does not increase inflation's weight.
   * Realised inflation: `headline` = {CPI, PCE}, `core` = {core CPI, core PCE}.
   * Credit: `high_yield` = {HY OAS, CCC OAS, HY widening}; `investment_grade` = {IG OAS, BBB OAS, Baa–10Y}.
   * Financial conditions: {NFCI, ANFCI}. Claims: {initial, continuing}. Surveys: {ISM ×5, Philly Fed, Empire}.
2. **Level exclusions.** The 2Y yield, 3M bill and Fed funds rate move together, so none is scored as a level;
   only the 2Y–3M spread (expected easing) enters the recession score.
3. **One slot per score.** An indicator may appear in several scores (e.g. HY OAS in Recession and Financial
   stress, which are reported separately) but never in two clusters of the same score. This is enforced by tests.
4. **Correlation audit.** The methodology page computes pairwise correlations of monthly stress metrics over 15
   years, reporting average within- vs across-cluster correlation and flagging highly correlated pairs in
   different clusters for review.

## 3. Aggregation

```
score      = Σ_k W_k · S_k / Σ_k W_k          (categories with data)
S_k        = Σ_c w_c · C_c / Σ_c w_c          (clusters with data)
C_c        = mean(stress_i)                   (available indicators in cluster c)
points_i   = effective_weight_i · stress_i    (Σ points_i = score exactly)
```

Missing indicators are **never** imputed. Their weight is redistributed within the cluster/category and the
loss is reported as **coverage**. **Freshness** = Σ nominal weight × status factor (LIVE 1.0, RECENT 0.85,
STALE 0.4, UNAVAILABLE 0) over configured sources. **Confidence** = coverage × freshness
(High ≥ 80%, Moderate ≥ 60%, else Low).

Status thresholds (age of latest observation):

| Frequency | LIVE | RECENT | STALE | UNAVAILABLE |
|---|---|---|---|---|
| Daily | ≤ 5 d | ≤ 12 d | ≤ 45 d | > 45 d |
| Weekly | ≤ 13 d | ≤ 25 d | ≤ 75 d | > 75 d |
| Monthly | ≤ 70 d | ≤ 110 d | ≤ 220 d | > 220 d |
| Quarterly | ≤ 215 d | ≤ 300 d | ≤ 420 d | > 420 d |

(Monthly/quarterly observations are dated at the start of the period, so a normal release already has an age
of 30–60 days.)

## 4. The four scores

### Recession Stress (initial weights)

| Category | Weight | Clusters (weight) |
|---|---|---|
| Growth / Labor | 30 | unemployment: Sahm + 12M change (25), claims (15), payrolls 3M avg (15), JOLTS openings + quits (10), business surveys: ISM / Philly / Empire (15), real activity: IP, retail, PCE, GDP, GDPNow (20) |
| Credit / Financial | 25 | high yield (30), investment grade (20), NFCI (25), SLOOS lending standards (25) |
| Yield Curve / Rates | 15 | 10Y–3M & 10Y–2Y (45), deepest 10Y–3M inversion over 24M (20), 2Y–3M expected easing (25), term premium (10) |
| Housing | 10 | starts & permits (40), home sales (25), affordability & mortgage-rate shock (20), months' supply (15) |
| Consumer | 10 | sentiment (25), delinquencies (30), income & saving (25), debt service (20) |
| Equity / Market | 5 | drawdowns (45), 3M momentum (20), VIX (35) |
| Inflation / Energy | 5 | oil price shock (50), core inflation (50) |

### Inflation Stress

Actual inflation 40 (core 60 / headline 40), market expectations (5Y/10Y breakevens) 20, survey expectations
(UMich) 15, wages 10, energy 15 (oil 70 / natural gas 30). Actual, market-implied and survey measures are
kept in separate categories.

### Financial Market Stress

Credit spreads 35, NFCI 20, VIX 15, equity drawdowns 15, rates (term premium, 10Y volatility) 10, dollar 5.

### Overall Macro Stress

50% Recession + 25% Inflation + 25% Financial. A breadth-of-stress measure, **not** a recession probability.

All weights are initial judgements, deliberately not fitted to past recessions, and are configurable.

## 5. Regime classification

Rules evaluated on sub-scores (R = recession, I = inflation, F = financial), in priority order:

| Regime | Rule |
|---|---|
| Recession stress | R ≥ 60 and (labour ≥ 60 or credit ≥ 60) and ≥ 4 of 7 confluence categories at Watch+ |
| Stagflationary stress | I ≥ 60 and R ≥ 50 |
| Deflationary stress | R ≥ 55 and I ≤ 25 |
| Financial stress | F ≥ 65 |
| Inflationary overheating | I ≥ 60 and R < 40 and labour < 50 |
| Growth slowdown | R ≥ 45 |
| Late-cycle | 30 ≤ R < 45 and (curve ≥ 50 or I ≥ 45 or credit ≥ 50) |
| Expansion | R < 45 and F < 50 and I < 60 |

Qualifiers are appended: "Inflation pressure" (I ≥ 50), "Financial strain" (F ≥ 50), "Long-end /
term-premium pressure" (30Y percentile & term-premium stress average ≥ 70). If recession-score confidence is
below 35% the regime is "Insufficient data".

## 6. 30Y Treasury Stress module

Over three months: Δ10Y = Δreal (TIPS) + Δbreakeven, and Δ10Y = Δexpected path + Δterm premium (Kim-Wright).
Driver: term premium if it explains ≥ 50% of a rise; inflation expectations if breakevens do; real
growth/policy if real yields do (unless term premium is also material); growth fears / easing if yields fall
led by the short end. Curve moves are classified as bull/bear steepening/flattening. When long yields are high
but credit and labour stress are contained, the module states this is more consistent with
inflation/term-premium/fiscal pressure than with recession stress.

## 7. Energy Inflation Stress

Score = 50% energy category + 25% breakeven category + 25% oil 3M impulse. Two patterns are checked:
*energy/inflation impulse* (oil ↑, 5Y breakevens ↑, 10Y ↑) versus *demand shock / growth scare* (oil ↓,
unemployment ↑, credit spreads ↑, 2Y ↓), and the interpretation says which, if either, dominates.

## 8. Signal confluence

Seven independent categories — Labor, Manufacturing/Activity, Credit, Housing, Yield curve, Consumer,
Equities — each scored from the recession-score clusters. The dashboard reports how many are at Watch or worse,
how many are Elevated/Severe, and how many deteriorated by more than 5 points over 3 months. It is a breadth
count, not a probability.

## 9. Explanation engine

Template-based and fully traceable: headline (level and 1M change), main contributing categories, what
changed (score, category and indicator trend moves), why it matters (category rationale), supporting evidence
(recession indicators at Watch+), contradicting evidence (stress < 35), what would confirm (Sahm distance to
0.50, Watch-band indicators crossing into Elevated with the exact metric value, credit confirmation) and what
would invalidate (stressed indicators returning to Normal, with values).

## 10. Backtest

* Monthly from 1970, same engine, point-in-time percentiles (expanding window, ≥ 5 years), approximate
  publication lags (D 1d, W 7d, M 40d, Q 120d).
* Signal: score ≥ threshold (default 60) for ≥ 2 consecutive months, dated at confirmation.
* Detection: confirmed between 18 months before an NBER peak and the trough. False positive: confirmed signal
  with no recession in that window (signals within 18 months of the end of data are "unresolved").
* Reports detections, false negatives, false positives, lead times, event study (−24…+24 months), phase
  averages and a threshold sensitivity table.
* Limitations: revised (not real-time vintage) data; series availability varies; ~8 recessions only.
  Parameters were fixed a priori; the sensitivity table is for robustness, not for picking the best threshold.

## 11. Historical comparison

Current (last 3 months) vs 2000–01, 2007–09, 2019–20, 2022, 2023–24 — always all five. For each: average
scores, the seven confluence categories and 20 key indicators; "similar" = within 10 points, "different" = the
rest; distance = RMS difference over category scores. No statement that today "is" a past period.
