import type { Metadata } from "next";
import { Badge } from "@/platform/ui/primitives/badge";
import { PageHeader } from "@/platform/ui/shell/page-header";
import { Gallery } from "./Gallery";

export const metadata: Metadata = { title: "Design system", description: "TerminalK design system: tokens, primitives, patterns and templates." };

export default function DesignSystemPage() {
  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        eyebrow="TerminalK"
        title="Design system"
        description="Tokens, primitives, patterns and templates for every TerminalK dashboard. Dark-first, dense by default, accessible (WCAG AA), colour-blind-safe market semantics."
        meta={
          <>
            <Badge tone="accent">v1</Badge>
            <span>Geist · Tailwind v4 · Radix/shadcn · Lightweight Charts · TanStack Table</span>
          </>
        }
      />
      <Gallery />
    </div>
  );
}
