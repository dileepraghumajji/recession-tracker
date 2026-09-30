"use client";
import { ResponsiveGridLayout, useContainerWidth, type ResponsiveLayouts } from "react-grid-layout";
import { cn } from "../cn";
import { BREAKPOINTS, COLS, GAP_PX, ROW_PX, type GridWidget, type Layouts } from "./grid-model";

/** react-grid-layout view, loaded only when the user customises or has a saved layout. */
export default function GridInteractive({ widgets, layouts, editing, onChange, minSizes }: { widgets: GridWidget[]; layouts: Layouts; editing: boolean; onChange: (l: Layouts) => void; minSizes: Record<string, { minW?: number; minH?: number }> }) {
  const { width, containerRef, mounted } = useContainerWidth();
  const withMins = {
    lg: layouts.lg.map((l) => ({ ...l, minW: minSizes[l.i]?.minW ?? 3, minH: minSizes[l.i]?.minH ?? 4 })),
    md: layouts.md.map((l) => ({ ...l, minW: Math.min(minSizes[l.i]?.minW ?? 2, 6), minH: minSizes[l.i]?.minH ?? 4 })),
  };
  return (
    <div ref={containerRef}>
      {mounted && width < BREAKPOINTS.md && (
        <div className="flex flex-col gap-3">
          {widgets.map((w) => (
            <div key={w.id}>{w.node}</div>
          ))}
        </div>
      )}
      {mounted && width >= BREAKPOINTS.md && (
        <ResponsiveGridLayout
          width={width}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          layouts={withMins as ResponsiveLayouts<"lg" | "md">}
          rowHeight={ROW_PX}
          margin={[GAP_PX, GAP_PX]}
          containerPadding={[0, 0]}
          dragConfig={{ enabled: editing, handle: ".tk-drag-handle", threshold: 3, bounded: false }}
          resizeConfig={{ enabled: editing, handles: ["se"] }}
          onLayoutChange={(_l, all) => editing && onChange({ lg: [...(all.lg ?? [])], md: [...(all.md ?? [])] } as Layouts)}
        >
          {widgets.map((w) => (
            <div key={w.id} className={cn(editing && "rounded-[10px] ring-1 ring-accent/40")}>
              {w.node}
            </div>
          ))}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}
