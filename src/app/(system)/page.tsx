import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { DASHBOARDS } from "@/dashboards/registry";
import { withTimeout, type DashboardManifest, type DashboardSummary } from "@/platform/dashboards";
import { PRODUCT } from "@/platform/product";
import { labelClass, panelClass } from "@/platform/ui/patterns/content";
import { Badge } from "@/platform/ui/primitives/badge";
import { cn } from "@/platform/ui/cn";
import { DASHBOARD_ICONS } from "@/platform/ui/shell/icons";
import { PageHeader } from "@/platform/ui/shell/page-header";

export const dynamic = "force-dynamic";

const TONE: Record<NonNullable<DashboardSummary["tone"]>, string> = {
  good: "text-good-ink",
  neutral: "text-ink",
  warning: "text-warning",
  bad: "text-serious",
};

async function summaryOf(d: DashboardManifest): Promise<DashboardSummary | null> {
  // Never block the home page on a dashboard's first data load.
  return d.summary ? withTimeout(d.summary(), 2500) : null;
}

export default async function Home() {
  const summaries = await Promise.all(DASHBOARDS.map(summaryOf));
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title={PRODUCT.name} description={PRODUCT.description} />
      <div className="grid gap-[var(--gap)] md:grid-cols-2">
        {DASHBOARDS.map((d, i) => {
          const s = summaries[i];
          const Icon = DASHBOARD_ICONS[d.icon ?? "layers"];
          return (
            <Link key={d.id} href={d.basePath} className={cn(panelClass, "group flex flex-col gap-3 p-5 shadow-raised transition-colors hover:border-line-strong")}>
              <div className="flex items-center justify-between gap-2">
                <span className={cn(labelClass, "flex items-center gap-2")}>
                  <Icon className="size-3.5" aria-hidden />
                  {d.region}
                  {d.status === "beta" && <Badge tone="outline">beta</Badge>}
                </span>
                <span className="flex items-center gap-1 text-xs text-accent">
                  Open <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-ink">{d.name}</h2>
                <p className="mt-1 text-[13px] text-ink-2">{d.tagline}</p>
              </div>
              <div className="mt-auto border-t border-line pt-3">
                {s ? (
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className={cn("text-2xl font-semibold tabular-nums tracking-tight", s.tone ? TONE[s.tone] : "text-ink")}>{s.value}</span>
                    <span className="text-[13px] text-ink">{s.label}</span>
                    {s.detail && <span className="text-xs text-muted">{s.detail}</span>}
                    {s.asOf && <span className="text-xs tabular-nums text-muted">as of {s.asOf}</span>}
                  </div>
                ) : (
                  <span className="text-[13px] text-muted">Data loading — open the dashboard for details.</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
      <p className="mt-8 border-t border-line pt-4 text-xs text-muted">
        {PRODUCT.name} · {PRODUCT.tagline}. Analytical tools only; nothing here is investment advice or a recommendation to buy or sell.
      </p>
    </div>
  );
}
