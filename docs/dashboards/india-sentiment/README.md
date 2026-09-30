# India Market Sentiment Terminal (TerminalK dashboard #2, beta)

Pages at `/dashboards/india-sentiment`, API at `/api/india-sentiment/*`. Code in `src/dashboards/india-sentiment/`.

Measures the **sentiment and risk appetite** of Indian financial markets on a 0–100 scale
(0 = extreme fear, 100 = extreme greed) using 16 factor groups. It is a measurement system, **not a prediction
system**: fear does not imply the market will rise and greed does not imply it will fall. It never gives
trading instructions.

## What it shows

| Page | Contents |
|---|---|
| Terminal | Score and band, 1D/1W/1M/3M sentiment momentum, model confidence (with reasons), regime (with the conditions checked), positive/negative contributors, summary and change explanation, answers to the 20 key questions, factor contributions, driver ranking, NIFTY option snapshot, FII/DII, divergences, what changed / why it matters / confirms / contradicts / monitor, data quality. |
| Option Chain | Underlying / expiry / ±5, 10, 15, 25 or all strikes; total call vs put premium, premium & OI PCR and their divergence, max pain, OI concentration zones, IV & 25Δ skew, premium by moneyness, likely buying vs writing, sortable chain table with OI / premium / IV / volume heatmaps and highlights, premium pressure (5m/15m/30m/1h/daily) vs the underlying, expiry structure and positioning shift. |
| Markets & Flows | Momentum table for 16 NSE/BSE indices (returns 1D–12M, 52W high/low distance, 20/50/100/200DMA, slope, trend strength), sector rotation matrix, breadth & internals with thrust and breadth divergence, FII/DII cumulative flows and detections, volatility/INR/bond context, liquidity / credit-stress / global / retail-speculation scores. |
| Factors & Data | Every indicator: value, timestamp, frequency, source, status (LIVE / RECENT / STALE / UNAVAILABLE), score, 1D/1W/1M/3M change, 5/10/15-year percentiles; confidence breakdown. |
| Charts | NIFTY vs sentiment, breadth, FII flows, India VIX, premium pressure, OI PCR, premium PCR, IV skew, USD/INR, 10Y G-Sec, Brent, credit stress; sentiment vs earnings revisions. 1D–MAX. Drawn as two panels on a shared time axis (no dual axes). |
| Analogues & Backtest | Current factor profile vs 2008, 2013, 2015, 2018, 2020, 2022, 2024 episodes (similarities and differences), and forward NIFTY returns by band labelled as historical observations. |
| Alerts | User-configured cross / level / change alerts on sentiment, VIX, flows, breadth, 200DMA, PCRs, skew, INR, G-Sec, crude. None are created automatically. |
| Methodology, Settings & Sources | Model description; weights, thresholds and option parameters (per browser); environment, ingestion docs and per-series status. |

## Data

