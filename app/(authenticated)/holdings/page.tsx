import React from 'react';
import Link from 'next/link';
import { Card } from '../_components/ui/Card';
import { Badge } from '../_components/ui/Badge';
import {
  consolidateHoldingsByAsset,
  getHoldings,
  type HoldingRow,
} from '@/lib/holdings';
import { getAppSettings } from '@/lib/settings';

type HoldingsPageProps = {
  searchParams?: {
    view?: string;
    accountIds?: string;
    assetTypes?: string;
  };
};

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(value);
}

function parseNumberList(value?: string) {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((num) => Number.isFinite(num));
}

function parseStringList(value?: string) {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function PriceCell({ row }: { row: HoldingRow }) {
  if (!row.price) {
    return <span className="text-zinc-500">Unpriced</span>;
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-zinc-200">{row.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</span>
      {row.priceSource ? (
        <Badge type={row.isManual ? 'orange' : 'green'}>
          {row.isManual ? 'Manual' : 'Auto'}
        </Badge>
      ) : null}
      {row.isStale ? <Badge type="red">Stale</Badge> : null}
    </div>
  );
}

export default async function HoldingsPage({ searchParams }: HoldingsPageProps) {
  const params = searchParams ?? {};
  const viewMode = params.view === 'consolidated' ? 'consolidated' : 'per-account';

  const accountIds = parseNumberList(params.accountIds);
  const assetTypes = parseStringList(params.assetTypes);

  const [settings, holdings] = await Promise.all([
    getAppSettings(),
    getHoldings({
      accountIds: accountIds.length > 0 ? accountIds : undefined,
      assetTypes: assetTypes.length > 0 ? assetTypes : undefined,
    }),
  ]);

  const rows =
    viewMode === 'consolidated'
      ? consolidateHoldingsByAsset(holdings.rows)
      : holdings.rows;

  const baseCurrency = settings.baseCurrency;
  const totalValue = holdings.summary.totalValue;
  const lastUpdated = holdings.summary.updatedAt;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Holdings</h2>
        <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
          <Link
            href={{ pathname: '/holdings' }}
            className={`px-3 py-1.5 text-sm rounded-md transition ${
              viewMode === 'per-account'
                ? 'bg-blue-600 text-white'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            Per Account
          </Link>
          <Link
            href={{ pathname: '/holdings', query: { view: 'consolidated' } }}
            className={`px-3 py-1.5 text-sm rounded-md transition ${
              viewMode === 'consolidated'
                ? 'bg-blue-600 text-white'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            Consolidated
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="text-sm text-zinc-400">Total Portfolio Value</div>
          <div className="mt-2 text-3xl font-bold text-white">
            {formatCurrency(totalValue, baseCurrency)}
          </div>
          <div className="mt-1 text-xs text-zinc-500">{baseCurrency}</div>
        </Card>

        <Card>
          <div className="text-sm text-zinc-400">Last Price Update</div>
          {lastUpdated ? (
            <div className="mt-2 text-lg text-white">
              {lastUpdated.toLocaleString()}
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2 text-zinc-300">
              <span>No prices</span>
              <Badge type="orange">Needs update</Badge>
            </div>
          )}
          <div className="mt-1 text-xs text-zinc-500">
            Refresh Interval: {settings.priceAutoRefreshIntervalMinutes} min
          </div>
        </Card>
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
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
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-zinc-500"
                  >
                    No holdings found. Add ledger transactions to see holdings here.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={`${row.assetId}-${row.accountId}`} className="hover:bg-zinc-800/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-sm text-zinc-200 font-semibold">
                          {row.assetSymbol[0]}
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
                      <PriceCell row={row} />
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-200">
                      {row.marketValue !== null
                        ? formatCurrency(row.marketValue, baseCurrency)
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
        </div>
      </Card>
    </div>
  );
}