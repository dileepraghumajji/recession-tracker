"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavLink {
  href: string;
  label: string;
  /** Match only this exact path (dashboard overviews, home). */
  exact?: boolean;
}

/** Horizontal link row with active-state highlighting. Used for product and dashboard navigation. */
export function NavLinks({ links, label, size = "sm" }: { links: NavLink[]; label: string; size?: "sm" | "xs" }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className={`flex flex-wrap gap-x-1 gap-y-1 ${size === "sm" ? "text-[13px]" : "text-[12px]"}`}>
      {links.map(({ href, label: text, exact }) => {
        const active = exact ? path === href : path === href || path.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={`rounded px-2 py-1 ${active ? "bg-surface-2 text-ink" : "text-ink-2 hover:text-ink"}`}
            aria-current={active ? "page" : undefined}
          >
            {text}
          </Link>
        );
      })}
    </nav>
  );
}
