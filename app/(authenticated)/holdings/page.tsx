import React from 'react';
import Link from 'next/link';
import { Card } from '../_components/ui/Card';
import { Badge } from '../_components/ui/Badge';
import { HoldingsList } from './HoldingsList';
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

export default async function HoldingsPage({ searchParams }: HoldingsPageProps) {
  const params = searchParams ?? {};
  const viewMode = params.view === 'per-account' ? 'per-account' : 'consolidated';

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
            href={{ pathname: '/holdings', query: { view: 'per-account' } }}
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
        <HoldingsList
          rows={rows}
          baseCurrency={baseCurrency}
          showRefreshButton
        />
      </Card>
    </div>
  );
}
