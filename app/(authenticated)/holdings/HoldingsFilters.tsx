'use client';

import Link from 'next/link';
import { ASSET_TYPES, VOLATILITY_BUCKETS } from '../assets/AssetForm';

type HoldingsFiltersProps = {
  currentView?: string;
  currentAssetTypes?: string[];
  currentVolatilityBuckets?: string[];
};

export function HoldingsFilters({
  currentView = 'consolidated',
  currentAssetTypes = [],
  currentVolatilityBuckets = [],
}: HoldingsFiltersProps) {
  const buildUrl = (updates: {
    view?: string;
    assetTypes?: string[];
    volatilityBuckets?: string[];
  }) => {
    const params = new URLSearchParams();
    
    if (updates.view && updates.view !== 'consolidated') {
      params.set('view', updates.view);
    }
    
    if (updates.assetTypes && updates.assetTypes.length > 0) {
      params.set('assetTypes', updates.assetTypes.join(','));
    }
    
    if (updates.volatilityBuckets && updates.volatilityBuckets.length > 0) {
      params.set('volatilityBuckets', updates.volatilityBuckets.join(','));
    }
    
    const queryString = params.toString();
    return queryString ? `/holdings?${queryString}` : '/holdings';
  };

  const toggleAssetType = (assetType: string) => {
    const newAssetTypes = currentAssetTypes.includes(assetType)
      ? currentAssetTypes.filter(t => t !== assetType)
      : [...currentAssetTypes, assetType];
    
    return buildUrl({
      view: currentView,
      assetTypes: newAssetTypes,
      volatilityBuckets: currentVolatilityBuckets,
    });
  };

  const toggleVolatilityBucket = (volatilityBucket: string) => {
    const newVolatilityBuckets = currentVolatilityBuckets.includes(volatilityBucket)
      ? currentVolatilityBuckets.filter(v => v !== volatilityBucket)
      : [...currentVolatilityBuckets, volatilityBucket];
    
    return buildUrl({
      view: currentView,
      assetTypes: currentAssetTypes,
      volatilityBuckets: newVolatilityBuckets,
    });
  };

  return (
    <div className="space-y-4">
      {/* View Toggle */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-zinc-400">View:</span>
        <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
          <Link
            href={buildUrl({ view: 'per-account', assetTypes: currentAssetTypes, volatilityBuckets: currentVolatilityBuckets })}
            className={`px-3 py-1.5 text-sm rounded-md transition ${
              currentView === 'per-account'
                ? 'bg-blue-600 text-white'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            Per Account
          </Link>
          <Link
            href={buildUrl({ view: 'consolidated', assetTypes: currentAssetTypes, volatilityBuckets: currentVolatilityBuckets })}
            className={`px-3 py-1.5 text-sm rounded-md transition ${
              currentView === 'consolidated'
                ? 'bg-blue-600 text-white'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            Consolidated
          </Link>
        </div>
      </div>

      {/* Asset Type Filter */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-zinc-400">Type:</span>
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildUrl({ view: currentView, assetTypes: [], volatilityBuckets: currentVolatilityBuckets })}
            className={`px-3 py-1.5 text-sm rounded-md transition ${
              currentAssetTypes.length === 0
                ? 'bg-blue-600 text-white'
                : 'text-zinc-300 hover:text-white border border-zinc-700'
            }`}
          >
            All
          </Link>
          {ASSET_TYPES.map((assetType: string) => (
            <Link
              key={assetType}
              href={toggleAssetType(assetType)}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                currentAssetTypes.includes(assetType)
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-300 hover:text-white border border-zinc-700'
              }`}
            >
              {assetType}
            </Link>
          ))}
        </div>
      </div>

      {/* Volatility Filter */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-zinc-400">Volatility:</span>
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildUrl({ view: currentView, assetTypes: currentAssetTypes, volatilityBuckets: [] })}
            className={`px-3 py-1.5 text-sm rounded-md transition ${
              currentVolatilityBuckets.length === 0
                ? 'bg-blue-600 text-white'
                : 'text-zinc-300 hover:text-white border border-zinc-700'
            }`}
          >
            All
          </Link>
          {VOLATILITY_BUCKETS.map((volatilityBucket: string) => (
            <Link
              key={volatilityBucket}
              href={toggleVolatilityBucket(volatilityBucket)}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                currentVolatilityBuckets.includes(volatilityBucket)
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-300 hover:text-white border border-zinc-700'
              }`}
            >
              {volatilityBucket}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}