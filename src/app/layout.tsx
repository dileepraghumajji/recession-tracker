import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Nav } from "@/dashboards/recession/components/Nav";
import { ThemeToggle } from "@/dashboards/recession/components/ThemeToggle";

export const metadata: Metadata = {
  title: "Macro Recession Stress Monitor",
  description: "Transparent monitor of US macro and financial-market stress. An analytical dashboard, not a recession predictor.",
};

const themeScript = `try{var t=localStorage.getItem("mrsm-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const demo = process.env.DATA_MODE === "demo";
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        {demo && (
          <div role="alert" className="border-b px-4 py-2 text-center text-sm font-semibold" style={{ background: "var(--demo)", color: "#111" }}>
            DEMO MODE — ALL DATA ON THIS SITE IS SYNTHETIC AND NOT REAL. Set DATA_MODE=live to use official data sources.
          </div>
        )}
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="font-mono text-sm font-bold tracking-[0.14em]">
              MACRO RECESSION STRESS MONITOR
            </Link>
            <div className="flex items-center gap-3">
              <Nav />
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-[1400px] px-4 pb-10 pt-4 text-xs leading-relaxed text-muted">
          Analytical decision-support tool. Scores describe how current conditions compare with historical stress patterns; they are not recession
          probabilities or forecasts, and nothing here is investment advice. Data: Federal Reserve Board, BLS, BEA, Census, Chicago Fed, NY Fed, Atlanta
          Fed, EIA and others via FRED; each series lists its source and timestamps.
        </footer>
      </body>
    </html>
  );
}
