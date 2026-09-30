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
| FRED (automatic) | USD/INR (Fed H.10), broad dollar, US yields, VIX, HY & EM OAS, S&P 500, Nasdaq, Nikkei, Brent, WTI, natural gas, copper, aluminium, India 10Y & 3M interbank (OECD), India IP, CPI, exports, GDP, reserves | `npm run refresh` / cron |
| Licensed market data | NSE/BSE indices, India VIX, breadth, FII/DII & participant OI, option chains, G-Sec curve (CCIL), corporate spreads, valuation, consensus EPS, global indices not on FRED | a `MarketDataProvider` adapter, or `POST /api/india-sentiment/ingest` |
| Official releases | RBI (repo, call money, liquidity, CP/CD, credit/deposit, NPA, reserves), AMFI, NSDL/CDSL, SEBI, MOSPI, Ministry of Finance | `POST /api/india-sentiment/ingest` |

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
| `INDIA_LIVE_REFRESH_SECONDS` | Intraday refresh interval while the market may be open (default 180, minimum 60). |

Tables: `db/migrations/002_india_sentiment.sql` (`india_*`).

## Limitations

* Weights and anchors are judgement-based starting points, not fitted to returns.
* Buying/writing classification uses snapshot price/OI changes; intent is never certain.
* Many Indian releases are monthly/quarterly; they lag fast markets.
* In demo mode everything is synthetic; analogue and backtest results are meaningless there.
