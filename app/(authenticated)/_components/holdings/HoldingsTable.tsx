'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '../ui/Badge';
import type { HoldingRow } from '@/lib/holdings';

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
  const showEmptyState = displayedRows.length === 0;

  return (
    <table className="w-full text-left text-sm text-zinc-400">
      <thead className="bg-zinc-900/50 border-b border-zinc-800 text-xs uppercase tracking-wide">
        <tr>
          <th className="px-4 py-3 font-medium">Asset</th>
          <th className="px-4 py-3 font-medium">Account</th>
          <th className="px-4 py-3 font-medium text-right">Quantity</th>
          <th className="px-4 py-3 font-medium text-right">Price</th>
          <th className="px-4 py-3 font-medium text-right">Market Value</th>
          <th className="px-4 py-3 font-medium">Type</th>
          <th className="px-4 py-3 font-medium">Volatility</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-800">
        {showEmptyState ? (
          <tr>
            <td
              colSpan={7}
              className="px-4 py-8 text-center text-sm text-zinc-500"
            >
              {emptyMessage ??
                'No holdings found. Add ledger transactions to see holdings here.'}
            </td>
          </tr>
        ) : (
          displayedRows.map((row) => (
            <tr
              key={`${row.assetId}-${row.accountId}`}
              className="hover:bg-zinc-800/30"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-sm text-zinc-200 font-semibold">
                    {row.assetSymbol?.[0] ?? ''}
                  </div>
                  <div>
                    <div className="text-zinc-200 font-semibold">
                      {row.assetSymbol}
                    </div>
                    <div className="text-xs text-zinc-500">{row.assetName}</div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-zinc-200 font-medium">
                {row.accountName}
              </td>
              <td className="px-4 py-3 text-right text-zinc-200">
                {formatQuantity(row.quantity)}
              </td>
              <td className="px-4 py-3 text-right">
                <PriceCell
                  row={row}
                  currency={baseCurrency}
                  showSourceBadges={showPriceSourceBadges}
                  priceFormatter={priceFormatter}
                  showRefreshButton={showRefreshButton}
                  isRefreshing={refreshingAssetIds.includes(row.assetId)}
                  onRefresh={handleRefreshAsset}
                />
              </td>
              <td className="px-4 py-3 text-right text-zinc-200">
                {row.marketValue !== null
                  ? formatCurrencyValue(row.marketValue, baseCurrency)
                  : 'Unpriced'}
              </td>
              <td className="px-4 py-3">
                <Badge type="blue">{row.assetType}</Badge>
              </td>
              <td className="px-4 py-3 text-zinc-400">
                {row.volatilityBucket}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
