# Contributing

## How to add a new dashboard

A dashboard is a self-contained module. Adding one never requires touching another dashboard.

### 1. Create the module folder

```
src/dashboards/<id>/            # <id> is lowercase-kebab, e.g. "us-options-flow"
  routes.ts                     export const BASE = "/dashboards/<id>"; export const API = "/api/<id>";
  manifest.ts                   the DashboardManifest (see below)
  lib/                          engine, data access, config — anything the dashboard needs
  components/                   dashboard-specific UI
```

Import shared code only from `@/platform/*`. Never import from another dashboard's folder — the
architecture test (`src/dashboards/boundaries.test.ts`) fails the build if you do. If two dashboards need the
same code, move it into `src/platform/` (it must not import any dashboard).

### 2. Write the manifest

```ts
// src/dashboards/<id>/manifest.ts
import type { DashboardManifest } from "@/platform/dashboards";
import { API, BASE } from "./routes";

const dashboard: DashboardManifest = {
  id: "<id>",
  name: "Full Dashboard Name",
  shortName: "Nav Label",
  tagline: "One line for the home page card.",
  description: "Used for the page <meta> description.",
  basePath: BASE,
  apiBase: API,
  region: "India",
  status: "beta",                       // or "live"
  nav: [                                // sub-navigation; paths are relative to basePath
    { path: "", label: "Overview" },
    { path: "details", label: "Details" },
  ],
  disclaimer: "Shown at the bottom of every page of this dashboard.",
  // Optional, server-only hooks (use dynamic imports so the registry stays light):
  async refresh() {
    const { refreshAll } = await import("./lib/data/service");
    const r = await refreshAll();
    return { ok: r.ok.length, failed: r.failed.length, skipped: r.skipped.length, detail: r };
  },
  async summary() {                      // headline on the home page; use cached data only
    return { value: "42 / 100", label: "Headline label", tone: "neutral" };
  },
};
export default dashboard;
```

### 3. Register it — one line

```ts
// src/dashboards/registry.ts
import mine from "./<id>/manifest";
export const DASHBOARDS: DashboardManifest[] = [recession, india, mine];
```

It now appears in the product navigation and on the home page, and `/api/cron/refresh` / `npm run refresh`
refresh it.

### 4. Add the routes (Next.js needs them under `src/app`)

```
src/app/(system)/dashboards/<id>/layout.tsx       ← copy an existing dashboard's layout and change the id
src/app/(system)/dashboards/<id>/page.tsx         ← overview (nav path "")
src/app/(system)/dashboards/<id>/<path>/page.tsx  ← one per nav entry
src/app/api/<id>/…/route.ts                       ← API routes, if any
```

```tsx
// src/app/(system)/dashboards/<id>/layout.tsx
import type { Metadata } from "next";
import { getDashboard } from "@/dashboards/registry";
import { DashboardFrame } from "@/platform/ui/shell/dashboard-frame";

const dashboard = getDashboard("<id>");
export const metadata: Metadata = { title: dashboard.name, description: dashboard.description };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <DashboardFrame dashboard={dashboard}>{children}</DashboardFrame>;
}
```

The `(system)` route group wraps every page in the `AppShell` (sidebar with the dashboard's pages, top bar,
⌘K command menu, display preferences, live-update status, demo-mode banner); `DashboardFrame` adds page tabs on
small screens and the disclaimer footer. Build pages from the design system — see
[`.claude/skills/design-system/SKILL.md`](.claude/skills/design-system/SKILL.md) and `/design-system`.

To get the "Updated 3m ago" indicator and automatic page refresh when data changes, add
`live: { pollSeconds, status }` to the manifest; `status()` must be cheap (data version + last fetch time).

### 5. Storage (if needed)

Add `db/migrations/NNN_<id>.sql` with tables prefixed by the dashboard (e.g. `usopt_…`). Use the shared pool
from `@/platform/data/db` (`pool()`, `databaseConfigured()`), and provide an in-memory fallback so the dashboard
runs without `DATABASE_URL`.

### 6. Check

```bash
npm run typecheck && npm test      # the registry test checks folders, URLs and that every nav entry has a page
DATA_MODE=demo npm run dev         # click through every page
```

## What the platform provides

| Need | Use |
|---|---|
| Page frame, nav, theme, live status | `AppShell` (route group layout), `DashboardFrame`, `PageHeader` (`@/platform/ui/shell/*`) |
| UI primitives and patterns | `@/platform/ui/primitives/*` (Button, Input, Select, Tabs, Menu, Dialog, Tooltip…) and `@/platform/ui/patterns/*` (WidgetShell, StatCard, DataTable, Panel, tableClass, StatusPill…) — catalogue at `/design-system` |
| Charts | `ChartPanel` (stacked panes, Lightweight Charts) or `TimeSeriesChart` / `PeriodSelector` (`@/platform/ui/patterns/time-series-chart`, Recharts, lazily loaded) — single axis; show "A vs B" as stacked panels, never dual axes |
| HTTP with retries/backoff, bounded concurrency, key redaction | `@/platform/data/http` |
| FRED (shared rate limiter) | `@/platform/data/fred` |
| PostgreSQL pool / TLS config | `@/platform/data/db` |
| Admin/cron auth, rate limiting, error responses | `@/platform/api-utils` |
| Alert webhook | `@/platform/data/webhook` |
| Time-series maths (causal) | `@/platform/lib/timeseries` |
| Number/date formatting, shared types (`Obs`, `DataStatus`) | `@/platform/lib/format`, `@/platform/lib/types` |

## Conventions

* Server-only secrets stay in `process.env`; never send them to the client or log them.
* Validate every external payload (zod) and never invent missing values — show them as unavailable.
* Keep engines pure and unit-tested; do I/O in a `data/` layer.
* Commit in small, reviewable steps.
