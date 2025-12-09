'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ASSET_TYPES, VOLATILITY_BUCKETS } from '../assets/AssetForm';

type HoldingsFiltersProps = {
  currentView?: string;
  currentAccountIds?: number[];
  currentAssetTypes?: string[];
  currentVolatilityBuckets?: string[];
};

type Account = {
  id: number;
  name: string;
};

export function HoldingsFilters({
  currentView = 'consolidated',
  currentAccountIds = [],
  currentAssetTypes = [],
  currentVolatilityBuckets = [],
}: HoldingsFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(
    currentAccountIds.map(id => String(id))
  );
  const [isLoading, setIsLoading] = useState(true);

  // Fetch accounts on component mount
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const response = await fetch('/api/accounts');
        if (response.ok) {
          const data = await response.json();
          setAccounts(data);
        }
      } catch (error) {
        console.error('Failed to fetch accounts:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccounts();
  }, []);

  // Update selected account IDs when currentAccountIds prop changes
  useEffect(() => {
    setSelectedAccountIds(currentAccountIds.map(id => String(id)));
  }, [currentAccountIds]);

  const buildUrl = (updates: {
    view?: string;
    accountIds?: number[];
    assetTypes?: string[];
    volatilityBuckets?: string[];
  }) => {
    const params = new URLSearchParams();
    
    if (updates.view && updates.view !== 'consolidated') {
      params.set('view', updates.view);
    }
    
    if (updates.accountIds && updates.accountIds.length > 0) {
      params.set('accountIds', updates.accountIds.join(','));
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

  const handleAccountChange = (accountId: string, isChecked: boolean) => {
    let newSelectedAccountIds: string[];
    
    if (isChecked) {
      newSelectedAccountIds = [...selectedAccountIds, accountId];
    } else {
      newSelectedAccountIds = selectedAccountIds.filter(id => id !== accountId);
    }
    
    setSelectedAccountIds(newSelectedAccountIds);
    updateUrlWithAccountIds(newSelectedAccountIds.map(id => Number(id)));
  };

  const toggleAssetType = (assetType: string) => {
    const newAssetTypes = currentAssetTypes.includes(assetType)
      ? currentAssetTypes.filter(t => t !== assetType)
      : [...currentAssetTypes, assetType];
    
    return buildUrl({
      view: currentView,
      accountIds: currentAccountIds,
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
      accountIds: currentAccountIds,
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
            href={buildUrl({ view: 'per-account', accountIds: currentAccountIds, assetTypes: currentAssetTypes, volatilityBuckets: currentVolatilityBuckets })}
            className={`px-3 py-1.5 text-sm rounded-md transition ${
              currentView === 'per-account'
                ? 'bg-blue-600 text-white'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            Per Account
          </Link>
          <Link
            href={buildUrl({ view: 'consolidated', accountIds: currentAccountIds, assetTypes: currentAssetTypes, volatilityBuckets: currentVolatilityBuckets })}
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

      {/* Account Filter - Only show in Per Account view */}
      {currentView === 'per-account' && (
        <div className="flex items-start gap-4">
          <span className="text-sm font-medium text-zinc-400 mt-1">Accounts:</span>
          <div className="flex-1">
            {isLoading ? (
              <div className="text-sm text-zinc-500">Loading accounts...</div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="select-all-accounts"
                    checked={selectedAccountIds.length === accounts.length}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      if (isChecked) {
                        const allAccountIds = accounts.map(account => String(account.id));
                        setSelectedAccountIds(allAccountIds);
                        updateUrlWithAccountIds(accounts.map(account => account.id));
                      } else {
                        setSelectedAccountIds([]);
                        updateUrlWithAccountIds([]);
                      }
                    }}
                    className="rounded border-zinc-700 bg-zinc-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                  />
                  <label htmlFor="select-all-accounts" className="text-sm text-zinc-300 cursor-pointer">
                    Select All ({accounts.length})
                  </label>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {accounts.map((account) => (
                    <div key={account.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`account-${account.id}`}
                        checked={selectedAccountIds.includes(String(account.id))}
                        onChange={(e) => handleAccountChange(String(account.id), e.target.checked)}
                        className="rounded border-zinc-700 bg-zinc-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                      />
                      <label 
                        htmlFor={`account-${account.id}`} 
                        className="text-sm text-zinc-300 cursor-pointer truncate"
                        title={account.name}
                      >
                        {account.name}
                      </label>
                    </div>
                  ))}
                </div>
                {selectedAccountIds.length > 0 && (
                  <div className="text-xs text-zinc-500 mt-2">
                    {selectedAccountIds.length} of {accounts.length} accounts selected
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Asset Type Filter */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-zinc-400">Type:</span>
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildUrl({ view: currentView, accountIds: currentAccountIds, assetTypes: [], volatilityBuckets: currentVolatilityBuckets })}
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
            href={buildUrl({ view: currentView, accountIds: currentAccountIds, assetTypes: currentAssetTypes, volatilityBuckets: [] })}
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