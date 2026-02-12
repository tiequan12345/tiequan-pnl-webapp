import React, { Suspense } from 'react';
import { Card } from '../_components/ui/Card';
import { HoldingsList } from './HoldingsList';
import { HoldingsFilters } from './HoldingsFilters';
import { PortfolioHero } from '../_components/holdings/PortfolioHero';
import { HoldingsAllocationCharts } from '../_components/charts/HoldingsAllocationCharts';
import {
  consolidateHoldingsByAsset,
  getHoldings,
  summarizeHoldings,
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
        <h2 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">Holdings</h2>
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

      <div className="flex flex-col lg:flex-row items-stretch gap-4">
        <div className="w-full lg:w-[90%]">
          <PortfolioHero
            summary={displaySummary}
            baseCurrency={baseCurrency}
            priceAutoRefreshIntervalMinutes={settings.priceAutoRefreshIntervalMinutes}
            className="h-full"
          />
        </div>
        <div className="w-full lg:w-[10%] min-w-[160px]">
          <a
            href={`/api/export/holdings${viewMode === 'consolidated' ? '?view=consolidated' : ''}`}
            className="group flex h-full min-h-[120px] flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900/70 to-zinc-950/90 px-4 py-6 text-zinc-200 shadow-lg transition hover:border-emerald-400/40 hover:text-white"
          >
            <span className="flex items-center justify-center w-11 h-11 rounded-full bg-emerald-500/10 text-emerald-300 group-hover:text-emerald-200 group-hover:bg-emerald-500/20 transition">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </span>
            <span className="text-sm font-semibold tracking-wide">Export CSV</span>
            <span className="text-[11px] text-zinc-400 text-center">Full portfolio</span>
          </a>
        </div>
      </div>

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
