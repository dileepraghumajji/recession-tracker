import Link from "next/link";
import { NavLinks } from "@/platform/components/NavLinks";
import { ThemeToggle } from "@/platform/components/ThemeToggle";
import { PRODUCT } from "@/platform/product";
import { DASHBOARDS } from "@/dashboards/registry";

/** The current (pre-design-system) product chrome. Replaced by the (system) shell after migration. */
export default function ClassicLayout({ children }: { children: React.ReactNode }) {
  const demo = process.env.DATA_MODE === "demo";
  const links = [{ href: "/", label: "Home", exact: true }, ...DASHBOARDS.map((d) => ({ href: d.basePath, label: d.shortName }))];
  return (
    <div className="flex min-h-screen flex-col">
      {demo && (
        <div role="alert" className="border-b px-4 py-2 text-center text-sm font-semibold" style={{ background: "var(--demo)", color: "#111" }}>
          DEMO MODE — ALL DATA ON THIS SITE IS SYNTHETIC AND NOT REAL. Set DATA_MODE=live to use official data sources.
        </div>
      )}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="font-mono text-sm font-bold tracking-[0.14em]">
            {PRODUCT.name.toUpperCase()}
          </Link>
          <div className="flex items-center gap-3">
            <NavLinks links={links} label="Dashboards" />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-[1400px] px-4 py-4 text-xs text-muted">
          {PRODUCT.name} · {PRODUCT.tagline}. Analytical tools only; nothing here is investment advice or a recommendation to buy or sell.
        </div>
      </footer>
    </div>
  );
}
