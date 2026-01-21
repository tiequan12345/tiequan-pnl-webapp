'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '../ui/Badge';
import { usePrivacy } from '../../_contexts/PrivacyContext';
import type { HoldingRow } from '@/lib/holdings';
import { DataTable, type DataTableColumn, type GlobalSearch } from '../table/DataTable';

type CurrencyFormatOptions = {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  fallback?: string;
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
    return options?.fallback ?? 'Unpriced';
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

function formatPnlClass(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'text-zinc-500';
  }
  return value > 0 ? 'text-emerald-400' : value < 0 ? 'text-rose-400' : 'text-zinc-200';
}

function formatPnlValue(
  value: number | null | undefined,
  currency: string,
  options?: CurrencyFormatOptions,
): string {
  const formatted = formatCurrencyValue(value, currency, options);
  if (value && value > 0 && formatted !== (options?.fallback ?? 'Unpriced')) {
    return `+${formatted}`;
  }
  return formatted;
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
  const { isPrivacyMode } = usePrivacy();

  const formattedPrice = row.price
    ? isPrivacyMode
      ? '****'
      : priceFormatter
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
  const { isPrivacyMode } = usePrivacy();
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
        <span className="text-zinc-200">{isPrivacyMode ? '****' : formatQuantity(row.quantity)}</span>
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
            ? (isPrivacyMode ? '****' : formatCurrencyValue(row.marketValue, baseCurrency))
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
      id: 'averageCost',
      header: 'Avg Cost',
      accessor: (row) => row.averageCost ?? -Infinity,
      cell: (row) => (
        <span className="text-zinc-200">
          {isPrivacyMode ? '****' : formatCurrencyValue(row.averageCost, baseCurrency, { fallback: '—' })}
        </span>
      ),
      sortable: true,
      sortFn: (a, b) => (a.averageCost ?? -Infinity) - (b.averageCost ?? -Infinity),
      align: 'right',
      className: 'text-right',
    },
    {
      id: 'totalCostBasis',
      header: 'Cost Basis',
      accessor: (row) => row.totalCostBasis ?? -Infinity,
      cell: (row) => (
        <span className="text-zinc-200">
          {isPrivacyMode ? '****' : formatCurrencyValue(row.totalCostBasis, baseCurrency, { fallback: '—' })}
        </span>
      ),
      sortable: true,
      sortFn: (a, b) => (a.totalCostBasis ?? -Infinity) - (b.totalCostBasis ?? -Infinity),
      align: 'right',
      className: 'text-right',
    },
    {
      id: 'unrealizedPnl',
      header: 'Unrealized PnL',
      accessor: (row) => row.unrealizedPnl ?? -Infinity,
      cell: (row) => (
        <span className={formatPnlClass(row.unrealizedPnl)}>
          {isPrivacyMode ? '****' : formatPnlValue(row.unrealizedPnl, baseCurrency, { fallback: '—' })}
        </span>
      ),
      sortable: true,
      sortFn: (a, b) =>
        (a.unrealizedPnl ?? -Infinity) - (b.unrealizedPnl ?? -Infinity),
      align: 'right',
      className: 'text-right',
    },
    {
      id: 'unrealizedPnlPct',
      header: '%',
      accessor: (row) => row.unrealizedPnlPct ?? -Infinity,
      cell: (row) => {
        if (isPrivacyMode) {
          return <span className={formatPnlClass(row.unrealizedPnlPct)}>****</span>;
        }
        const val = row.unrealizedPnlPct;
        const prefix = val && val > 0 ? '+' : '';
        return (
          <span className={formatPnlClass(val)}>
            {prefix}
            {val !== null && val !== undefined ? `${val.toFixed(2)}%` : '—'}
          </span>
        );
      },
      sortable: true,
      sortFn: (a, b) =>
        (a.unrealizedPnlPct ?? -Infinity) - (b.unrealizedPnlPct ?? -Infinity),
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
