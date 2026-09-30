import Link from "next/link";
import { DASHBOARDS } from "@/dashboards/registry";
import { withTimeout, type DashboardManifest, type DashboardSummary } from "@/platform/dashboards";
import { PRODUCT } from "@/platform/product";

export const dynamic = "force-dynamic";

const TONE: Record<NonNullable<DashboardSummary["tone"]>, string> = {
  good: "var(--good-ink)",
  neutral: "var(--muted)",
  warning: "var(--warning)",
  bad: "var(--serious)",
};

async function summaryOf(d: DashboardManifest): Promise<DashboardSummary | null> {
  // Never block the home page on a dashboard's first data load.
  return d.summary ? withTimeout(d.summary(), 2500) : null;
}

export default async function Home() {
  const summaries = await Promise.all(DASHBOARDS.map(summaryOf));
  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{PRODUCT.name}</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">{PRODUCT.description}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {DASHBOARDS.map((d, i) => {
          const s = summaries[i];
          return (
            <Link key={d.id} href={d.basePath} className="panel flex flex-col gap-3 p-5 transition-colors hover:border-[var(--muted)]">
              <div className="flex items-center justify-between gap-2">
                <span className="panel-title">
                  {d.region} {d.status === "beta" && "· beta"}
                </span>
                <span className="text-xs text-accent">Open →</span>
              </div>
              <div>
                <h2 className="text-lg font-semibold">{d.name}</h2>
                <p className="mt-1 text-sm text-ink-2">{d.tagline}</p>
              </div>
              <div className="mt-auto border-t border-line pt-3">
                {s ? (
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="num text-2xl font-semibold" style={{ color: s.tone ? TONE[s.tone] : undefined }}>
                      {s.value}
                    </span>
                    <span className="text-sm">{s.label}</span>
                    {s.detail && <span className="text-xs text-muted">{s.detail}</span>}
                    {s.asOf && <span className="text-xs text-muted">as of {s.asOf}</span>}
                  </div>
                ) : (
                  <span className="text-sm text-muted">Data loading — open the dashboard for details.</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
