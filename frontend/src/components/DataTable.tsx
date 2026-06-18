import type { ReactNode } from "react";
import { flexRender, type SortDirection, type Table } from "@tanstack/react-table";
import { cn } from "../lib/cn";

function SortIcon({ dir }: { dir: SortDirection | false }) {
  return (
    <span className="font-mono text-[10px] leading-none">
      {dir === "asc" ? (
        <span className="text-indigo-600">▲</span>
      ) : dir === "desc" ? (
        <span className="text-indigo-600">▼</span>
      ) : (
        <span className="text-slate-300">↕</span>
      )}
    </span>
  );
}

/** Pure, Tailwind-styled renderer for any @tanstack/react-table instance.
 *  Pages own the table (state, columns, filters); this just paints it. */
export function DataTable<T>({
  table,
  emptyState,
  maxHeight,
}: {
  table: Table<T>;
  emptyState?: ReactNode;
  maxHeight?: string;
}) {
  const rows = table.getRowModel().rows;
  const colCount = table.getAllLeafColumns().length;

  return (
    <div className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
      <table className="w-full border-collapse text-sm">
        <thead
          className={cn(
            "bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500",
            maxHeight && "sticky top-0 z-10",
          )}
        >
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-slate-200">
              {hg.headers.map((header) => {
                const canSort = header.column.getCanSort();
                return (
                  <th key={header.id} className="px-4 py-3 font-medium">
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1.5 rounded transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <SortIcon dir={header.column.getIsSorted()} />
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="px-4 py-14 text-center text-sm text-slate-500">
                {emptyState ?? "No results."}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={row.id}
                className={cn(
                  "transition-colors hover:bg-indigo-50/50",
                  i % 2 === 1 && "bg-slate-50/50",
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 align-top text-slate-700">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
