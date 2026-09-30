# Macro Recession Stress Monitor (TerminalK dashboard #1)

> Served at `/dashboards/recession` (pages) and `/api/recession/*` (API). The old root URLs redirect permanently.
> Product-level setup (install, database, deployment) is in the [main README](../../../README.md).

A professional, transparent dashboard that monitors US macroeconomic and financial-market conditions and
produces explainable 0–100 stress scores:

* **Recession Stress** · **Inflation Stress** · **Financial Market Stress** · **Overall Macro Stress**
* a rule-based **regime classification** (expansion, late-cycle, growth slowdown, recession stress,
  deflationary, stagflationary, financial stress, inflationary overheating)
* **signal confluence** across seven independent recession categories
* a dedicated **30Y Treasury Stress** module that decomposes long-end moves into real yields, breakevens,
  term premium and the expected policy path
* an **explanation engine** (what changed, why it matters, supporting/contradicting evidence, what would
  confirm/invalidate), **configurable alerts**, a point-in-time **backtest** against NBER dates, and a
  **historical comparison** with five fixed reference periods.

> **This is an analytical decision-support tool, not a recession predictor.** Scores measure resemblance to
> historical stress conditions; they are not probabilities. Unavailable or stale data are labelled as such —
> values are never invented.

## Quick start

```bash
npm install
cp .env.example .env.local          # add FRED_API_KEY (free) at minimum
npm run dev                         # http://localhost:3000
```

Without `DATABASE_URL` the app keeps data in memory and fetches from FRED on first request (~20–40 s).

### With PostgreSQL

```bash
export DATABASE_URL=postgres://user:pass@localhost:5432/macro
npm run db:migrate
npm run refresh                      # initial load; schedule this (or the cron route) daily
npm run build && npm start
```

### Demo mode (no network / UI development)

`DATA_MODE=demo npm run dev` generates **synthetic** series so every page can be exercised offline. A
banner on every page and "SYNTHETIC" source labels make this unmistakable. Backtest/comparison results in
demo mode are meaningless (the generator is keyed to NBER dates).

## Configuration

| Variable | Purpose |
|---|---|
| `FRED_API_KEY` | FRED API key (recommended). Without it the public per-series CSV endpoint is used and source "last updated" timestamps are unavailable. |
| `TWELVE_DATA_API_KEY` | Optional: gold spot and Russell 2000 (IWM ETF proxy). |
| `DATABASE_URL`, `DATABASE_SSL` | PostgreSQL connection (`DATABASE_SSL=require` for managed providers). |
| `CRON_SECRET` | Bearer secret for `/api/cron/refresh` (refreshes every dashboard) (required in production). |
| `ADMIN_TOKEN` | Protects alert writes and enables `/api/recession/manual` for licensed data (ISM). |
| `ALERT_WEBHOOK_URL` | HTTPS endpoint that receives JSON when an alert fires. |
| `MODEL_CONFIG_OVERRIDES` | JSON weight overrides, e.g. `{"categoryWeights":{"recession":{"credit_financial":30}},"overall":{"recession":60}}`. |
| `CACHE_TTL_SECONDS` | Memory-mode refresh interval (default 3600). |
| `DATA_MODE` | `live` (default) or `demo` (synthetic). |

Secrets are only read server-side and never sent to the browser. Weights can also be changed per browser in
**Settings**.

## Deploying

* **Vercel**: set the env vars, attach a Postgres database, run `npm run db:migrate` once against it.
  `vercel.json` schedules a daily refresh at 22:30 UTC.
* **Anywhere else**: `npm run build && npm start`, plus a system cron entry for `npm run refresh`.

## Data sources

Official sources via the FRED API wherever possible: Federal Reserve Board (H.15 yields, TIPS, Kim-Wright term
premium, industrial production, SLOOS, delinquencies, debt service, dollar index), BLS (unemployment, payrolls,
earnings, JOLTS, CPI), BEA (GDP, PCE, income, saving), Census (housing, retail sales), Department of Labor
(claims), Chicago Fed (NFCI), NY Fed / Philadelphia Fed (surveys, fed funds), Atlanta Fed (GDPNow), ICE BofA
(credit OAS), Moody's (Baa spread), EIA (energy), IMF (copper), University of Michigan, CBOE (VIX), S&P and
Nasdaq (indices), NAR and Realtor.com (housing).

Not available from a free, licensed API and therefore shown as **unavailable** (never estimated): ISM PMIs
(can be loaded via `/api/recession/manual` with a licence), Conference Board confidence, Goldman Sachs FCI, S&P forward
P/E / earnings yield, market breadth, financial-sector credit spreads, NY Fed auto delinquencies. Each
indicator page lists source, series id, frequency, last observation, source update time and retrieval time.

## Documentation

* [`ARCHITECTURE.md`](ARCHITECTURE.md) — components, data flow, API, scheduling, security.
* [`METHODOLOGY.md`](METHODOLOGY.md) — stress mapping, thresholds, clustering, weights, regimes,
  backtest design and limitations.
* In-app: **How the Score Works** shows the live contribution of every indicator.

## Development

```bash
npm test          # unit + integration tests (vitest)
npm run typecheck
```

Tech stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Recharts · PostgreSQL (`pg`) · zod.
