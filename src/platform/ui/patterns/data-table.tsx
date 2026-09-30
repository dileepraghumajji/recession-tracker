"use client";
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type Row, type SortingState } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../cn";
import { EmptyState } from "./empty-state";

export type { ColumnDef } from "@tanstack/react-table";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    align?: "left" | "right" | "center";
    /** Tabular figures + right alignment. */
    numeric?: boolean;
    /** Sequential heat 0..1 for the cell background; colour is a token name. */
    heat?: (row: TData) => number | null;
    heatColor?: "accent" | "up" | "down" | "series-1" | "series-2";
    /** Divider after this column (e.g. between calls and puts). */
    divider?: boolean;
    headerTitle?: string;
  }
}

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  /** Accessible name for the table. */
  label: string;
  getRowId?: (row: T, i: number) => string;
  initialSorting?: SortingState;
  /** Max body height; content scrolls with a sticky header. */
  maxHeight?: number | string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  /** Virtualise when there are more rows than this (default 80). */
  virtualizeAbove?: number;
  empty?: { title: string; description?: ReactNode };
  className?: string;
  /** Row index to scroll into view on mount (e.g. ATM strike). */
  scrollToIndex?: number;
}

function readRowHeight(el: HTMLElement | null): number {
  if (!el) return 32;
  const v = parseFloat(getComputedStyle(el).getPropertyValue("--row-h"));
  return Number.isFinite(v) && v > 0 ? v : 32;
}

/**
 * Data table on TanStack Table: sortable headers (click or Enter/Space),
 * sticky header, density-aware row height, optional heat cells, virtualised
 * rendering for large tables and keyboard row navigation (↑/↓/Home/End/Enter).
 */
export function DataTable<T>({ data, columns, label, getRowId, initialSorting = [], maxHeight = 520, onRowClick, rowClassName, virtualizeAbove = 80, empty, className, scrollToIndex }: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [active, setActive] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [rowH, setRowH] = useState(32);
  useEffect(() => {
    const update = () => setRowH(readRowHeight(scrollRef.current));
    update();
    window.addEventListener("tk-preferences", update);
    return () => window.removeEventListener("tk-preferences", update);
  }, []);

  /** Scroll the table's own container (never the page) so a row is visible. */
  const scrollWithin = (index: number, block: "center" | "nearest") => {
    const box = scrollRef.current;
    const row = box?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (!box || !row) return;
    const header = box.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    const top = row.offsetTop;
    if (block === "center") box.scrollTop = Math.max(0, top - (box.clientHeight - row.offsetHeight) / 2);
    else if (top - header < box.scrollTop) box.scrollTop = top - header;
    else if (top + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top + row.offsetHeight - box.clientHeight;
  };

  const table = useReactTable({ data, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getRowId });
  const rows = table.getRowModel().rows;
  const virtual = rows.length > virtualizeAbove;
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => rowH, overscan: 12, enabled: virtual });
  useEffect(() => {
    virtualizer.measure();
  }, [rowH, virtualizer]);
  useEffect(() => {
    if (scrollToIndex === undefined || scrollToIndex < 0) return;
    if (virtual) virtualizer.scrollToIndex(scrollToIndex, { align: "center" });
    else scrollWithin(scrollToIndex, "center");
    // Only on first render for this dataset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!data.length) return <EmptyState title={empty?.title ?? "No rows"} description={empty?.description} />;

  const items = virtual ? virtualizer.getVirtualItems() : rows.map((_, i) => ({ index: i, start: i * rowH, end: (i + 1) * rowH, size: rowH, key: i }));
  const padTop = virtual && items.length ? items[0].start : 0;
  const padBottom = virtual && items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0;

  const move = (i: number) => {
    const n = Math.max(0, Math.min(rows.length - 1, i));
    setActive(n);
    if (virtual) virtualizer.scrollToIndex(n);
    else scrollWithin(n, "nearest");
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") move(active + 1);
    else if (e.key === "ArrowUp") move(active - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(rows.length - 1);
    else if (e.key === "Enter" && active >= 0 && onRowClick) onRowClick(rows[active].original);
    else return;
    e.preventDefault();
  };
  const align = (m?: { align?: string; numeric?: boolean }) => (m?.align === "center" ? "text-center" : m?.align === "right" || m?.numeric ? "text-right tabular-nums" : "text-left");
  const cellCls = (m?: { divider?: boolean }) => cn("whitespace-nowrap px-2.5 first:pl-3 last:pr-3", m?.divider && "border-r border-line");

  return (
    <div
      ref={scrollRef}
      className={cn("relative overflow-auto outline-none", className)}
      style={{ maxHeight }}
      tabIndex={0}
      role="region"
      aria-label={`${label} (use arrow keys to move between rows)`}
      onKeyDown={onKey}
    >
      <table className="w-full border-separate border-spacing-0 text-[length:var(--text-body)]" aria-rowcount={rows.length + 1}>
        <caption className="sr-only">{label}</caption>
        <thead className="sticky top-0 z-10 bg-surface">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => {
                const m = h.column.columnDef.meta;
                const sorted = h.column.getIsSorted();
                const canSort = h.column.getCanSort();
                return (
                  <th
                    key={h.id}
                    scope="col"
                    title={m?.headerTitle}
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                    className={cn("h-8 border-b border-line text-2xs font-medium uppercase tracking-[0.05em] text-muted", cellCls(m), align(m))}
                  >
                    {canSort ? (
                      <button type="button" onClick={h.column.getToggleSortingHandler()} className={cn("inline-flex items-center gap-1 hover:text-ink", (m?.numeric || m?.align === "right") && "flex-row-reverse")}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sorted === "asc" ? <ArrowUp className="size-3" /> : sorted === "desc" ? <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-40" />}
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {padTop > 0 && (
            <tr aria-hidden>
              <td style={{ height: padTop }} colSpan={columns.length} />
            </tr>
          )}
          {items.map((vi) => {
            const row = rows[vi.index] as Row<T>;
            return (
              <tr
                key={row.id}
                data-index={vi.index}
                aria-rowindex={vi.index + 2}
                aria-selected={vi.index === active || undefined}
                onClick={() => {
                  setActive(vi.index);
                  onRowClick?.(row.original);
                }}
                className={cn("group", onRowClick && "cursor-pointer", rowClassName?.(row.original))}
                style={{ height: rowH }}
              >
                {row.getVisibleCells().map((c) => {
                  const m = c.column.columnDef.meta;
                  const heat = m?.heat?.(row.original);
                  return (
                    <td
                      key={c.id}
                      className={cn(
                        "border-b border-line text-ink transition-colors group-hover:bg-surface-2 group-aria-selected:bg-accent-subtle",
                        cellCls(m),
                        align(m),
                      )}
                      style={heat != null && heat > 0 ? { backgroundColor: `color-mix(in srgb, var(--${m?.heatColor ?? "accent"}) ${Math.round(Math.min(1, heat) * 30)}%, transparent)` } : undefined}
                    >
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {padBottom > 0 && (
            <tr aria-hidden>
              <td style={{ height: padBottom }} colSpan={columns.length} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
