"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../cn";

export interface SubNavLink {
  href: string;
  label: string;
  /** Match only this exact path (dashboard overviews). */
  exact?: boolean;
}

/** Horizontally scrolling page tabs for a dashboard (shown where the sidebar is hidden). */
export function SubNav({ links, label, className }: { links: SubNavLink[]; label: string; className?: string }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className={cn("-mx-3 overflow-x-auto px-3 sm:-mx-5 sm:px-5", className)}>
      <ul className="flex w-max gap-1 border-b border-line">
        {links.map(({ href, label: text, exact }) => {
          const active = exact ? path === href : path === href || path.startsWith(href + "/");
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("-mb-px flex h-9 items-center whitespace-nowrap border-b-2 px-2.5 text-[13px] transition-colors", active ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink")}
              >
                {text}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
