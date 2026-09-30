# TerminalK architecture

TerminalK is one Next.js (App Router) application that hosts many dashboards. The code is split into a
**shared platform** and **self-contained dashboard modules**; a single registry wires the modules into the
product.

```
                       ┌──────────────────────────── Next.js app ────────────────────────────┐
  browser  ──────────► │ src/app/layout.tsx  (document root: fonts, theme, preferences)       │
                       │ src/app/(system)/layout.tsx → AppShell (server + client islands),    │
                       │   home page, /design-system, /api/live/<id> (polled live status)     │
                       │ src/app/(system)/dashboards/<id>/layout.tsx → DashboardFrame (page   │
                       │                                     tabs on mobile, disclaimer)      │
                       │ src/app/(system)/dashboards/<id>/**/page.tsx  src/app/api/<id>/**    │
                       │                │                                   │                 │
                       │                ▼                                   ▼                 │
                       │ src/dashboards/<id>/  (manifest, lib/engine, lib/data, components)   │
                       │                │  imports only ▼                                     │
                       │ src/platform/  (dashboard contract, UI, charts, http, FRED, db pool, │
                       │                 api auth/rate limit, webhook, time-series maths)     │
                       │                                                                      │
                       │ src/dashboards/registry.ts ──► nav · home page · /api/cron/refresh   │
                       └──────────────────────────────────────────────────────────────────────┘
                                           │                              │
                                     PostgreSQL (tables per dashboard)   FRED / licensed providers
```

## Routing

| Path | Served by |
|---|---|
| `/` | Product home (`src/app/page.tsx`) |
| `/dashboards/recession/*` | Dashboard #1 pages |
| `/api/recession/*` | Dashboard #1 API |
| `/dashboards/india-sentiment/*` | Dashboard #2 pages |
| `/api/india-sentiment/*` | Dashboard #2 API |
| `/api/cron/refresh` | Platform cron: refreshes every registered dashboard |
| `/api/live/<id>` | Cheap live status (data version, last update) polled by open pages |
| `/design-system` | Design-system reference and sample screens |
| `/indicators`, `/rates`, `/api/snapshot`, … | 308 redirects to the recession dashboard (pre-restructure URLs, `next.config.ts`) |

## Shared concerns (handled once)

| Concern | Where |
|---|---|
| Branding, navigation, home page | `src/platform/product.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, driven by `src/dashboards/registry.ts` |
| Consistent page structure | `AppShell` (server-rendered; nav state, drawer, ⌘K menu and preferences are small client islands) and `DashboardFrame` in every dashboard layout |
| Design system | Tokens on `:root` in `src/platform/ui/tokens.css` (mapped to Tailwind in `globals.css`), primitives/patterns/shell in `src/platform/ui`; guide: `.claude/skills/design-system/SKILL.md`, catalogue: `/design-system`, Storybook |
| Theme / density / colour scheme | `data-theme`, `data-density`, `data-market`, `data-sidebar` on `<html>`, set before paint (dark default); display menu and ⌘K |
| Responsive layout | Sidebar becomes a drawer and page tabs below `lg`; container-query widget grid; tables scroll inside panels |
| Live updates | Manifest `live.status()` → `/api/live/<id>`; the top-bar indicator polls while the tab is visible and re-renders the page only when the data version changes |
| Performance | Charts (Recharts `.view` modules, Lightweight Charts) load and render only near the viewport, in idle time |
| Data providers | `src/platform/data/http.ts` (timeouts, retry/backoff on 429/5xx, bounded concurrency, key redaction), `src/platform/data/fred.ts` (one throttle for the whole process) |
| Persistence | `src/platform/data/db.ts` — one pool, TLS config; each dashboard owns its tables and has an in-memory fallback |
| Caching | Each dashboard caches derived data by *data version + config hash* (in-process), recomputed after refresh or ingestion |
| Scheduling | `vercel.json` → `/api/cron/refresh` → `refreshDashboards()` (parallel, isolated failures); `npm run refresh [-- <id>]` for self-hosting; stale-data background refresh via `after()` |
| Error handling | `errorResponse()` logs server-side and returns a generic message; failed upstream fetches keep previous data and are surfaced as data-quality status |
| Loading states | Server-rendered pages; the first load of an empty store waits a bounded time, then renders whatever is available (marked unavailable) while loading continues; the home page never waits more than 2.5 s for a dashboard |
| Security | Secrets only in `process.env`; `checkAdmin` (constant-time) for writes, `checkCron` for the cron; per-IP rate limits; zod validation; security headers in `next.config.ts` |
| Alerts | Each dashboard defines its own rules and store; fired alerts go to the shared `postWebhook` with a `dashboard` field |

## Isolation rules (enforced by `src/dashboards/boundaries.test.ts`)

* `src/platform/**` never imports a dashboard or an app route.
* `src/dashboards/<a>/**` never imports another dashboard, the registry or `src/app`.
* `src/app/dashboards/<a>/**` and `src/app/api/<a>/**` import only their own dashboard (plus platform); only
  route files may look themselves up in the registry.
* Every registered dashboard has `manifest.ts`, a layout and a page for every nav entry, and uses
  `/dashboards/<id>` and `/api/<id>`.

## Dashboards

* [Recession Stress Monitor](dashboards/recession/README.md) — [architecture](dashboards/recession/ARCHITECTURE.md), [methodology](dashboards/recession/METHODOLOGY.md)
* [India Market Sentiment Terminal](dashboards/india-sentiment/README.md)

To add one, follow [CONTRIBUTING.md](../CONTRIBUTING.md).
