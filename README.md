# TerminalK

A single product for many market and macro dashboards. Each dashboard is a self-contained module; the shared
shell provides branding, navigation, the home page, theming, data utilities, scheduling and security.

| # | Dashboard | URL | What it does |
|---|---|---|---|
| 1 | **Macro Recession Stress Monitor** | `/dashboards/recession` | Explainable 0–100 US recession, inflation and financial-market stress scores, regime, 30Y Treasury module, backtest. [Docs](docs/dashboards/recession/README.md) |
| 2 | **India Market Sentiment Terminal** (beta) | `/dashboards/india-sentiment` | Multi-factor 0–100 fear/greed read of Indian markets across 16 factor groups, option-chain analytics, divergences, regime, analogues. [Docs](docs/dashboards/india-sentiment/README.md) |

> All dashboards are analytical tools. They describe conditions; they are not forecasts and nothing here is
> investment advice. Unavailable or stale data is labelled as such and never invented.

## Quick start

```bash
npm install
cp .env.example .env.local          # add FRED_API_KEY (free) at minimum
npm run dev                         # http://localhost:3000
```

Without `DATABASE_URL` each dashboard keeps data in memory and loads it on first request.

**Demo mode** — `DATA_MODE=demo npm run dev` generates clearly labelled **synthetic** data for every dashboard so
every page works offline (a banner on every page says so).

### With PostgreSQL

```bash
export DATABASE_URL=postgres://user:pass@localhost:5432/terminalk
npm run db:migrate                   # applies db/migrations/* (each dashboard has its own tables)
npm run refresh                      # initial load of every dashboard; `npm run refresh -- recession` for one
npm run build && npm start
```

## Configuration

Shared variables (see `.env.example` for all of them; secrets are read server-side only):

| Variable | Purpose |
|---|---|
| `DATA_MODE` | `live` (default) or `demo` (synthetic data for UI development). |
| `FRED_API_KEY` | FRED API key, shared by all dashboards (one process-wide rate limiter). |
| `DATABASE_URL`, `DATABASE_SSL`, `DATABASE_CA_CERT` | PostgreSQL connection shared by all dashboards. |
| `CRON_SECRET` | Bearer secret for `/api/cron/refresh`, which refreshes every registered dashboard. |
| `ADMIN_TOKEN` | Protects write endpoints (alerts, licensed-data loading, India data ingestion). |
| `ALERT_WEBHOOK_URL` | HTTPS endpoint that receives JSON when any dashboard's alert fires (payload includes `dashboard`). |
| `CACHE_TTL_SECONDS` | Memory-mode refresh interval (default 3600). |
| `DHAN_ACCESS_TOKEN`, `DHAN_CLIENT_ID` | India dashboard market data from Dhan (read-only data endpoints; see the dashboard README). |
| `TWELVE_DATA_API_KEY` | Twelve Data, shared by all dashboards (one process-wide limiter, free plan: 8 requests/minute): gold spot for both dashboards, the recession Russell 2000 proxy, and India's global ETF proxies and silver. |

Dashboard-specific variables are documented in each dashboard's README.

## Deploying

* **Vercel**: set the env vars, attach Postgres, run `npm run db:migrate` once. `vercel.json` calls
  `/api/cron/refresh` daily at 22:30 UTC; it refreshes every dashboard independently (one failing never blocks another).
  `/api/cron/india-breadth` runs four times each morning to compute India market breadth from Dhan stock candles
  (resumable across calls; see `docs/dashboards/india-sentiment/README.md`), and `/api/cron/india-official` daily at
  03:20 UTC imports the RBI repo rate from the BIS policy-rate statistics.
* **Anywhere else**: `npm run build && npm start`, plus system cron entries for `npm run refresh`, `npm run breadth`
  and `npm run official`.

## Project layout

```
src/
  app/                         Next.js routes only
    layout.tsx                 document root (fonts, theme, preferences)
    (system)/layout.tsx        product shell (AppShell) for every page; (system)/page.tsx is the home page
    (system)/dashboards/<id>/… each dashboard's pages (layout.tsx renders DashboardFrame)
    (system)/design-system     design-system reference
    api/<id>/…                 each dashboard's API
    api/cron/refresh           platform cron → every registered dashboard
    api/live/<id>              live status polled by open pages
  platform/                    shared, dashboard-agnostic code (never imports a dashboard)
    ui/                        design system: tokens, primitives, patterns, shell ([guide](.claude/skills/design-system/SKILL.md))
  dashboards/
    registry.ts                THE list of dashboards (nav, home page, cron)
    recession/                 dashboard #1 module (manifest, lib, components)
    india-sentiment/           dashboard #2 module
db/migrations/                 SQL migrations, tables prefixed per dashboard
docs/                          product architecture + per-dashboard docs
```

* [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — product architecture, shared concerns, routing, isolation rules.
* [`CONTRIBUTING.md`](CONTRIBUTING.md) — **how to add a new dashboard**.

## Development

```bash
npm test          # unit + integration tests, including the module-boundary test
npm run typecheck
```

Tech stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Recharts · PostgreSQL (`pg`) · zod.
