# Recession dashboard architecture

> Paths below are relative to the module `src/dashboards/recession/` (e.g. `src/lib/indicators.ts` → `src/dashboards/recession/lib/indicators.ts`).
> API routes are served under `/api/recession/*` (e.g. `GET /api/snapshot` → `GET /api/recession/snapshot`); pages under `/dashboards/recession/*`.
> Shared pieces (HTTP, FRED client, DB pool, API auth, time-series maths) live in `src/platform/`. See the product [ARCHITECTURE](../../ARCHITECTURE.md).

Macro Recession Stress Monitor is a single Next.js (App Router) application written in TypeScript. The
frontend, API routes, scoring engine and scheduled refresh all live in one codebase; PostgreSQL stores the
raw observations, score snapshots and user alerts.

```
                 ┌───────────────────────────── Next.js app ──────────────────────────────┐
  FRED API  ───► │ providers/fred.ts ─┐                                                    │
  (Fed Board,    │                    │   data/service.ts                                  │
  BLS, BEA,      │ providers/         ├─► refreshAll() ──► data/store.ts ──► PostgreSQL    │
  Census, …)     │   twelvedata.ts ───┘   (retry, rate   (pg or memory)    series_meta     │
  Twelve Data ─► │                         limit, zod                      observations    │
  (optional)     │ /api/manual (licensed ISM data, ADMIN_TOKEN)             score_snapshots│
                 │                                                          alerts         │
                 │                        ┌───────── engine (pure functions) ────────┐     │
                 │  loadPrepared() ─────► │ indicators.ts  → analyze.ts (stress, pctl)│     │
                 │  (cached by data       │ scoring.ts (cluster pooling)              │     │
                 │   version)             │ confluence / regime / rates-module /      │     │
                 │                        │ energy / explain / historical (backtest)  │     │
                 │                        └───────────────────────────────────────────┘     │
                 │  Server components (pages)     API routes (/api/*)     Vercel Cron      │
                 └────────────────────────────────────────────────────────────────────────┘
```

## Layers

| Layer | Files | Responsibility |
|---|---|---|
| Series catalogue | `src/lib/series-catalog.ts` | One entry per upstream call: provider, source id, institution, frequency, units. |
| Indicator catalogue | `src/lib/indicators.ts` | How each displayed indicator is derived (spreads, YoY, Sahm, drawdowns…), its polarity, stress metric, threshold mapping and cluster membership. |
| Model config | `src/lib/model-config.ts` | Category and cluster weights for the three scores, overall mix, bands. Overridable via env (`MODEL_CONFIG_OVERRIDES`) or per-browser cookie (Settings page). |
| Providers | `src/lib/data/providers/*` | FRED (API with key, public CSV fallback), Twelve Data (optional), synthetic (demo only). All responses validated with zod; keys redacted from errors. |
| Store | `src/lib/data/store.ts` | `pgStore` (PostgreSQL) or `memoryStore` (no `DATABASE_URL`). |
| Service | `src/lib/data/service.ts` | Refresh orchestration (bounded concurrency, retries/backoff on 429/5xx), in-process caches keyed by data version + config hash, alert evaluation, webhook. |
| Engine | `src/lib/engine/*` | Pure, deterministic, unit-tested functions. No I/O. |
| API | `src/app/api/*` | JSON endpoints (see below). |
| UI | `src/app/*`, `src/components/*` | Server components render from the snapshot; client components for charts, alerts and the weights editor. |

## Data flow

1. **Refresh** (`/api/cron/refresh`, `npm run refresh`, or lazily on first request) fetches every series
   and replaces its observations (full replace captures revisions), recording `fetched_at`,
   the provider's `last_updated` (FRED API) and any error. Failed fetches keep previous data and are
   surfaced in *Settings → Series retrieval status* and in the data-quality panel.
2. **Prepare**: raw series → derived indicator series (display + stress metric). Done once per data version.
3. **Evaluate** at an as-of date: every indicator is truncated at that date (optionally minus a publication
   lag), its stress computed from point-in-time history, then pooled into clusters, categories and scores.
   The dashboard evaluates "now" plus 52 weekly points for history and 1W/1M/3M deltas.
4. **Historical engine** runs the same evaluation month-by-month since 1970 with publication lags; this
   feeds the backtest, the 5Y/MAX score history and the historical comparison.

## API

| Method & path | Description |
|---|---|
| `GET /api/snapshot[?config=]` | Full current snapshot (scores, contributions, indicators, regime, explanation…). |
| `GET /api/indicators/:id/series?period=1M\|3M\|1Y\|5Y\|MAX` | Display series and point-in-time stress series for charts. |
| `GET /api/score-history` | Monthly point-in-time composite history. |
| `GET /api/backtest?threshold=&sustain=&horizon=&coverage=&score=` | Backtest results. |
| `GET /api/history` | Period comparison. |
| `GET/POST /api/alerts`, `PATCH/DELETE /api/alerts/:id` | User-configured alerts (write-protected when `ADMIN_TOKEN` is set). |
| `GET /api/cron/refresh` | Scheduled refresh; requires `Authorization: Bearer $CRON_SECRET`. |
| `POST /api/manual` | Load licensed proprietary series (ISM). Requires `ADMIN_TOKEN`. |
| `GET /api/status` | Which env vars are configured (booleans only) and per-series fetch status. |

## Scheduling

* **Vercel**: `vercel.json` schedules `/api/cron/refresh` daily at 22:30 UTC (after most US releases and
  the H.15 update). Vercel sends `CRON_SECRET` automatically. Increase frequency on paid plans if desired.
* **Self-hosted**: run `npm run refresh` from cron.
* If a scheduled run is missed, the app triggers a background refresh when data are older than 26 h
  (PostgreSQL) or older than `CACHE_TTL_SECONDS` (memory mode).

## Security

* API keys are read only on the server (`process.env`), never serialised to the client, and redacted from
  error messages. `/api/status` exposes booleans only.
* All external responses are schema-validated (zod) and size-bounded; malformed values are dropped, not coerced.
* Cron endpoint requires a bearer secret (rejected in production if `CRON_SECRET` is unset). Write endpoints
  honour `ADMIN_TOKEN` (constant-time comparison). Expensive endpoints are rate-limited per IP.
* Alert webhooks must be HTTPS. Model overrides from cookies/query strings are parsed defensively (whitelisted keys, bounded numbers).
* No scraping: only documented APIs / download endpoints are used. Proprietary data (ISM, Conference Board,
  GS FCI, forward P/E) are shown as unavailable unless the operator loads licensed data.
* Security headers (`X-Frame-Options`, `nosniff`, `Referrer-Policy`) are set in `next.config.ts`.

## Testing

`npm test` runs unit tests for time-series maths (Sahm Rule, percentiles, YoY, drawdowns), scoring
(cluster pooling, contributions summing to the score, coverage/freshness, override parsing), catalogue
consistency (every cluster populated, no indicator twice in one score) and an integration test that builds a
full snapshot and backtest from synthetic data.
