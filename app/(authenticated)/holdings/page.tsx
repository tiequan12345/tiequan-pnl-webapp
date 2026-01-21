import React, { Suspense } from 'react';
import Link from 'next/link';
import { Card } from '../_components/ui/Card';
import { Badge } from '../_components/ui/Badge';
import { HoldingsList } from './HoldingsList';
import { HoldingsFilters } from './HoldingsFilters';
import { HoldingsSummaryCards } from './HoldingsSummaryCards';
import { HoldingsAllocationCharts } from '../_components/charts/HoldingsAllocationCharts';
import {
  consolidateHoldingsByAsset,
  getHoldings,
  summarizeHoldings,
  type HoldingRow,
} from '@/lib/holdings';
import { getAppSettings } from '@/lib/settings';

type HoldingsPageProps = {
  searchParams: Promise<{
    view?: string;
    accountIds?: string;
    assetIds?: string;
    assetTypes?: string;
    volatilityBuckets?: string;
    hideSmall?: string;
  }>;
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

export default async function HoldingsPage(props: HoldingsPageProps) {
  const searchParams = await props.searchParams;
  const params = searchParams ?? {};
  const viewMode = params.view === 'consolidated' ? 'consolidated' : 'per-account';

  const accountIds = parseNumberList(params.accountIds);
  const assetIds = parseNumberList(params.assetIds);
  const assetTypes = parseStringList(params.assetTypes);
  const volatilityBuckets = parseStringList(params.volatilityBuckets);
  const hideSmall = params.hideSmall === '0' || params.hideSmall === 'false' ? false : true;

  const [settings, holdings] = await Promise.all([
    getAppSettings(),
    getHoldings({
      accountIds: accountIds.length > 0 ? accountIds : undefined,
      assetIds: assetIds.length > 0 ? assetIds : undefined,
      assetTypes: assetTypes.length > 0 ? assetTypes : undefined,
      volatilityBuckets: volatilityBuckets.length > 0 ? volatilityBuckets : undefined,
    }),
  ]);

  const rows =
    viewMode === 'consolidated'
      ? consolidateHoldingsByAsset(holdings.rows)
      : holdings.rows;

  const SMALL_VALUE_THRESHOLD = 100;
  const visibleRows = hideSmall
    ? rows.filter((row) => row.marketValue === null || Math.abs(row.marketValue) > SMALL_VALUE_THRESHOLD)
    : rows;
  const visibleSummary = hideSmall ? summarizeHoldings(visibleRows) : holdings.summary;

  // Use the full summary for top-level metrics so "Dust" toggle doesn't skew valuation
  const displaySummary = holdings.summary;

  const baseCurrency = settings.baseCurrency;
  const totalValue = displaySummary.totalValue;
  const lastUpdated = displaySummary.updatedAt;
  const totalCostBasis = displaySummary.totalCostBasis;
  const totalUnrealizedPnl = displaySummary.totalUnrealizedPnl;
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

      <Suspense fallback={null}>
        <HoldingsFilters
          currentView={viewMode}
          currentAccountIds={accountIds}
          currentAssetIds={assetIds}
          currentAssetTypes={assetTypes}
          currentVolatilityBuckets={volatilityBuckets}
          currentHideSmall={hideSmall}
        />
      </Suspense>

      <HoldingsSummaryCards
        summary={displaySummary}
        baseCurrency={baseCurrency}
        priceAutoRefreshIntervalMinutes={settings.priceAutoRefreshIntervalMinutes}
      />

      <HoldingsAllocationCharts
        summary={visibleSummary}
        baseCurrency={baseCurrency}
      />

      <Card className="p-0">
        <HoldingsList
          rows={visibleRows}
          baseCurrency={baseCurrency}
          showRefreshButton
        />
      </Card>
    </div>
  );
}
