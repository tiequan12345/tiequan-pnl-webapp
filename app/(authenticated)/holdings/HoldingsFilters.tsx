'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ASSET_TYPES, VOLATILITY_BUCKETS } from '../assets/AssetForm';
import { AccountMultiSelect } from './AccountMultiSelect';

type HoldingsFiltersProps = {
  currentView?: string;
  currentAccountIds?: number[];
  currentAssetIds?: number[];
  currentAssetTypes?: string[];
  currentVolatilityBuckets?: string[];
  hideViewToggle?: boolean;
};

type Account = {
  id: number;
  name: string;
};

type Asset = {
  id: number;
  symbol: string;
  name: string;
};

export function HoldingsFilters({
  currentView = 'per-account',
  currentAccountIds = [],
  currentAssetIds = [],
  currentAssetTypes = [],
  currentVolatilityBuckets = [],
  hideViewToggle = false,
}: HoldingsFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [topAssets, setTopAssets] = useState<Asset[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(
    currentAccountIds.map(id => String(id))
  );
  const [isLoading, setIsLoading] = useState(true);

  // Fetch accounts and top assets on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [accountsRes, topAssetsRes] = await Promise.all([
          fetch('/api/accounts'),
          fetch('/api/assets/top')
        ]);

        if (accountsRes.ok) {
          const data = await accountsRes.json();
          setAccounts(data);
        }

        if (topAssetsRes.ok) {
          const data = await topAssetsRes.json();
          setTopAssets(data);
        }
      } catch (error) {
        console.error('Failed to fetch filter data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Update selected account IDs when currentAccountIds prop changes
  useEffect(() => {
    setSelectedAccountIds(currentAccountIds.map(id => String(id)));
  }, [currentAccountIds]);

  const buildUrl = (updates: {
    view?: string;
    accountIds?: number[];
    assetIds?: number[];
    assetTypes?: string[];
    volatilityBuckets?: string[];
  }) => {
    const params = new URLSearchParams();

    if (updates.view && updates.view !== 'per-account') {
      params.set('view', updates.view);
    }

    if (updates.accountIds && updates.accountIds.length > 0) {
      params.set('accountIds', updates.accountIds.join(','));
    }

    if (updates.assetIds && updates.assetIds.length > 0) {
      params.set('assetIds', updates.assetIds.join(','));
    }

    if (updates.assetTypes && updates.assetTypes.length > 0) {
      params.set('assetTypes', updates.assetTypes.join(','));
    }

    if (updates.volatilityBuckets && updates.volatilityBuckets.length > 0) {
      params.set('volatilityBuckets', updates.volatilityBuckets.join(','));
    }

    const queryString = params.toString();
    const targetPath = pathname ?? '/holdings';
    return queryString ? `${targetPath}?${queryString}` : targetPath;
  };

  const updateUrlWithAccountIds = (newAccountIds: number[]) => {
    const params = new URLSearchParams(searchParams.toString());

    if (newAccountIds.length > 0) {
      params.set('accountIds', newAccountIds.join(','));
    } else {
      params.delete('accountIds');
    }

    const search = params.toString();
    router.push(search ? `${pathname}?${search}` : pathname);
  };


  const toggleAssetType = (assetType: string) => {
    const newAssetTypes = currentAssetTypes.includes(assetType)
      ? currentAssetTypes.filter(t => t !== assetType)
      : [...currentAssetTypes, assetType];

    return buildUrl({
      view: currentView,
      accountIds: currentAccountIds,
      assetIds: currentAssetIds,
      assetTypes: newAssetTypes,
      volatilityBuckets: currentVolatilityBuckets,
    });
  };

  const toggleAssetId = (assetId: number) => {
    const newAssetIds = currentAssetIds.includes(assetId)
      ? currentAssetIds.filter(id => id !== assetId)
      : [...currentAssetIds, assetId];

    return buildUrl({
      view: currentView,
      accountIds: currentAccountIds,
      assetIds: newAssetIds,
      assetTypes: currentAssetTypes,
      volatilityBuckets: currentVolatilityBuckets,
    });
  };

  const toggleVolatilityBucket = (volatilityBucket: string) => {
    const newVolatilityBuckets = currentVolatilityBuckets.includes(volatilityBucket)
      ? currentVolatilityBuckets.filter(v => v !== volatilityBucket)
      : [...currentVolatilityBuckets, volatilityBucket];

    return buildUrl({
      view: currentView,
      accountIds: currentAccountIds,
      assetIds: currentAssetIds,
      assetTypes: currentAssetTypes,
      volatilityBuckets: newVolatilityBuckets,
    });
  };

  return (
    <div className="space-y-4">
      {!hideViewToggle && (
        <>
          {/* View Toggle */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-zinc-400">View:</span>
            <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
              <Link
                href={buildUrl({ view: 'per-account', accountIds: currentAccountIds, assetTypes: currentAssetTypes, volatilityBuckets: currentVolatilityBuckets })}
                className={`px-3 py-1.5 text-sm rounded-md transition ${currentView === 'per-account'
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-300 hover:text-white'
                  }`}
              >
                Per Account
              </Link>
              <Link
                href={buildUrl({ view: 'consolidated', accountIds: currentAccountIds, assetTypes: currentAssetTypes, volatilityBuckets: currentVolatilityBuckets })}
                className={`px-3 py-1.5 text-sm rounded-md transition ${currentView === 'consolidated'
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-300 hover:text-white'
                  }`}
              >
                Consolidated
              </Link>
            </div>
          </div>
        </>
      )}

      {/* Account Filter - Only show in Per Account view */}
      {currentView === 'per-account' && (
        <AccountMultiSelect
          accounts={accounts}
          selectedIds={selectedAccountIds}
          onChange={(ids) => {
            setSelectedAccountIds(ids);
            updateUrlWithAccountIds(ids.map(Number));
          }}
          isLoading={isLoading}
          label="Accounts"
        />
      )}

      {/* Top Assets Filter */}
      {topAssets.length > 0 && (
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-zinc-400">Assets:</span>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildUrl({ view: currentView, accountIds: currentAccountIds, assetIds: [], assetTypes: currentAssetTypes, volatilityBuckets: currentVolatilityBuckets })}
              className={`px-3 py-1.5 text-sm rounded-md transition ${currentAssetIds.length === 0
                ? 'bg-emerald-600 text-white'
                : 'text-zinc-300 hover:text-white border border-zinc-700'
                }`}
            >
              All Assets
            </Link>
            {topAssets.map((asset) => (
              <Link
                key={asset.id}
                href={toggleAssetId(asset.id)}
                className={`px-3 py-1.5 text-sm rounded-md transition ${currentAssetIds.includes(asset.id)
                  ? 'bg-emerald-600 text-white'
                  : 'text-zinc-300 hover:text-white border border-zinc-700'
                  }`}
                title={asset.name}
              >
                {asset.symbol}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Asset Type Filter */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-zinc-400">Type:</span>
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildUrl({ view: currentView, accountIds: currentAccountIds, assetIds: currentAssetIds, assetTypes: [], volatilityBuckets: currentVolatilityBuckets })}
            className={`px-3 py-1.5 text-sm rounded-md transition ${currentAssetTypes.length === 0
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
              className={`px-3 py-1.5 text-sm rounded-md transition ${currentAssetTypes.includes(assetType)
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
            href={buildUrl({ view: currentView, accountIds: currentAccountIds, assetIds: currentAssetIds, assetTypes: currentAssetTypes, volatilityBuckets: [] })}
            className={`px-3 py-1.5 text-sm rounded-md transition ${currentVolatilityBuckets.length === 0
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
              className={`px-3 py-1.5 text-sm rounded-md transition ${currentVolatilityBuckets.includes(volatilityBucket)
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