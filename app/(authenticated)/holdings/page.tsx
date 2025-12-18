import React from 'react';
import Link from 'next/link';
import { Card } from '../_components/ui/Card';
import { Badge } from '../_components/ui/Badge';
import { HoldingsList } from './HoldingsList';
import { HoldingsFilters } from './HoldingsFilters';
import { HoldingsAllocationCharts } from '../_components/charts/HoldingsAllocationCharts';
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
    volatilityBuckets?: string;
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
  const volatilityBuckets = parseStringList(params.volatilityBuckets);

  const [settings, holdings] = await Promise.all([
    getAppSettings(),
    getHoldings({
      accountIds: accountIds.length > 0 ? accountIds : undefined,
      assetTypes: assetTypes.length > 0 ? assetTypes : undefined,
      volatilityBuckets: volatilityBuckets.length > 0 ? volatilityBuckets : undefined,
    }),
  ]);

  const rows =
    viewMode === 'consolidated'
      ? consolidateHoldingsByAsset(holdings.rows)
      : holdings.rows;

  const baseCurrency = settings.baseCurrency;
  const totalValue = holdings.summary.totalValue;
  const lastUpdated = holdings.summary.updatedAt;
  const totalCostBasis = holdings.summary.totalCostBasis;
  const totalUnrealizedPnl = holdings.summary.totalUnrealizedPnl;
  const valuationReady =
    totalCostBasis !== null && totalUnrealizedPnl !== null;
  const pnlPercent =
    valuationReady && totalCostBasis !== 0
      ? (totalUnrealizedPnl / totalCostBasis) * 100
      : null;
  const pnlClass = valuationReady
    ? totalUnrealizedPnl > 0
      ? 'text-emerald-400'
      : totalUnrealizedPnl < 0
        ? 'text-rose-400'
        : 'text-zinc-200'
    : 'text-zinc-500';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Holdings</h2>
      </div>

      <HoldingsFilters
        currentView={viewMode}
        currentAccountIds={accountIds}
        currentAssetTypes={assetTypes}
        currentVolatilityBuckets={volatilityBuckets}
      />

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

        <Card>
          <div className="text-sm text-zinc-400">Valuation</div>
          {valuationReady ? (
            <>
              <div className={`mt-2 text-2xl font-bold ${pnlClass}`}>
                {totalUnrealizedPnl > 0 ? '+' : ''}
                {formatCurrency(totalUnrealizedPnl, baseCurrency)}
                {pnlPercent !== null ? (
                  <span className="text-xs ml-2 text-zinc-400">
                    ({pnlPercent > 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Cost basis: {formatCurrency(totalCostBasis!, baseCurrency)}
              </div>
            </>
          ) : (
            <>
              <div className="mt-2 text-lg text-zinc-500 font-medium">
                Valuation data pending
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Unknown cost basis
              </div>
            </>
          )}
        </Card>
      </div>

      <HoldingsAllocationCharts
        summary={holdings.summary}
        baseCurrency={baseCurrency}
      />

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
