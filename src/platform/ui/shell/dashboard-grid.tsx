"use client";
import { Check, Download, LayoutGrid, MoreHorizontal, RotateCcw, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ResponsiveGridLayout, useContainerWidth, type Layout, type LayoutItem, type ResponsiveLayouts } from "react-grid-layout";
import { cn } from "../cn";
import { Button } from "../primitives/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../primitives/menu";
import { LAYOUT_EVENT } from "./command-menu";

export interface GridWidget {
  id: string;
  node: ReactNode;
  /** Default placement on the 12-column desktop grid (h in rows of 24px). */
  lg: { x: number; y: number; w: number; h: number };
  /** Placement on the 6-column tablet grid (defaults: full width, same height). */
  md?: { x: number; y: number; w: number; h: number };
  minW?: number;
  minH?: number;
}

const ROW = 24;
// Content width, not viewport: the sidebar takes 240px (56px collapsed).
const BREAKPOINTS = { lg: 960, md: 640 } as const;
const COLS = { lg: 12, md: 6 } as const;
type Bp = keyof typeof BREAKPOINTS;

function defaults(widgets: GridWidget[]): ResponsiveLayouts<Bp> {
  // Tablet: wide widgets span the row, narrow ones pair up two-across, in desktop reading order.
  const ordered = [...widgets].sort((a, b) => a.lg.y - b.lg.y || a.lg.x - b.lg.x);
  let x = 0;
  let y = 0;
  let rowH = 0;
  const md: LayoutItem[] = ordered.map((w) => {
    const width = w.lg.w >= 6 ? 6 : 3;
    if (x + width > 6) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    const pos = w.md ?? { x, y, w: width, h: w.lg.h };
    x += width;
    rowH = Math.max(rowH, pos.h);
    return { i: w.id, ...pos, minW: Math.min(w.minW ?? 2, 6), minH: w.minH ?? 4 };
  });
  return { lg: widgets.map((w) => ({ i: w.id, ...w.lg, minW: w.minW ?? 3, minH: w.minH ?? 4 })), md };
}

function valid(saved: unknown, ids: string[]): saved is ResponsiveLayouts<Bp> {
  if (!saved || typeof saved !== "object") return false;
  return (["lg", "md"] as const).every((bp) => {
    const l = (saved as Record<string, Layout>)[bp];
    return Array.isArray(l) && l.length === ids.length && ids.every((id) => l.some((it) => it.i === id));
  });
}

/**
 * Draggable, resizable widget grid. The default layout reproduces the page's
 * designed layout; customisations are saved per browser (versioned, with
 * export/import). Below the tablet breakpoint widgets stack in a single column.
 */
export function DashboardGrid({ gridId, widgets, version = 1 }: { gridId: string; widgets: GridWidget[]; version?: number }) {
  const storageKey = `tk-layout:${gridId}:v${version}`;
  const ids = useMemo(() => widgets.map((w) => w.id), [widgets]);
  const base = useMemo(() => defaults(widgets), [widgets]);
  const [layouts, setLayouts] = useState<ResponsiveLayouts<Bp>>(base);
  const [editing, setEditing] = useState(false);
  const [customised, setCustomised] = useState(false);
  const { width, containerRef, mounted } = useContainerWidth();
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (valid(saved, ids)) {
        setLayouts(saved);
        setCustomised(true);
      }
    } catch {
      /* ignore */
    }
  }, [storageKey, ids]);

  const persist = useCallback(
    (l: ResponsiveLayouts<Bp>) => {
      setLayouts(l);
      setCustomised(true);
      try {
        localStorage.setItem(storageKey, JSON.stringify(l));
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );
  const reset = useCallback(() => {
    setLayouts(base);
    setCustomised(false);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }, [base, storageKey]);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d === "toggle-edit") setEditing((x) => !x);
      if (d === "reset") reset();
    };
    window.addEventListener(LAYOUT_EVENT, on);
    return () => window.removeEventListener(LAYOUT_EVENT, on);
  }, [reset]);

  const exportLayout = () => {
    const blob = new Blob([JSON.stringify({ gridId, version, layouts }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `terminalk-layout-${gridId}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importLayout = async (f: File) => {
    try {
      const j = JSON.parse(await f.text());
      if (j.gridId === gridId && valid(j.layouts, ids)) persist(j.layouts);
    } catch {
      /* ignore invalid file */
    }
  };

  const stacked = mounted && width < BREAKPOINTS.md;
  return (
    <div className={cn("tk-grid", editing && "tk-grid-editing")}>
      <div className="mb-2 flex items-center justify-end gap-1.5">
        {customised && !editing && <span className="mr-1 text-2xs text-muted">Custom layout</span>}
        {!stacked && (
          <Button variant={editing ? "primary" : "ghost"} size="sm" onClick={() => setEditing((x) => !x)} aria-pressed={editing}>
            {editing ? <Check /> : <LayoutGrid />}
            {editing ? "Done" : "Customize"}
          </Button>
        )}
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Layout options">
              <MoreHorizontal />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem onSelect={reset}>
              <RotateCcw /> Reset to default layout
            </MenuItem>
            <MenuItem onSelect={exportLayout}>
              <Download /> Export layout
            </MenuItem>
            <MenuItem onSelect={() => file.current?.click()}>
              <Upload /> Import layout…
            </MenuItem>
          </MenuContent>
        </Menu>
        <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importLayout(e.target.files[0])} />
      </div>
      <div ref={containerRef}>
        {stacked || !mounted ? (
          <div className="flex flex-col gap-[var(--gap)]">
            {widgets.map((w) => (
              <div key={w.id}>{w.node}</div>
            ))}
          </div>
        ) : (
          <ResponsiveGridLayout
            width={width}
            breakpoints={BREAKPOINTS}
            cols={COLS}
            layouts={layouts}
            rowHeight={ROW - 12}
            margin={[12, 12]}
            containerPadding={[0, 0]}
            dragConfig={{ enabled: editing, handle: ".tk-drag-handle", threshold: 3, bounded: false }}
            resizeConfig={{ enabled: editing, handles: ["se"] }}
            onLayoutChange={(_l, all) => editing && persist(all as ResponsiveLayouts<Bp>)}
          >
            {widgets.map((w) => (
              <div key={w.id} className={cn(editing && "rounded-[10px] ring-1 ring-accent/40")}>
                {w.node}
              </div>
            ))}
          </ResponsiveGridLayout>
        )}
      </div>
    </div>
  );
}
