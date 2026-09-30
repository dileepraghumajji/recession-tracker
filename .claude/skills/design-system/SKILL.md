---
name: design-system
description: How to build or change any TerminalK UI with the design system (tokens, primitives, patterns, AppShell, charts, live updates). Use whenever you add a dashboard page, widget, chart, table, form or colour, restyle something, or touch src/platform/ui, src/app/(system) or a dashboard's components.
---

# TerminalK design system

Live reference: `/design-system` (tokens, primitives, patterns) and Storybook (`npm run storybook`).
Everything lives in `src/platform/ui`; dashboards import it, never the reverse.

## Non-negotiables

1. **Tokens only.** Colours, radii, shadows, density and motion come from `src/platform/ui/tokens.css`
   (defined on `:root`; Tailwind names in `src/app/globals.css` `@theme`). Never write raw hex, `rgb()`
   or ad-hoc greys in components. Use utilities (`bg-surface`, `text-ink-2`, `border-line`, `text-up-fg`)
   or `var(--token)` in chart props/inline styles.
2. **Semantic colour.** `up`/`down` = market direction; `good`/`warning`/`serious`/`critical` = status;
   `series-1…8` = categorical chart series, in that order, never cycled; `accent` = interaction/brand.
   Direction is never colour-only: pair with ▲/▼, a sign, or a label (`Delta`, `StatusPill`, `Badge`).
3. **No invented data.** Missing values render as `—`/"n/a"/`UNAVAILABLE` (`StatusPill`, `EmptyState`),
   synthetic data is labelled (`Badge tone="warning">SYNTHETIC`), and wording is probabilistic —
   "suggests", "consistent with", "potential" — never "buy/sell" or a forecast.
4. **Server first.** Pages are server components. Add `"use client"` only to the smallest interactive
   island; pass serialisable props. Heavy client code (charts, dialogs, menus, cmdk) loads lazily.
5. **Accessible.** Keyboard-reachable controls, visible focus (global `:focus-visible`), `aria-label`
   on icon buttons, text contrast ≥ 4.5:1 (all text tokens pass), respect reduced motion.
6. **Every dashboard page works on 390 px wide screens**: tables scroll inside their panel
   (`overflow-x-auto`), grids collapse, nothing overflows the viewport.

## Where things go

| Need | Use |
|---|---|
| Page chrome | Nothing: `src/app/(system)/layout.tsx` wraps every route in `AppShell` (sidebar, top bar, ⌘K, display menu, live status, demo banner). |
| Dashboard layout | `src/app/(system)/dashboards/<id>/layout.tsx` → `<DashboardFrame dashboard={getDashboard("<id>")}>` (page tabs below `lg`, disclaimer). |
| Page title row | `PageHeader` (`shell/page-header`) — `title`, `description`, `meta` (as-of, badges), `actions`, `eyebrow`. |
| Widget with header / states | `WidgetShell` (`patterns/widget-shell`) — `title`, `subtitle`, `info`, `status`, `asOf`, `actions`, `loading`, `error`, `empty`, `flush`. |
| Plain panel | `Panel` or `panelClass` + `labelClass` (`patterns/content`). |
| KPI | `StatCard` (value, unit, `delta`, `spark`, `badge`, `footnote`, `loading`). |
| Change value | `Delta` (`goodWhen="down"` for things like VIX, spreads). |
| Data status | `StatusPill` (icon + label) in widgets, `StatusTag` in dense tables. |
| Small static table | `<table className={tableClass}>`; mark numeric cells `className="r"`; wrap in `overflow-x-auto`. |
| Large / sortable table | `DataTable` (TanStack, virtualised above 80 rows, `meta: { numeric, heat, heatColor }` per column). |
| Long text | `className={proseClass}` (paragraphs, h2/h3, lists, code). Links: `linkClass`. |
| Buttons | `Button` (`primary`/`secondary`/`ghost`/`outline`/`danger`, sizes `sm`/`md`/`icon`); on links use `buttonVariants({ size: "sm" })`. Toggle groups: `aria-pressed`. |
| Inputs | `Input`; native `<select>`/number inputs: `className={cn(fieldClass, "w-24")}`; rich select: `Select`; `Segmented`, `Switch`, `Tabs`, `Menu`, `Dialog`, `Tooltip`. |
| Filters | `FilterBar` + `FilterField`, `TimeRangeSelector`. |
| Bars / scales | `CategoryBar` (banded scale with marker), `DivergingBars` (around a centre), `BarList`. |
| Empty / loading | `EmptyState`; `StatSkeleton`, `ChartSkeleton`, `TableSkeleton`, `WidgetSkeleton`. |
| Customisable layout | `DashboardGrid` (`gridId`, widgets with `lg: {x,y,w,h}`) — CSS grid by default, drag/resize on demand. |

## Charts

- **Time series (preferred for new work):** `ChartPanel` (`patterns/chart-panel`, Lightweight Charts):
  stacked `panes` sharing one time axis and crosshair. "A vs B" is always two panes, **never dual y-axes**.
  Series `type: line | area | histogram | baseline`, `color: "series-1"` etc., `format`.
- **Recharts line chart:** `TimeSeriesChart` / `PeriodSelector` (`patterns/time-series-chart`) for
  the existing dashboards. The Recharts code lives in `*.view.tsx` files that are imported lazily;
  keep that split when adding a Recharts chart: a small wrapper renders
  `<InView fallback={<ChartSkeleton height={h} />}>` + `dynamic(() => import("./X.view"), { ssr: false })`.
- Anything heavy that is below the fold: wrap in `InView` (or `useNearViewport`) — it mounts in an idle
  callback inside a transition, which keeps mobile TBT low.
- Reserve the final height in fallbacks so nothing shifts (CLS 0).
- Chart colours: `var(--series-n)`, gridlines `var(--grid)`, axes `var(--axis)`, labels `var(--muted)`.

## Theme, density, preferences

`<html>` attributes set before paint by `PREFERENCES_SCRIPT`: `data-theme` (dark default, via
next-themes), `data-density` (`compact | comfortable | spacious` → `--row-h`, `--control-h`,
`--widget-pad`, `--gap`, `--text-body`), `data-market` (`teal-red | blue-orange` for colour-blind users),
`data-sidebar="collapsed"`. Use `p-[var(--widget-pad)]`, `gap-[var(--gap)]`, `h-[var(--control-h)]`
so density applies. Variants: `sidebar-collapsed:` for shell chrome.

## Live data

A dashboard opts in with `live: { pollSeconds, status }` in its manifest. `status()` must be cheap
(data version + last fetch time; never load all observations). The top-bar `LiveStatus` polls
`/api/live/<id>` while the tab is visible and calls `router.refresh()` only when the version changes;
pages stay server-rendered. Show data freshness in the page too (`asOf`, `StatusPill`).

## Checklist before you finish

- `npm run typecheck && npm test` (includes the module-boundary test).
- `DATA_MODE=demo npm run build && DATA_MODE=demo npm start`; open the page at 1440 px and 390 px,
  dark and light, compact density; no console errors.
- Lighthouse mobile ≥ 90 on the page you touched
  (`npx lighthouse <url> --form-factor=mobile --only-categories=performance,accessibility`).
- No raw colours (`rg -n '#[0-9a-fA-F]{3,6}\b' src/dashboards src/app` should only hit data, not styles).
