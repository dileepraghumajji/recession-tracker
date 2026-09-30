import type { ReactNode } from "react";

export interface GridPos {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GridWidget {
  id: string;
  node: ReactNode;
  /** Default placement on the 12-column desktop grid (h in 24px row units). */
  lg: GridPos;
  /** Placement on the 6-column tablet grid (derived when omitted). */
  md?: GridPos;
  minW?: number;
  minH?: number;
}

export type Layouts = { lg: (GridPos & { i: string })[]; md: (GridPos & { i: string })[] };

/** Row unit = 12px row + 12px gap (matches react-grid-layout rowHeight 12, margin 12). */
export const ROW_PX = 12;
export const GAP_PX = 12;
/** Content-width breakpoints (the sidebar is outside the grid container). */
export const BREAKPOINTS = { lg: 960, md: 640 } as const;
export const COLS = { lg: 12, md: 6 } as const;

export function defaultLayouts(widgets: GridWidget[]): Layouts {
  // Tablet: wide widgets span the row, narrow ones pair up two-across, in desktop reading order.
  const ordered = [...widgets].sort((a, b) => a.lg.y - b.lg.y || a.lg.x - b.lg.x);
  let x = 0;
  let y = 0;
  let rowH = 0;
  const md = ordered.map((w) => {
    const width = w.lg.w >= 6 ? 6 : 3;
    if (x + width > 6) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    const pos = w.md ?? { x, y, w: width, h: w.lg.h };
    x += width;
    rowH = Math.max(rowH, pos.h);
    return { i: w.id, ...pos };
  });
  return { lg: widgets.map((w) => ({ i: w.id, ...w.lg })), md };
}

export function isValidLayouts(saved: unknown, ids: string[]): saved is Layouts {
  if (!saved || typeof saved !== "object") return false;
  return (["lg", "md"] as const).every((bp) => {
    const l = (saved as Record<string, unknown>)[bp];
    return Array.isArray(l) && l.length === ids.length && ids.every((id) => l.some((it: { i?: string }) => it?.i === id));
  });
}
