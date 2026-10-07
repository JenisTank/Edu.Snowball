// ═══════════════════════════════════════════════════════════════════
// BumbleB ERP — STANDARD DATA TABLE (TanStack Table v8) · Neomorphic
// ONE table, ONE set of properties, used across the ENTIRE ERP.
//
// Standard properties:
//   • Titled toolbar          • Global search (right)
//   • Working column Filters  • Column show/hide
//   • Per-column sorting      • Pagination + "Showing X–Y of Z"
//   • CSV export              • Row click · loading · empty states
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react';
import {
  ColumnDef, ColumnFiltersState, flexRender, getCoreRowModel,
  getFilteredRowModel, getPaginationRowModel, getSortedRowModel,
  SortingState, useReactTable, VisibilityState,
} from '@tanstack/react-table';
import {
  ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight,
  Columns3, Download, Search, ListFilter, X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { EmptyState, Skeleton } from '@snowball/ui/components';

interface FilterDef { id: string; label: string }

interface DataTableProps<T> {
  columns: ColumnDef<T, any>[];
  data: T[];
  title?: string;
  isLoading?: boolean;
  searchPlaceholder?: string;
  onRowClick?: (row: T) => void;
  exportName?: string;
  filterable?: FilterDef[]; // columns offered in the Filters panel
}

export function DataTable<T>({
  columns, data, title, isLoading, searchPlaceholder = 'Search…',
  onRowClick, exportName, filterable = [],
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [openPanel, setOpenPanel] = useState<'columns' | 'filters' | null>(null);

  const table = useReactTable({
    data, columns,
    state: { sorting, globalFilter, columnFilters, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  const totalRows = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize } = table.getState().pagination;
  const from = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(totalRows, (pageIndex + 1) * pageSize);
  const activeFilters = columnFilters.length;

  function uniqueValues(colId: string): string[] {
    const set = new Set<string>();
    table.getPreFilteredRowModel().flatRows.forEach(r => {
      const v = r.getValue(colId);
      if (v !== null && v !== undefined && v !== '') set.add(String(v));
    });
    return [...set].sort();
  }

  function exportCSV() {
    const visibleCols = table.getVisibleFlatColumns();
    const header = visibleCols.map(c => (typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id));
    const rows = table.getFilteredRowModel().rows.map(r =>
      visibleCols.map(c => {
        const v = r.getValue(c.id);
        return typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
      }),
    );
    const csv = [header, ...rows].map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${exportName || 'export'}.csv`;
    a.click();
  }

  return (
    <div className="card overflow-visible">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-3">
        {title && (
          <div className="flex items-center gap-2.5 mr-auto">
            <span className="h-2 w-2 rounded-full bg-sky-500 shadow-[0_0_6px_rgba(75,174,208,0.8)]" />
            <h3 className="font-heading text-[15px] font-extrabold">{title}</h3>
          </div>
        )}
        <div className={cn('flex items-center gap-2', !title && 'ml-auto')}>
          {filterable.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setOpenPanel(p => (p === 'filters' ? null : 'filters'))}
                className={cn('btn-neo', activeFilters > 0 && 'text-honey-700 shadow-neo-inset-sm')}
              >
                <ListFilter className="h-4 w-4" /> Filters
                {activeFilters > 0 && (
                  <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-honey-500 px-1 text-[10px] font-bold text-white">
                    {activeFilters}
                  </span>
                )}
              </button>
              {openPanel === 'filters' && (
                <div className="pop absolute right-0 top-full z-30 mt-2 w-60 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-heading text-xs font-extrabold uppercase tracking-wider text-stone-500">Filters</span>
                    {activeFilters > 0 && (
                      <button onClick={() => setColumnFilters([])} className="text-[11px] font-semibold text-honey-600 hover:underline">
                        Clear all
                      </button>
                    )}
                  </div>
                  <div className="space-y-2.5">
                    {filterable.map(f => {
                      const col = table.getColumn(f.id);
                      if (!col) return null;
                      const current = (col.getFilterValue() as string) ?? '';
                      return (
                        <div key={f.id}>
                          <label className="mb-1 block text-[11px] font-semibold text-stone-600">{f.label}</label>
                          <select
                            className="input py-1.5 text-xs"
                            value={current}
                            onChange={e => col.setFilterValue(e.target.value || undefined)}
                          >
                            <option value="">All</option>
                            {uniqueValues(f.id).map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="relative">
            <button onClick={() => setOpenPanel(p => (p === 'columns' ? null : 'columns'))} className="btn-neo">
              <Columns3 className="h-4 w-4" /> Columns
            </button>
            {openPanel === 'columns' && (
              <div className="pop absolute right-0 top-full z-30 mt-2 w-52">
                {table.getAllLeafColumns().map(col => (
                  <label key={col.id} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-white/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={col.getIsVisible()}
                      onChange={col.getToggleVisibilityHandler()}
                      className="accent-honey-500"
                    />
                    {typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id}
                  </label>
                ))}
              </div>
            )}
          </div>

          {exportName && (
            <button onClick={exportCSV} className="btn-neo-icon" title="Export CSV">
              <Download className="h-4 w-4" />
            </button>
          )}

          <div className="relative w-52 lg:w-64">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500 z-10" />
            <input
              className="input pl-9 py-2 text-[12.5px]"
              placeholder={searchPlaceholder}
              value={globalFilter}
              onChange={e => setGlobalFilter(e.target.value)}
            />
            {globalFilter && (
              <button onClick={() => setGlobalFilter('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-700">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto px-2">
        <table className="tbl">
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} className="border-b border-[color:var(--neu-border)]">
                {hg.headers.map(h => (
                  <th
                    key={h.id}
                    className={cn(
                      'px-4 py-3 text-left font-heading font-extrabold text-[11px] uppercase tracking-wider text-stone-600 select-none whitespace-nowrap',
                      h.column.getCanSort() && 'cursor-pointer hover:text-honey-600',
                    )}
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getCanSort() && (
                        h.column.getIsSorted() === 'asc' ? <ArrowUp className="h-3 w-3 text-honey-500" />
                        : h.column.getIsSorted() === 'desc' ? <ArrowDown className="h-3 w-3 text-honey-500" />
                        : <ArrowUpDown className="h-3 w-3 opacity-30" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[color:var(--neu-border)]">
                  {columns.map((_, j) => (
                    <td key={j} className="px-4 py-3.5">
                      <Skeleton height={14} className="!w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-16 text-center">
                  <EmptyState icon="inbox" headline="No records found" description="Try clearing search or filters." />
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  className={cn(
                    'transition-colors',
                    onRowClick ? 'cursor-pointer hover:bg-[color:var(--row-hover)]' : 'hover:bg-[color:var(--row-hover)]',
                  )}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-4 py-3 whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <div className="flex items-center gap-2 text-xs text-stone-600">
          Rows
          <select
            className="rounded-lg bg-cream shadow-neo-inset-sm px-2 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-honey-300"
            value={pageSize}
            onChange={e => table.setPageSize(Number(e.target.value))}
          >
            {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <span className="text-xs text-stone-500 font-medium">
          Showing {from}–{to} of {totalRows}
        </span>

        <div className="flex items-center gap-2">
          <button
            onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}
            className="btn-neo py-1.5 disabled:opacity-40 disabled:pointer-events-none"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Previous
          </button>
          <span className="rounded-lg bg-cream shadow-neo-inset-sm px-3 py-1.5 text-xs font-bold text-stone-700">
            {pageIndex + 1} / {Math.max(1, table.getPageCount())}
          </span>
          <button
            onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}
            className="btn-neo py-1.5 disabled:opacity-40 disabled:pointer-events-none"
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Standard badge used inside tables across the ERP ──
export function Badge({ children, tone = 'stone', dot }: {
  children: React.ReactNode;
  tone?: 'honey' | 'sky' | 'green' | 'red' | 'violet' | 'stone' | 'pink';
  dot?: boolean;
}) {
  const colours: Record<string,string>={honey:'var(--accent)',sky:'var(--info)',green:'var(--ok)',red:'var(--danger)',violet:'var(--violet)',pink:'var(--danger)',stone:'var(--txt2)'};
  const colour=colours[tone]||'var(--txt2)';
  return <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-neu-pill" style={{color:colour,background:`color-mix(in srgb, ${colour} 13%, var(--bg2))`}}>{dot&&<span className="h-1.5 w-1.5 rounded-full bg-current"/>}{children}</span>;
}
