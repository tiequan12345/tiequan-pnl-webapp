'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '../ui/Badge';
import type { HoldingRow } from '@/lib/holdings';
import { DataTable, type DataTableColumn, type GlobalSearch } from '../table/DataTable';

type CurrencyFormatOptions = {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

type HoldingsTableProps = {
  rows: HoldingRow[];
  baseCurrency: string;
  limit?: number;
  emptyMessage?: string;
  showPriceSourceBadges?: boolean;
  priceFormatter?: (value: number, currency: string) => string;
  showRefreshButton?: boolean;
  globalSearch?: GlobalSearch<HoldingRow>;
  toolbar?: ReactNode;
};

function formatCurrencyValue(
  value: number | null | undefined,
  currency: string,
  options?: CurrencyFormatOptions,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'Unpriced';
  }

  const { minimumFractionDigits = 2, maximumFractionDigits = 2 } = options ?? {};
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

const defaultPriceFormatter = (value: number) =>
  value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });

function PriceCell({
  row,
  currency,
  showSourceBadges = true,
  priceFormatter,
  showRefreshButton = false,
  isRefreshing = false,
  onRefresh,
}: {
  row: HoldingRow;
  currency: string;
  showSourceBadges?: boolean;
  priceFormatter?: (value: number, currency: string) => string;
  showRefreshButton?: boolean;
  isRefreshing?: boolean;
  onRefresh?: (assetId: number) => void;
}) {
  const formattedPrice = row.price
    ? priceFormatter
      ? priceFormatter(row.price, currency)
      : defaultPriceFormatter(row.price)
    : 'Unpriced';

  const needsRefresh = showRefreshButton && (!row.price || row.isStale);

  return (
    <div className="flex items-center justify-end gap-2">
      <span className={`text-zinc-200 ${row.price ? '' : 'text-zinc-500'}`}>
        {formattedPrice}
      </span>
      {needsRefresh && onRefresh ? (
        <button
          type="button"
          className="text-xs text-blue-400 hover:text-blue-300 disabled:text-zinc-500"
          disabled={isRefreshing}
          onClick={(event) => {
            event.preventDefault();
            onRefresh(row.assetId);
          }}
        >
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      ) : null}
      {showSourceBadges && row.priceSource ? (
        <Badge type={row.isManual ? 'orange' : 'green'}>
          {row.isManual ? 'Manual' : 'Auto'}
        </Badge>
      ) : null}
      {row.isStale ? <Badge type="red">Stale</Badge> : null}
    </div>
  );
}

export function HoldingsTable({
  rows,
  baseCurrency,
  limit,
  emptyMessage,
  showPriceSourceBadges = true,
  priceFormatter,
  showRefreshButton = false,
  globalSearch,
  toolbar,
}: HoldingsTableProps) {
  const router = useRouter();
  const [refreshingAssetIds, setRefreshingAssetIds] = useState<number[]>([]);

  const handleRefreshAsset = useCallback(
    async (assetId: number) => {
      setRefreshingAssetIds((prev) =>
        prev.includes(assetId) ? prev : [...prev, assetId],
      );

      try {
        const response = await fetch(`/api/prices/refresh/${assetId}`, {
          method: 'POST',
        });
        if (!response.ok) {
          throw new Error('Failed to refresh price.');
        }
        router.refresh();
      } catch (refreshError) {
        console.error('Asset price refresh failed', refreshError);
      } finally {
        setRefreshingAssetIds((prev) => prev.filter((id) => id !== assetId));
      }
    },
    [router],
  );

  const displayedRows =
    limit && limit > 0 ? rows.slice(0, Math.min(rows.length, limit)) : rows;

  const columns: DataTableColumn<HoldingRow>[] = [
    {
      id: 'asset',
      header: 'Asset',
      accessor: (row) => `${row.assetSymbol} ${row.assetName}`,
      cell: (row) => (
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-zinc-800 text-sm font-semibold text-zinc-200 flex items-center justify-center">
            {row.assetSymbol?.[0] ?? ''}
          </div>
          <div>
            <div className="font-semibold text-zinc-200">{row.assetSymbol}</div>
            <div className="text-xs text-zinc-500">{row.assetName}</div>
          </div>
        </div>
      ),
      sortable: true,
    },
    {
      id: 'accountName',
      header: 'Account',
      accessor: (row) => row.accountName,
      cell: (row) => (
        <span className="font-medium text-zinc-200">{row.accountName}</span>
      ),
      sortable: true,
    },
    {
      id: 'quantity',
      header: 'Quantity',
      accessor: (row) => row.quantity,
      cell: (row) => (
        <span className="text-zinc-200">{formatQuantity(row.quantity)}</span>
      ),
      sortable: true,
      sortFn: (a, b) => a.quantity - b.quantity,
      align: 'right',
      className: 'text-right',
    },
    {
      id: 'price',
      header: 'Price',
      accessor: (row) => row.price ?? -Infinity,
      cell: (row) => (
        <PriceCell
          row={row}
          currency={baseCurrency}
          showSourceBadges={showPriceSourceBadges}
          priceFormatter={priceFormatter}
          showRefreshButton={showRefreshButton}
          isRefreshing={refreshingAssetIds.includes(row.assetId)}
          onRefresh={handleRefreshAsset}
        />
      ),
      sortable: true,
      sortFn: (a, b) => (a.price ?? -Infinity) - (b.price ?? -Infinity),
      align: 'right',
      className: 'text-right',
    },
    {
      id: 'marketValue',
      header: 'Market Value',
      accessor: (row) => row.marketValue ?? -Infinity,
      cell: (row) => (
        <span className="text-zinc-200">
          {row.marketValue !== null && row.marketValue !== undefined
            ? formatCurrencyValue(row.marketValue, baseCurrency)
            : 'Unpriced'}
        </span>
      ),
      sortable: true,
      sortFn: (a, b) =>
        (a.marketValue ?? -Infinity) - (b.marketValue ?? -Infinity),
      align: 'right',
      className: 'text-right',
    },
    {
      id: 'assetType',
      header: 'Type',
      accessor: (row) => row.assetType,
      cell: (row) => <Badge type="blue">{row.assetType}</Badge>,
      sortable: true,
    },
    {
      id: 'volatilityBucket',
      header: 'Volatility',
      accessor: (row) => row.volatilityBucket,
      cell: (row) => <span className="text-zinc-400">{row.volatilityBucket}</span>,
      sortable: true,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={displayedRows}
      keyFn={(row) => `${row.assetId}-${row.accountId}`}
      emptyMessage={
        emptyMessage ??
        'No holdings found. Add ledger transactions to see holdings here.'
      }
      defaultSort={{ columnId: 'marketValue', direction: 'desc' }}
      globalSearch={globalSearch}
      rowClassName={() => 'hover:bg-zinc-800/30'}
      toolbar={toolbar}
    />
  );
}
