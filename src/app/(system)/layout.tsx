import { DASHBOARDS } from "@/dashboards/registry";
import { AppShell } from "@/platform/ui/shell/app-shell";
import { toNav } from "@/platform/ui/shell/nav-data";

/** New design-system shell. Dashboards move here as they are migrated. */
export default function SystemLayout({ children }: { children: React.ReactNode }) {
  const demo = process.env.DATA_MODE === "demo";
  return (
    <AppShell
      dashboards={toNav(DASHBOARDS)}
      banner={
        demo ? (
          <div role="alert" className="border-b border-line px-4 py-1.5 text-center text-xs font-medium" style={{ background: "color-mix(in srgb, var(--warning) 18%, var(--page))", color: "var(--ink)" }}>
            Demo mode — all data is synthetic and not real.
          </div>
        ) : null
      }
    >
      {children}
    </AppShell>
  );
}
