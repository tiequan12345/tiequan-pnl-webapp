'use client';

import { useMemo, useState, type ReactNode, useEffect, useRef, useCallback } from 'react';

type SortDirection = 'asc' | 'desc';

export type DataTableColumn<T> = {
  id: string;
  header: ReactNode;
  accessor?: (row: T) => ReactNode | string | number | boolean | null | undefined;
  cell?: (row: T) => ReactNode;
  sortable?: boolean;
  sortFn?: (a: T, b: T) => number;
  align?: 'left' | 'right';
  className?: string;
  headerClassName?: string;
  footer?: ReactNode | ((rows: T[]) => ReactNode);
};

export type GlobalSearch<T> = {
  placeholder?: string;
  filterFn?: (row: T, query: string) => boolean;
  initialQuery?: string;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  keyFn?: (row: T, index: number) => string | number;
  emptyMessage?: string;
  defaultSort?: { columnId: string; direction: SortDirection };
  globalSearch?: GlobalSearch<T>;
  toolbar?: ReactNode;
  rowClassName?: (row: T, index: number) => string;
  stickyHeader?: boolean;
  dense?: boolean;
  tableClassName?: string;
  wrapperClassName?: string;
  enableSelection?: boolean;
  selectedRowIds?: Set<string | number>;
  onSelectionChange?: (selectedIds: Set<string | number>) => void;
};

function stringValue(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  if (Array.isArray(raw)) return raw.map(stringValue).join(' ');
  if (typeof raw === 'object') return JSON.stringify(raw);
  return '';
}

function defaultColumnValue<T>(row: T, column: DataTableColumn<T>): unknown {
  if (column.accessor) return column.accessor(row);
  const direct = (row as Record<string, unknown>)[column.id];
  return direct;
}

function defaultComparator(a: unknown, b: unknown): number {
  const aNum = typeof a === 'number';
  const bNum = typeof b === 'number';
  if (aNum && bNum) return (a as number) - (b as number);
  const aStr = stringValue(a).toLowerCase();
  const bStr = stringValue(b).toLowerCase();
  if (aStr < bStr) return -1;
  if (aStr > bStr) return 1;
  return 0;
}

function applySort<T>(
  rows: T[],
  columns: DataTableColumn<T>[],
  sort: { columnId: string; direction: SortDirection } | null,
): T[] {
  if (!sort) return rows;
  const column = columns.find((col) => col.id === sort.columnId);
  if (!column || !column.sortable) return rows;

  const compareFn =
    column.sortFn ??
    ((a: T, b: T) =>
      defaultComparator(defaultColumnValue(a, column), defaultColumnValue(b, column)));

  const sorted = [...rows].sort(compareFn);
  return sort.direction === 'asc' ? sorted : sorted.reverse();
}

