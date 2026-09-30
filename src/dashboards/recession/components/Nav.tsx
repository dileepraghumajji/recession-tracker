"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BASE } from "@/dashboards/recession/routes";

const LINKS = [
  [BASE, "Dashboard"],
  [`${BASE}/indicators`, "Indicators"],
  [`${BASE}/rates`, "30Y / Rates"],
  [`${BASE}/methodology`, "How the Score Works"],
  [`${BASE}/history`, "Historical Comparison"],
  [`${BASE}/backtest`, "Backtest"],
  [`${BASE}/alerts`, "Alerts"],
  [`${BASE}/settings`, "Settings & Data"],
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-x-1 gap-y-1 text-[13px]">
      {LINKS.map(([href, label]) => {
        const active = href === BASE ? path === BASE : path.startsWith(href);
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
