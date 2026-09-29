"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "Dashboard"],
  ["/indicators", "Indicators"],
  ["/rates", "30Y / Rates"],
  ["/methodology", "How the Score Works"],
  ["/history", "Historical Comparison"],
  ["/backtest", "Backtest"],
  ["/alerts", "Alerts"],
  ["/settings", "Settings & Data"],
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-x-1 gap-y-1 text-[13px]">
      {LINKS.map(([href, label]) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`rounded px-2 py-1 ${active ? "bg-surface-2 text-ink" : "text-ink-2 hover:text-ink"}`}
            aria-current={active ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