function defaultFilter<T>(row: T, columns: DataTableColumn<T>[], query: string): boolean {
  const haystack = columns
    .map((col) => {
      const value = defaultColumnValue(row, col);
      return stringValue(value);
    })
    .join(' ')
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

export function DataTable<T>({
  columns,
  rows,
  keyFn,
  emptyMessage,
  defaultSort,
  globalSearch,
  toolbar,
  rowClassName,
  stickyHeader = false,
  dense = false,
  tableClassName,
  wrapperClassName,
  enableSelection = false,
  selectedRowIds,
  onSelectionChange,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ columnId: string; direction: SortDirection } | null>(
    defaultSort ?? null,
  );
  const [query, setQuery] = useState(globalSearch?.initialQuery ?? '');
  const checkboxRef = useRef<HTMLInputElement>(null);

  const filteredRows = useMemo(() => {
    if (!globalSearch || !query.trim()) return rows;
    const fn =
      globalSearch.filterFn ??
      ((row: T, q: string) => defaultFilter(row, columns, q));
    return rows.filter((row) => fn(row, query.trim()));
  }, [columns, globalSearch, query, rows]);

  const sortedRows = useMemo(
    () => applySort(filteredRows, columns, sort),
    [filteredRows, columns, sort],
  );

  const handleSortToggle = (column: DataTableColumn<T>) => {
    if (!column.sortable) return;
    setSort((prev) => {
      if (!prev || prev.columnId !== column.id) {
        return { columnId: column.id, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { columnId: column.id, direction: 'desc' };
      }
      return null;
    });
  };

  // Selection Logic
  const visibleKeys = useMemo(() => {
    if (!keyFn) return [];
    return sortedRows.map((row, index) => keyFn(row, index));
  }, [sortedRows, keyFn]);

  const allVisibleSelected =
    visibleKeys.length > 0 &&
    visibleKeys.every((key) => selectedRowIds?.has(key));

  const someVisibleSelected =
    visibleKeys.some((key) => selectedRowIds?.has(key));

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
    }
  }, [someVisibleSelected, allVisibleSelected]);

  const handleSelectAll = () => {
    if (!onSelectionChange) return;
    const newSet = new Set(selectedRowIds);
    if (allVisibleSelected) {
      visibleKeys.forEach((key) => newSet.delete(key));
    } else {
      visibleKeys.forEach((key) => newSet.add(key));
    }
    onSelectionChange(newSet);
  };

  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef<{
    active: boolean;
    startIndex: number;
    startSelection: Set<string | number>;
    shouldSelect: boolean;
  }>({
    active: false,
    startIndex: 0,
    startSelection: new Set(),
    shouldSelect: false, // true = add, false = remove
  });

  // Handle global mouse up to stop dragging
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (dragState.current.active) {
        dragState.current.active = false;
        setIsDragging(false);
        // Remove text selection prevention style
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      document.body.style.userSelect = ''; // Clean up on unmount
    };
  }, []);

  const updateDragSelection = useCallback(
    (currentIndex: number) => {
      if (!onSelectionChange || !dragState.current.active) return;

      const { startIndex, startSelection, shouldSelect } = dragState.current;
      const newSet = new Set(startSelection);

      const start = Math.min(startIndex, currentIndex);
      const end = Math.max(startIndex, currentIndex);

      for (let i = start; i <= end; i++) {
        const rowKey = visibleKeys[i];
        if (shouldSelect) {
          newSet.add(rowKey);
        } else {
          newSet.delete(rowKey);
        }
      }

      onSelectionChange(newSet);
    },
    [onSelectionChange, visibleKeys]
  );

  const handleMouseDown = useCallback(
    (key: string | number, index: number, event: React.MouseEvent) => {
      // Don't toggle if we clicked a button, link, or something inside them
      if ((event.target as HTMLElement).closest('button, a, input[type="checkbox"]')) return;
      if (!onSelectionChange) return;

      // Handle Shift+Click (Range Select) - bypass drag logic
      if (event.shiftKey && lastSelectedIndex !== null) {
        // Prevent text selection
        event.preventDefault();

        const newSet = new Set(selectedRowIds);
        const start = Math.min(index, lastSelectedIndex);
        const end = Math.max(index, lastSelectedIndex);
        const isSelecting = !selectedRowIds?.has(key);

        for (let i = start; i <= end; i++) {
          const rowKey = visibleKeys[i];
          if (isSelecting) {
            newSet.add(rowKey);
          } else {
            newSet.delete(rowKey);
          }
        }
        setLastSelectedIndex(index);
        onSelectionChange(newSet);
        return;
      }

      // Start Drag Logic
      if (event.button === 0) { // Left click only
        // Prevent text selection/highlighting during drag
        /* event.preventDefault(); // Commented out to allow focus events if needed, but usually desirable for drag selection */

        const isSelected = selectedRowIds?.has(key);
        // If it's already selected, we unselect it. If not, we select it.
        // This is the "shouldSelect" state for the entire drag operation.
        const shouldSelect = !isSelected;

        dragState.current = {
          active: true,
          startIndex: index,
          startSelection: new Set(selectedRowIds), // snapshot
          shouldSelect,
        };
        setIsDragging(true);
        setLastSelectedIndex(index);

        // Apply selection to the single row immediately
        updateDragSelection(index);

        // Disable text selection globally while dragging
        document.body.style.userSelect = 'none';
      }
    },
    [lastSelectedIndex, onSelectionChange, selectedRowIds, updateDragSelection, visibleKeys]
  );

  const handleMouseEnter = useCallback(
    (index: number) => {
      if (dragState.current.active) {
        updateDragSelection(index);
      }
    },
    [updateDragSelection]
  );

  return (
    <div className={wrapperClassName}>
      {(toolbar || globalSearch) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex-1">{toolbar}</div>
          {globalSearch ? (
            <div className="w-full max-w-xs">
              <label className="sr-only" htmlFor="data-table-search">
                Search
              </label>
              <input
                id="data-table-search"
                type="search"
                className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-400 focus:outline-none"
                placeholder={globalSearch.placeholder ?? 'Search'}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          ) : null}
        </div>
      )}
      <div className={`overflow-x-auto ${stickyHeader ? 'max-h-[70vh]' : ''}`}>
        <table
          className={`w-full text-left text-sm text-zinc-400 ${tableClassName ?? ''}`}
        >
          <thead
            className={`bg-zinc-900/50 border-b border-zinc-800 text-xs uppercase tracking-wide ${stickyHeader ? 'sticky top-0 z-10' : ''
              }`}
          >
            <tr>
              {enableSelection && (
                <th className={`w-10 px-4 py-3 font-medium ${dense ? 'px-3 py-2' : ''}`}>
                  <input
                    ref={checkboxRef}
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={handleSelectAll}
                    className="rounded border-zinc-700 bg-zinc-800 text-blue-500 focus:ring-blue-500/20 focus:ring-offset-0"
                  />
                </th>
              )}
              {columns.map((column) => {
                const isSorted = sort?.columnId === column.id;
                const sortDir = isSorted ? sort?.direction : null;
                const alignment =
                  column.align === 'right' ? 'text-right' : 'text-left';
                const padding = dense ? 'px-3 py-2' : 'px-4 py-3';
                return (
                  <th
                    key={column.id}
                    className={`${padding} font-medium ${alignment} ${column.headerClassName ?? ''
                      }`}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 text-zinc-300 hover:text-white"
                        onClick={() => handleSortToggle(column)}
                      >
                        <span>{column.header}</span>
                        <span className="text-[10px] leading-none text-zinc-500">
                          {sortDir === 'asc'
                            ? '▲'
                            : sortDir === 'desc'
                              ? '▼'
                              : '↕'}
                        </span>
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {sortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (enableSelection ? 1 : 0)}
                  className="px-4 py-8 text-center text-sm text-zinc-500"
                >
                  {emptyMessage ?? 'No data to display.'}
                </td>
              </tr>
            ) : (
              sortedRows.map((row, index) => {
                const key = keyFn ? keyFn(row, index) : index;
                const padding = dense ? 'px-3 py-2' : 'px-4 py-3';
                const isSelected = selectedRowIds?.has(key);

                return (
                  <tr
                    key={key}
                    className={`
                      relative transition-all duration-150
                      ${isSelected ? 'bg-blue-600/15 ring-1 ring-inset ring-blue-500/30' : 'hover:bg-zinc-800/40'} 
                      ${rowClassName ? rowClassName(row, index) : ''}
                      ${isDragging ? 'cursor-grabbing' : 'cursor-pointer'}
                    `}
                    onMouseDown={enableSelection ? (e) => handleMouseDown(key, index, e) : undefined}
                    onMouseEnter={enableSelection ? () => handleMouseEnter(index) : undefined}
                    // Prevent normal click if we handled it via mousedown (optional, but clean)
                    onClick={undefined}
                  >
                    {enableSelection && (
                      <td className={`w-10 px-4 ${padding}`}>
                        <input
                          type="checkbox"
                          checked={!!isSelected}
                          // Use dummy onChange to avoid "controlled without onChange" warning,
                          // but mostly we control it via the row interaction now.
                          onChange={() => { }}
                          // We also allow direct checkbox clicking, but prevent propagation to row 
                          // so it doesn't trigger row drag logic conflicts if needed.
                          // Actually, we want checkbox to trigger the same logic. 
                          // The row handler ignores inputs, so we need to handle it here explicitly OR remove exclusion.
                          // Let's rely on the INPUT's own interaction.
                          // Actually, standard checkbox needs onClick/onChange. 
                          // If we click Checkbox, handleMouseDown in row returns early.
                          // So we should wire Checkbox to toggle selection simply.
                          onClick={(e) => {
                            if (!onSelectionChange) return;
                            e.stopPropagation();
                            const newSet = new Set(selectedRowIds);
                            if (newSet.has(key)) newSet.delete(key);
                            else newSet.add(key);
                            onSelectionChange(newSet);
                            setLastSelectedIndex(index);
                          }}
                          className="rounded border-zinc-700 bg-zinc-800 text-blue-500 focus:ring-blue-500/20 focus:ring-offset-0 cursor-pointer"
                        />
                      </td>
                    )}
                    {columns.map((column) => {
                      const alignment =
                        column.align === 'right' ? 'text-right' : 'text-left';
                      const cellContent = column.cell
                        ? column.cell(row)
                        : column.accessor
                          ? column.accessor(row)
                          : (row as Record<string, unknown>)[column.id];
                      return (
                        <td
                          key={column.id}
                          className={`${padding} ${alignment} ${column.className ?? ''}`}
                        >
                          {column.cell
                            ? cellContent as ReactNode
                            : typeof cellContent === 'string' || typeof cellContent === 'number'
                              ? String(cellContent)
                              : String(cellContent ?? '')}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
          {columns.some((col) => col.footer) && (
            <tfoot className="border-t border-zinc-700 bg-zinc-900/50 font-medium text-zinc-300">
              <tr>
                {enableSelection && <td className="px-4 py-3" />}
                {columns.map((column) => {
                  const alignment =
                    column.align === 'right' ? 'text-right' : 'text-left';
                  const padding = dense ? 'px-3 py-2' : 'px-4 py-3';

                  return (
                    <td
                      key={column.id}
                      className={`${padding} ${alignment} ${column.className ?? ''}`}
                    >
                      {typeof column.footer === 'function'
                        ? column.footer(sortedRows)
                        : column.footer}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}