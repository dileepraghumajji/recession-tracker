"use client";
import { Check, Download, LayoutGrid, MoreHorizontal, RotateCcw, Upload } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { cn } from "../cn";
import { Button } from "../primitives/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../primitives/menu";
import { LAYOUT_EVENT } from "./events";
import { defaultLayouts, isValidLayouts, type GridWidget, type Layouts } from "./grid-model";

export type { GridWidget } from "./grid-model";

const GridInteractive = dynamic(() => import("./grid-interactive"), { ssr: false });

const cell = (p: { x: number; y: number; w: number; h: number }) => `${p.x + 1} / span ${p.w}`;
const row = (p: { y: number; h: number }) => `${p.y + 1} / span ${p.h}`;

/**
 * Widget grid. The default layout renders as a plain CSS grid (server-rendered,
 * zero layout JS, container queries for desktop / tablet / stacked). The
 * drag-and-resize engine loads only when the user customises the layout or has
 * a saved one. Layouts are saved per browser (versioned, reset / export / import).
 */
export function DashboardGrid({ gridId, widgets, version = 1 }: { gridId: string; widgets: GridWidget[]; version?: number }) {
  const storageKey = `tk-layout:${gridId}:v${version}`;
  const ids = useMemo(() => widgets.map((w) => w.id), [widgets]);
  const base = useMemo(() => defaultLayouts(widgets), [widgets]);
  const [layouts, setLayouts] = useState<Layouts>(base);
  const [custom, setCustom] = useState(false);
  const [editing, setEditing] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const minSizes = useMemo(() => Object.fromEntries(widgets.map((w) => [w.id, { minW: w.minW, minH: w.minH }])), [widgets]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (isValidLayouts(saved, ids)) {
        setLayouts(saved);
        setCustom(true);
      }
    } catch {
      /* ignore */
    }
  }, [storageKey, ids]);

  const persist = useCallback(
    (l: Layouts) => {
      setLayouts(l);
      setCustom(true);
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
    setCustom(false);
    setEditing(false);
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
      if (j.gridId === gridId && isValidLayouts(j.layouts, ids)) persist(j.layouts);
    } catch {
      /* ignore invalid file */
    }
  };

  const interactive = editing || custom;
  const md = Object.fromEntries(layouts.md.map((l) => [l.i, l]));
  const lg = Object.fromEntries(layouts.lg.map((l) => [l.i, l]));

  return (
    <div className={cn("tk-grid", editing && "tk-grid-editing")}>
      <div className="mb-2 flex items-center justify-end gap-1.5">
        {custom && !editing && <span className="mr-1 text-2xs text-muted">Custom layout</span>}
        <Button variant={editing ? "primary" : "ghost"} size="sm" onClick={() => setEditing((x) => !x)} aria-pressed={editing} className="max-md:hidden">
          {editing ? <Check /> : <LayoutGrid />}
          {editing ? "Done" : "Customize"}
        </Button>
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
      {interactive ? (
        <GridInteractive widgets={widgets} layouts={layouts} editing={editing} onChange={persist} minSizes={minSizes} />
      ) : (
        <div className="tk-static-grid">
          <div className="tk-grid-cells">
            {widgets.map((w) => (
              <div
                key={w.id}
                className="tk-grid-cell"
                style={{ "--lg-col": cell(lg[w.id]), "--lg-row": row(lg[w.id]), "--md-col": cell(md[w.id]), "--md-row": row(md[w.id]) } as CSSProperties}
              >
                {w.node}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
