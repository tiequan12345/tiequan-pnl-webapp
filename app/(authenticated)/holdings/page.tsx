import React, { Suspense } from 'react';
import Link from 'next/link';
import { Card } from '../_components/ui/Card';
import { Badge } from '../_components/ui/Badge';
import { HoldingsList } from './HoldingsList';
import { HoldingsFilters } from './HoldingsFilters';
import { PortfolioHero } from '../_components/holdings/PortfolioHero';
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">Holdings</h2>
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

      <PortfolioHero
        summary={displaySummary}
        baseCurrency={baseCurrency}
        priceAutoRefreshIntervalMinutes={settings.priceAutoRefreshIntervalMinutes}
      />

      <HoldingsAllocationCharts
        summary={visibleSummary}
        rows={visibleRows}
        baseCurrency={baseCurrency}
      />

      <Card className="p-0 rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl">
        <HoldingsList
          rows={visibleRows}
          baseCurrency={baseCurrency}
          showRefreshButton
        />
      </Card>
    </div>
  );
}
