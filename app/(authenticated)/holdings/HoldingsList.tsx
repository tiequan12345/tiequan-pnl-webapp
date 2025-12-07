'use client';

import { useMemo, useState } from 'react';
import { HoldingsTable } from '../_components/holdings/HoldingsTable';
import type { HoldingRow } from '@/lib/holdings';

type HoldingsListProps = {
  rows: HoldingRow[];
  baseCurrency: string;
  showRefreshButton?: boolean;
};

export function HoldingsList({
  rows,
  baseCurrency,
  showRefreshButton = false,
}: HoldingsListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const normalizedQuery = searchTerm.trim().toLowerCase();

  const filteredRows = useMemo(() => {
    if (!normalizedQuery) {
      return rows;
    }
    return rows.filter((row) => {
      const haystack = `${row.assetSymbol ?? ''} ${row.assetName ?? ''}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [rows, normalizedQuery]);

  const emptyMessage = searchTerm
    ? 'No assets match your search.'
    : 'No holdings found. Add ledger transactions to see holdings here.';

  return (
    <>
      <div className="px-4 py-4 border-b border-zinc-800">
        <label
          htmlFor="holdings-search"
          className="text-xs font-semibold uppercase tracking-wider text-zinc-400"
        >
          Search assets
        </label>
        <div className="mt-2 flex items-center gap-2">
          <input
            id="holdings-search"
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="e.g. BTC, Apple"
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none"
          />
          <span className="text-xs text-zinc-500">
            Showing {filteredRows.length} of {rows.length}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <HoldingsTable
          rows={filteredRows}
          baseCurrency={baseCurrency}
          emptyMessage={emptyMessage}
          showRefreshButton={showRefreshButton}
        />
      </div>
    </>
  );
}
