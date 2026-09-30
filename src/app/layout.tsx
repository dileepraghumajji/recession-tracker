import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { NavLinks } from "@/platform/components/NavLinks";
import { ThemeToggle } from "@/platform/components/ThemeToggle";
import { PRODUCT } from "@/platform/product";
import { DASHBOARDS } from "@/dashboards/registry";

export const metadata: Metadata = {
  title: { default: PRODUCT.name, template: `%s · ${PRODUCT.name}` },
  description: PRODUCT.description,
};

// Storage key kept from the original single-dashboard app so saved theme preferences survive.
const themeScript = `try{var t=localStorage.getItem("mrsm-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const demo = process.env.DATA_MODE === "demo";
  const links = [{ href: "/", label: "Home", exact: true }, ...DASHBOARDS.map((d) => ({ href: d.basePath, label: d.shortName }))];
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-screen flex-col">
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
      </body>
    </html>
  );
}
