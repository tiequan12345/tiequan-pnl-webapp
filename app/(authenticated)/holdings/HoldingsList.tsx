'use client';

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
  const globalSearch = {
    placeholder: 'Search by asset or account',
    filterFn: (row: HoldingRow, query: string) => {
      const normalized = query.trim().toLowerCase();
      if (!normalized) return true;
      const haystack = `${row.assetSymbol ?? ''} ${row.assetName ?? ''} ${row.accountName ?? ''}`.toLowerCase();
      return haystack.includes(normalized);
    },
  };

  const toolbar = (
    <span className="text-xs text-zinc-500">
      {rows.length === 1 ? '1 holding' : `${rows.length} holdings`}
    </span>
  );

  const emptyMessage =
    'No holdings found. Add ledger transactions to see holdings here.';

  return (
    <HoldingsTable
      rows={rows}
      baseCurrency={baseCurrency}
      showRefreshButton={showRefreshButton}
      globalSearch={globalSearch}
      toolbar={toolbar}
      emptyMessage={emptyMessage}
    />
  );
}
