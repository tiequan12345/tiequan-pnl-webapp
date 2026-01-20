'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ASSET_TYPES, VOLATILITY_BUCKETS } from '../assets/AssetForm';
import { AccountMultiSelect } from './AccountMultiSelect';
import { AssetMultiSelect } from './AssetMultiSelect';

type HoldingsFiltersProps = {
  currentView?: string;
  currentAccountIds?: number[];
  currentAssetIds?: number[];
  currentAssetTypes?: string[];
  currentVolatilityBuckets?: string[];
  currentHideSmall?: boolean;
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
  _count?: {
    ledger_transactions: number;
  };
};

export function HoldingsFilters({
  currentView = 'per-account',
  currentAccountIds = [],
  currentAssetIds = [],
  currentAssetTypes = [],
  currentVolatilityBuckets = [],
  currentHideSmall = true,
  hideViewToggle = false,
}: HoldingsFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [topAssets, setTopAssets] = useState<Asset[]>([]);
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(
    currentAccountIds.map(id => String(id))
  );
  const [isLoading, setIsLoading] = useState(true);

  // Fetch accounts and top assets on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [accountsRes, topAssetsRes, allAssetsRes] = await Promise.all([
          fetch('/api/accounts'),
          fetch('/api/assets/top'),
          fetch('/api/assets')
        ]);

        if (accountsRes.ok) {
          const data = await accountsRes.json();
          setAccounts(data);
        }

        if (topAssetsRes.ok) {
          const data = await topAssetsRes.json();
          setTopAssets(data);
        }

        if (allAssetsRes.ok) {
          const data = await allAssetsRes.json();
          const sortedAssets = data.sort((a: Asset, b: Asset) => {
            const countA = a._count?.ledger_transactions ?? 0;
            const countB = b._count?.ledger_transactions ?? 0;
            if (countB !== countA) {
              return countB - countA;
            }
            return a.symbol.localeCompare(b.symbol);
          });
          setAllAssets(sortedAssets);
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
    hideSmall?: boolean;
  }) => {
    const params = new URLSearchParams();

    const view = updates.view ?? currentView;
    if (view && view !== 'per-account') {
      params.set('view', view);
    }

    const accountIds = updates.accountIds ?? currentAccountIds;
    if (accountIds && accountIds.length > 0) {
      params.set('accountIds', accountIds.join(','));
    }

    const assetIds = updates.assetIds ?? currentAssetIds;
    if (assetIds && assetIds.length > 0) {
      params.set('assetIds', assetIds.join(','));
    }

    const assetTypes = updates.assetTypes ?? currentAssetTypes;
    if (assetTypes && assetTypes.length > 0) {
      params.set('assetTypes', assetTypes.join(','));
    }

    const volatilityBuckets = updates.volatilityBuckets ?? currentVolatilityBuckets;
    if (volatilityBuckets && volatilityBuckets.length > 0) {
      params.set('volatilityBuckets', volatilityBuckets.join(','));
    }

    const resolvedHideSmall = updates.hideSmall ?? currentHideSmall;
    if (!resolvedHideSmall) {
      params.set('hideSmall', '0');
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
      assetTypes: newAssetTypes,
    });
  };

  const toggleAssetId = (assetId: number) => {
    const newAssetIds = currentAssetIds.includes(assetId)
      ? currentAssetIds.filter(id => id !== assetId)
      : [...currentAssetIds, assetId];

    return buildUrl({
      assetIds: newAssetIds,
    });
  };

  const toggleVolatilityBucket = (volatilityBucket: string) => {
    const newVolatilityBuckets = currentVolatilityBuckets.includes(volatilityBucket)
      ? currentVolatilityBuckets.filter(v => v !== volatilityBucket)
      : [...currentVolatilityBuckets, volatilityBucket];

    return buildUrl({
      volatilityBuckets: newVolatilityBuckets,
    });
  };

  const updateHideSmall = (hideSmall: boolean) => {
    router.push(buildUrl({ hideSmall }));
  };

  return (
    <div className="space-y-4">
      {!hideViewToggle && (
        <>
          {/* View Toggle */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-zinc-500 min-w-[80px]">View:</span>
            <div className="inline-flex items-center gap-2 bg-zinc-900/50 border border-zinc-800/50 rounded-lg p-1">
              <Link
                href={buildUrl({ view: 'per-account' })}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition duration-200 ${currentView === 'per-account'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
              >
                Per Account
              </Link>
              <Link
                href={buildUrl({ view: 'consolidated' })}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition duration-200 ${currentView === 'consolidated'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
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
          <span className="text-sm font-medium text-zinc-500 min-w-[80px]">Assets:</span>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildUrl({ assetIds: [] })}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition duration-200 ${currentAssetIds.length === 0
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20'
                : 'text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700'
                }`}
            >
              All Assets
            </Link>
            {topAssets.slice(0, 4).map((asset) => (
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

            <div className="border-l border-zinc-800 mx-1 h-6 self-center" />

            <AssetMultiSelect
              assets={allAssets}
              selectedIds={currentAssetIds.map(String)}
              onChange={(ids) => {
                router.push(buildUrl({ assetIds: ids.map(Number) }));
              }}
              isLoading={isLoading}
            />
          </div>
        </div>
      )}

      {/* Asset Type Filter */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-zinc-500 min-w-[80px]">Type:</span>
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildUrl({ assetTypes: [] })}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition duration-200 ${currentAssetTypes.length === 0
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
              : 'text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700'
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
        <span className="text-sm font-medium text-zinc-500 min-w-[80px]">Volatility:</span>
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildUrl({ volatilityBuckets: [] })}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition duration-200 ${currentVolatilityBuckets.length === 0
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
              : 'text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700'
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

      {/* Dust Filter */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-zinc-500 min-w-[80px]">Dust:</span>
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildUrl({ hideSmall: true })}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition duration-200 ${currentHideSmall
              ? 'bg-zinc-700 text-white shadow-lg shadow-black/20'
              : 'text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700'
              }`}
          >
            Hide &lt;$100
          </Link>
          <Link
            href={buildUrl({ hideSmall: false })}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition duration-200 ${!currentHideSmall
              ? 'bg-zinc-700 text-white shadow-lg shadow-black/20'
              : 'text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700'
              }`}
          >
            Show All
          </Link>
        </div>
      </div>
    </div>
  );
}