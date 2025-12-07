'use client';

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
};

function formatCurrencyValue(
  value: number | null | undefined,
  currency: string,
  options?: CurrencyFormatOptions,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'Unpriced';
  }

  const { minimumFractionDigits = 0, maximumFractionDigits = 2 } = options ?? {};
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
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
}: {
  row: HoldingRow;
  currency: string;
  showSourceBadges?: boolean;
  priceFormatter?: (value: number, currency: string) => string;
}) {
  if (!row.price) {
    return <span className="text-zinc-500">Unpriced</span>;
  }

  const formattedPrice = priceFormatter
    ? priceFormatter(row.price, currency)
    : defaultPriceFormatter(row.price);

  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-zinc-200">{formattedPrice}</span>
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
}: HoldingsTableProps) {
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
              {emptyMessage ?? 'No holdings found. Add ledger transactions to see holdings here.'}
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
                {row.quantity.toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 8,
                })}
              </td>
              <td className="px-4 py-3 text-right">
                <PriceCell
                  row={row}
                  currency={baseCurrency}
                  showSourceBadges={showPriceSourceBadges}
                  priceFormatter={priceFormatter}
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
