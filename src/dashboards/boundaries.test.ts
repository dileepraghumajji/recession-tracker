/**
 * Architecture guard: keeps every dashboard isolated.
 *  - src/platform/** never imports dashboards or app routes.
 *  - src/dashboards/<a>/** never imports another dashboard, the registry or app routes.
 *  - src/app/dashboards/<a>/** and src/app/api/<a>/** only import their own dashboard (plus platform).
 *  - every registered dashboard follows the folder/URL conventions.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DASHBOARDS } from "@/dashboards/registry";

const SRC = path.resolve(import.meta.dirname, "..");
const rel = (p: string) => path.relative(SRC, p).split(path.sep).join("/");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

function importsOf(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const out: string[] = [];
  for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)) out.push(m[1]);
  return out;
}

/** Import specifier → path relative to src/ (null for packages). */
function resolve(file: string, spec: string): string | null {
  if (spec.startsWith("@/")) return spec.slice(2);
  if (spec.startsWith(".")) return rel(path.resolve(path.dirname(file), spec));
  return null;
}

const dashboardDirs = readdirSync(path.join(SRC, "dashboards")).filter((f) => statSync(path.join(SRC, "dashboards", f)).isDirectory());

function owner(r: string): string | null {
  // Route groups like app/(system)/ don't change URLs, so they are transparent here.
  const m = r.match(/^dashboards\/([^/]+)\//) ?? r.match(/^app\/(?:\([^/]+\)\/)?dashboards\/([^/]+)\//) ?? r.match(/^app\/api\/([^/]+)\//);
  return m && dashboardDirs.includes(m[1]) ? m[1] : null;
}

describe("module boundaries", () => {
  const files = walk(SRC);
  const violations: string[] = [];
  for (const f of files) {
    const from = rel(f);
    for (const spec of importsOf(f)) {
      const to = resolve(f, spec);
      if (!to) continue;
      if (from.startsWith("platform/") && (to.startsWith("dashboards/") || to.startsWith("app/"))) violations.push(`${from} -> ${spec}`);
      const a = owner(from);
      if (!a) continue;
      if (to === "dashboards/registry") {
        // Only a dashboard's route layer may look itself up in the registry.
        if (from.startsWith("dashboards/")) violations.push(`${from} -> ${spec}`);
        continue;
      }
      const b = owner(to);
      if (b && b !== a) violations.push(`${from} -> ${spec}`);
      if (from.startsWith("dashboards/") && to.startsWith("app/")) violations.push(`${from} -> ${spec}`);
    }
  }
  it("no cross-dashboard or platform->dashboard imports", () => {
    expect(violations).toEqual([]);
  });
});

/** The dashboard's route folder, inside whichever route group holds it. */
function routeDir(id: string): string {
  const groups = ["", ...readdirSync(path.join(SRC, "app")).filter((f) => /^\(.+\)$/.test(f))];
  for (const g of groups) {
    const dir = path.join(SRC, "app", g, "dashboards", id);
    if (existsSync(dir)) return dir;
  }
  return path.join(SRC, "app", "dashboards", id);
}

describe("dashboard registry", () => {
  it("has unique ids and follows folder/URL conventions", () => {
    const ids = DASHBOARDS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of DASHBOARDS) {
      expect(d.id).toMatch(/^[a-z0-9-]+$/);
      expect(d.basePath).toBe(`/dashboards/${d.id}`);
      expect(d.apiBase).toBe(`/api/${d.id}`);
      expect(existsSync(path.join(SRC, "dashboards", d.id, "manifest.ts"))).toBe(true);
      const dir = routeDir(d.id);
      expect(existsSync(path.join(dir, "layout.tsx"))).toBe(true);
      expect(existsSync(path.join(dir, "page.tsx"))).toBe(true);
      for (const n of d.nav) {
        const page = n.path ? path.join(dir, n.path, "page.tsx") : path.join(dir, "page.tsx");
        expect(existsSync(page), `${d.id} nav "${n.label}" has no page at ${rel(page)}`).toBe(true);
      }
    }
  });
});