| Source type | Examples | How it gets in |
|---|---|---|
| Dhan (automatic, when configured) | 16 NSE/BSE indices + India VIX (history since inception and today's price), NIFTY / BANKNIFTY / FINNIFTY option chains, intraday underlying prices | `DHAN_ACCESS_TOKEN` (+ `DHAN_CLIENT_ID`) — see below |
| Market breadth from Dhan stock candles (automatic, when configured) | advances/declines, advancing/declining volume, new 52-week highs/lows, % of stocks above 20/50/100/200-DMA across ~2,600 NSE mainboard stocks | breadth job — see [Market breadth](#market-breadth) |
| Twelve Data (automatic, when configured) | On the free plan: gold spot (XAU/USD) and ETF proxies for the Russell 2000 (IWM), MSCI Emerging Markets (EEM), MSCI World (URTH) and silver (SLV) | `TWELVE_DATA_API_KEY` — see [Twelve Data provider](#twelve-data-provider) |
| FRED (automatic) | USD/INR (Fed H.10), broad dollar, US yields, VIX, HY & EM OAS, S&P 500, Nasdaq, Nikkei, Brent, WTI, natural gas, copper, aluminium, India 10Y & 3M interbank (OECD), India IP, CPI, exports, GDP, reserves | `npm run refresh` / cron |
| Licensed market data | NSE/BSE indices, India VIX, breadth, FII/DII & participant OI, option chains, G-Sec curve (CCIL), corporate spreads, valuation, consensus EPS, global indices not on FRED | a `MarketDataProvider` adapter, or `POST /api/india-sentiment/ingest` |
| BIS policy-rate statistics (automatic) | RBI policy repo rate (`rbi:repo`, from 3 Apr 2001) | official-series job — see [Official releases (RBI, FBIL)](#official-releases-rbi-fbil) |
| Official releases | RBI (call money, liquidity, government cash, CP/CD, credit/deposit, NPA, weekly reserves), G-Sec yields, market USD/INR, AMFI, NSDL/CDSL, SEBI, MOSPI, Ministry of Finance | `POST /api/india-sentiment/ingest` |

### Twelve Data provider

`lib/data/providers/twelvedata.ts`, on the shared client `src/platform/data/twelvedata.ts` (also used by the recession
dashboard). One `/time_series` request (1 credit) per series and refresh: split-adjusted daily closes, up to 5,000
sessions; ETFs are pinned to the NYSE Arca listing and checked for USD, and today's bar is kept only after the 16:00
New York close (for XAU/USD, which trades around the clock, the current UTC day is never kept).
Calls are spaced 8 s apart per process to stay inside the free plan's 8 credits/minute (800/day).

What the free Basic plan covers was checked on 2026-09-30 with the reference endpoints' `show_plan=true` and then
with live requests on a Basic key:

| Series | Filled from | Why |
|---|---|---|
| `gl:RUT` Russell 2000 | IWM (ETF proxy) | Index not in Twelve Data's catalogue |
| `gl:MSCIEM` MSCI Emerging Markets | EEM (ETF proxy) | MSCI indices not in the catalogue |
| `gl:MSCIWORLD` MSCI World | URTH (ETF proxy) | MSCI indices not in the catalogue |
| `cmd:GOLD` Gold | XAU/USD spot | Served on Basic, although the pricing page lists commodities under Grow |
| `cmd:SILVER` Silver | SLV (ETF proxy, LBMA Silver Price) | XAG/USD refused on Basic ("available starting with the Grow plan") |
| `gl:HSI` Hang Seng | not filled | Index and HKEX tracker (2800) need Pro (a Basic key gets "symbol invalid"); no US-listed ETF tracks it |
| `gl:SHCOMP` Shanghai Composite | not filled | Index needs Pro; no ETF tracks it |
| `gl:STOXX600` STOXX Europe 600 | not filled | Index needs Pro, XETRA tracker (EXSA) needs Grow; US Europe ETFs follow other indices |

All eight feed 1- or 3-month return indicators only, so a same-index ETF in the index's own currency (USD) is a
usable proxy; each proxy's series notes say so.

Live check on 2026-09-30 (Basic key): every mapped series loaded (IWM and GLD reach back to 2006-11 at the 5,000-bar
cap, URTH to 2012-01, EEM to 2012-10, XAU/USD to 2008-02). GLD / XAU/USD fell smoothly from 0.0986 to 0.0916 oz per
share over 2008–2026 (GLD's 0.40 % fee), so the ETF data are split-consistent and the spot rate is genuine. SLV's
−28.5 % on 2026-01-30 matches SIVR (−28.6 %), a real move, not a data error. ETFs on a different index (EWH, ASHR, VGK, …) are never substituted.

**Licence:** Twelve Data's pricing page describes the Basic plan as "internal non-display usage" (testing,
evaluation, development; not displayed to users or used in production). Check that your plan's terms allow how the
dashboard is used.

### Dhan provider

`lib/data/providers/` (`dhan-endpoints.ts`, `dhan-client.ts`, `dhan.ts`). DhanHQ v2 at `https://api.dhan.co/v2`
with headers `access-token` and `client-id`. The token has full trading scope, so the code can only reach these
**data** endpoints (a test fails if any order/portfolio/funds path appears in the code):

| Endpoint | Used for | Documented limit → what the app does |
|---|---|---|
| `POST /optionchain/expirylist` | active expiries per underlying | option-chain bucket, cached 6 h |
| `POST /optionchain` | one expiry's chain (OI, previous OI, volume, LTP, previous close, IV, top bid/ask) | 1 unique request / 3 s → requests spaced ≥ 3.1 s; cached 60 s (intraday refreshes always fetch fresh) |
| `POST /marketfeed/ohlc` | today's last price of every index in one call | 1 request / s → spaced 1.05 s; cached 15 s |
| `POST /charts/historical` | daily index closes since inception | data APIs 5 / s, 100,000 / day → spaced 220 ms, stops at 95% of the daily cap; cached 15 min |
| `POST /charts/intraday` | today's 5-minute candles (NIFTY confirms the market traded today; price panel above premium pressure) | same data bucket; cached 60 s |
| `GET /instrument/NSE_FNO` | index-option lot sizes (redirect followed **without** credentials) | once a day |
| `GET /instrument/NSE_EQ` | the stock universe for market breadth (redirect followed without credentials) | once per breadth cycle |

* Full refresh (cron / stale data): all index series plus chains for the current, next, monthly and far expiries.
* Intraday (Mon–Fri 09:15–15:30 IST, every `INDIA_LIVE_REFRESH_SECONDS`, default 180): today's index values and the
  current-expiry chains, which also add intraday premium-pressure points. Open pages pick changes up through the
  live-status poll.
* Dhan reports option volume and OI as quantity, so chains are stored with `volumeUnit: "shares"`.
* Today's value is added only when intraday candles show a session today, so holidays never get a repeated close.
* Rate limiting and caching are per server instance; several serverless instances each respect the limits
  independently, so keep the cron and traffic modest or run one instance.
* **Token state.** Expiry is read from the token's `exp` claim; `DH-901`/`807`–`810` mark it expired/invalid,
  `DH-902`/`806` no Data API subscription, repeated network failures unreachable. In any of these states the
  dashboard switches to **synthetic demo data from a separate in-memory store** (never persisted, never mixed with
  real data, alerts not evaluated), shows a banner on every page, an amber "Synthetic data" status in the top bar
  and the reason on the home card and Settings & Sources. It re-checks every 5 minutes (except for an expired token,
  which needs a new `DHAN_ACCESS_TOKEN` and a restart/redeploy).
* If `api.dhan.co` is blocked by an outbound allow-list, allow `api.dhan.co` (and, for lot sizes,
  `s3.ap-south-1.amazonaws.com`).

### Market breadth

`lib/data/breadth/` (`universe.ts`, `compute.ts`, `job.ts`). Computed by this app from each stock's Dhan daily candles
(`/charts/historical`, which Dhan adjusts for splits and bonuses), so no breadth vendor or scraping is needed.

* **Universe**: NSE mainboard equity shares from the NSE_EQ instrument list: `INSTRUMENT=EQUITY`,
  `INSTRUMENT_TYPE=ES`, `SERIES` EQ, BE or BZ; one per ISIN (~2,600). SME (SM/ST), ETFs, fund units, REITs/InvITs,
  bonds, T-bills and SGBs are excluded.
* **Definitions** (per stock and session): advance/decline/unchanged = close vs the stock's previous close (not counted
  on its first candle); advancing/declining volume = that day's traded quantity of advancing/declining stocks;
  % above N-DMA = close above the simple average of its last N closes, among stocks with ≥ N sessions; new 52-week
  high/low = the day's high/low beyond the stock's highest high/lowest low of the preceding 52 weeks (d−364 … d−1),
  among stocks trading for ≥ 52 weeks.
* **Sessions**: the NIFTY 50 daily candles are the trading calendar (Muhurat sessions included, holidays never
  published). Only the **last completed** session is computed (never today's forming candle). A session is withheld
  when fewer than 100 stocks traded or fewer than 80% of the median of its ±10 neighbouring sessions (incomplete source
  data); the reason is shown on Settings & Sources.
* **Point in time**: each session is published once, with the universe of that day, and never revised. The first
  run reconstructs history from 2011-01-03 using today's listed stocks: companies delisted since are missing
  (survivorship bias, larger further back).
* **Not computed**: traded value in advancing/declining stocks (`breadth:up_value` / `down_value`) is not in daily
  candles and is never estimated; it remains ingestion-only.
* **Job**: ~2,600 requests at Dhan's 5/s take ~10 minutes (the first, full-history run longer), more than one
  serverless call may run, so the work is a resumable cycle. After every chunk of 40 stocks the counters and the
  position are checkpointed together (`india_jobs` table, `db/migrations/003_india_jobs.sql`), and a lease lets
  only one instance work at a time, so a time-out or overlapping cron call never counts a stock twice. Transient
  failures are retried in up to two more passes; if more than 1% of the universe is still missing (or over 5% return
  no data) nothing is published and the next run starts over. Auth/subscription errors stop the run and it resumes
  when the token works again.
* **Schedule**: `vercel.json` calls `/api/cron/india-breadth` four times each morning (23:40, 00:40, 01:40,
  02:40 UTC ≈ 05:10–08:10 IST, before the 09:15 open); each call runs up to ~280 s and continues where the previous
  one stopped. Self-hosted: `npm run breadth` (no time limit), e.g. `40 23 * * * cd /app && npm run breadth`.
  Run `npm run breadth` once locally against the production database to build the history in one go.
  A database is required in practice: with the in-memory store, progress and results are lost on restart.

### Official releases (RBI, FBIL)

Researched on 2026-09-30: for each official series we looked for an API or a CSV/XLSX download whose terms
allow automated download. HTML pages are never scraped and bot protection is never bypassed.

| Series | Official source | Format | Frequency | Automated? |
|---|---|---|---|---|
| `rbi:repo` | [BIS WS_CBPOL `D.IN`](https://data.bis.org/topics/CBPOL/BIS%2CWS_CBPOL%2C1.0/D.IN) (source: Reserve Bank of India) | SDMX-CSV API | daily (business days) | **Yes.** From 3 Apr 2001, when the repo rate became the policy rate (BIS shows the Bank Rate before that; it is not used). BIS allows reuse, including commercial, with the BIS cited. India lags: on 2026-09-30 the last value was for 2026-07-23 |
| `rbi:call_money`, `rbi:system_liquidity` | RBI Money Market Operations (daily press release) | HTML only | daily | No: HTML only; DBIE has no public API |
| `rbi:govt_cash`, `rbi:forex_reserves` | RBI Weekly Statistical Supplement, Tables 1–2 | XLSX/PDF on rbidocs.rbi.org.in | weekly | No: files are served only after a JavaScript bot challenge |
| `rbi:bank_credit_yoy`, `rbi:deposit_yoy`, `rbi:credit_deposit_ratio` | Scheduled Banks' Statement of Position | XLSX on rbidocs.rbi.org.in | fortnightly | No: bot challenge |
| `rbi:cp_3m`, `rbi:cd_3m` | FBIL CP/CD curves; RBI WSS | FBIL web app; rbidocs | daily; fortnightly | No: FBIL display/redistribution needs a paid licence; rbidocs bot challenge |
| `rbi:gnpa` | RBI Financial Stability Report | PDF on rbidocs | half-yearly | No: bot challenge |
| `gsec:2y`, `gsec:5y`, `gsec:10y` | FBIL G-Sec par yield curve; CCIL tenor-wise yields | web apps | daily | No: FBIL licence; CCIL's terms forbid automated collection |
| `fx:USDINR` | FBIL reference rate | web app | daily | No: fee-liable since April 2019, redistribution needs a licence (`fred:DEXINUS` is used meanwhile) |

Also checked: DBIE (data.rbi.org.in) serves data only through an internal API with encrypted, session-keyed
requests (not a public interface); RBI's website terms prohibit caching or framing its content without permission;
the RBI press-release RSS feed carries releases as HTML; data.gov.in's RBI reserves datasets are annual.

**Job** (`lib/data/official.ts`, shared BIS client `src/platform/data/bis.ts`): one request per series. Every row's
frequency, country, unit (`UNIT_MEASURE` 368 = per cent per annum, `UNIT_MULT` 0) is checked; days BIS leaves empty
(`NaN`) stay empty. A response with fewer than 4,000 observations, a value outside 0–20% or a future date is
rejected as a whole and the stored series is kept (the error shows on the series). BIS is authoritative for the
dates it covers; observations ingested for later dates (a newer RBI decision) are kept until BIS reaches them.
Stored exactly as BIS publishes it: values on every calendar day in 2002–03, and the 2019 decisions dated one day
after RBI's announcement (e.g. the 7 Feb 2019 cut appears on 8 Feb). Schedule: `vercel.json` calls
`/api/cron/india-official` daily at 03:20 UTC (08:50 IST); self-hosted: `npm run official`. No lease or
checkpoint is needed: a run is one small, idempotent request.

**NSE is never scraped.** Without a licensed source the Indian-market factors are shown as unavailable, Model
Confidence falls, and the score is withheld when coverage-weighted factor weight is below 35%.

Ingestion (`ADMIN_TOKEN` required, header `x-admin-token`):

```json
{
  "source": "my-script",
  "series": [{ "key": "flow:fii_cash", "observations": [{ "date": "2026-09-30", "value": -1834.2 }] }],
  "optionChains": [{ "underlying": "NIFTY", "spot": 25310.4, "timestamp": "2026-09-30T15:30:00+05:30",
    "volumeUnit": "contracts", "records": [{ "underlying": "NIFTY", "expiry": "2026-10-06", "strike": 25300,
    "type": "CE", "ltp": 142.5, "prevClose": 131, "volume": 812345, "oi": 9123450, "changeInOi": 402150,
    "iv": 11.8, "prevIv": 11.2, "bid": 142.3, "ask": 142.6, "timestamp": "2026-09-30T15:30:00+05:30", "lotSize": 75 }] }]
}
```

Series keys are listed on Settings & Sources (`src/dashboards/india-sentiment/lib/series.ts`). Observations are
merged by date (`"replace": true` replaces a series). Each chain ingestion also stores an intraday pressure point
(vs the previous snapshot of the same day) and updates the derived daily option series (OI PCR, premium PCR,
pressure, writing balance, ATM IV, skew, max-pain distance, later-expiry positioning).

## Model (summary — see the in-app Methodology page)

* ~120 indicators → 0–100 scores (point-in-time percentile over a trailing 10-year window, or fixed anchors) →
  pooled within clusters (correlated indicators count once) → 16 factor scores → master score with a 20%
  single-factor cap. Contributions (points) sum exactly to score − 50.
* **Specified weights sum to 105%** (10+15+10+8+7+10+7+5+5+5+5+4+4+3+4+3). They are kept as given and applied as
  relative weights (e.g. breadth 15/105 ≈ 14.3%). Change them in Settings or with `INDIA_SENTIMENT_CONFIG_OVERRIDES`.
* Bands: 0–20 Extreme Fear · 20–35 Fear · 35–45 Mild Fear · 45–55 Neutral · 55–65 Mild Greed · 65–80 Greed · 80–100 Extreme Greed (configurable).
* Model Confidence: coverage, freshness, core-segment coverage and cross-source agreement.
* Regime classifier, divergence engine, explanation engine, analogues and backtest as described in-app.
* Sector rotation, market internals, IV/skew and expiry positioning are clusters inside Momentum, Breadth,
  Volatility and Derivatives respectively (so they contribute without new top-level weights).

## Configuration

| Variable | Purpose |
|---|---|
| `INDIA_SENTIMENT_CONFIG_OVERRIDES` | JSON overrides: `factorWeights`, `thresholds` (6 cut points), `maxFactorShare`, `percentileYears`, `strikeWindow`, PCR thresholds, `changeExplainThreshold`, `divergenceMovePct`. |
| `ADMIN_TOKEN` | Required for `/api/india-sentiment/ingest`; protects alert writes. |
| `DHAN_ACCESS_TOKEN`, `DHAN_CLIENT_ID` | Dhan market data (server only). Client id defaults to the token's `dhanClientId` claim. |
| `TWELVE_DATA_API_KEY` | Twelve Data: gold spot, silver and global-index ETF proxies (server only; shared with the recession dashboard). |
| `INDIA_LIVE_REFRESH_SECONDS` | Intraday refresh interval while the market may be open (default 180, minimum 60). |

Tables: `db/migrations/002_india_sentiment.sql` and `003_india_jobs.sql` (`india_*`); run `npm run db:migrate` after
upgrading.

## Limitations

* Weights and anchors are judgement-based starting points, not fitted to returns.
* Buying/writing classification uses snapshot price/OI changes; intent is never certain.
* Many Indian releases are monthly/quarterly; they lag fast markets.
* In demo mode everything is synthetic; analogue and backtest results are meaningless there.
