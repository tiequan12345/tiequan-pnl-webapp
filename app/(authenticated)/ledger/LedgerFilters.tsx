'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

type LedgerFiltersProps = {
  accounts: { id: number; name: string }[];
  assets: { id: number; symbol: string; name: string }[];
  initialFilters: {
    dateFrom?: string;
    dateTo?: string;
    accountId?: number | null;
    assetId?: number | null;
    txType?: string | null;
  };
};

const TX_TYPES = [
  'DEPOSIT',
  'WITHDRAWAL',
  'TRADE',
  'YIELD',
  'NFT_TRADE',
  'OFFLINE_TRADE',
  'OTHER',
] as const;

export function LedgerFilters({ accounts, assets, initialFilters }: LedgerFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [dateFrom, setDateFrom] = useState<string>(initialFilters.dateFrom ?? '');
  const [dateTo, setDateTo] = useState<string>(initialFilters.dateTo ?? '');
  const [accountId, setAccountId] = useState<string>(
    initialFilters.accountId != null ? String(initialFilters.accountId) : '',
  );
  const [assetId, setAssetId] = useState<string>(
    initialFilters.assetId != null ? String(initialFilters.assetId) : '',
  );
  const [txType, setTxType] = useState<string>(initialFilters.txType ?? '');

  type Patch = {
    dateFrom?: string | null;
    dateTo?: string | null;
    accountId?: number | null;
    assetId?: number | null;
    txType?: string | null;
  };

  const updateUrl = (patch: Patch) => {
    const params = new URLSearchParams(searchParams.toString());

    if (patch.dateFrom !== undefined) {
      if (patch.dateFrom) {
        params.set('dateFrom', patch.dateFrom);
      } else {
        params.delete('dateFrom');
      }
    }

    if (patch.dateTo !== undefined) {
      if (patch.dateTo) {
        params.set('dateTo', patch.dateTo);
      } else {
        params.delete('dateTo');
      }
    }

    if (patch.accountId !== undefined) {
      if (patch.accountId != null) {
        params.set('accountIds', String(patch.accountId));
      } else {
        params.delete('accountIds');
      }
    }

    if (patch.assetId !== undefined) {
      if (patch.assetId != null) {
        params.set('assetIds', String(patch.assetId));
      } else {
        params.delete('assetIds');
      }
    }

    if (patch.txType !== undefined) {
      if (patch.txType) {
        params.set('txTypes', patch.txType);
      } else {
        params.delete('txTypes');
      }
    }

    params.set('page', '1');

    const search = params.toString();
    router.push(search ? `${pathname}?${search}` : pathname);
  };

  const handleDateFromChange = (value: string) => {
    setDateFrom(value);
    updateUrl({ dateFrom: value || null });
  };

  const handleDateToChange = (value: string) => {
    setDateTo(value);
    updateUrl({ dateTo: value || null });
  };

  const handleAccountChange = (value: string) => {
    setAccountId(value);
    updateUrl({ accountId: value ? Number(value) : null });
  };

  const handleAssetChange = (value: string) => {
    setAssetId(value);
    updateUrl({ assetId: value ? Number(value) : null });
  };

  const handleTxTypeChange = (value: string) => {
    setTxType(value);
    updateUrl({ txType: value || null });
  };

  return (
    <div className="flex flex-col md:flex-row md:items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide">
          Date From
        </label>
        <input
          type="date"
          value={dateFrom}
          onChange={(event) => handleDateFromChange(event.target.value)}
          className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide">
          Date To
        </label>
        <input
          type="date"
          value={dateTo}
          onChange={(event) => handleDateToChange(event.target.value)}
          className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide">
          Account
        </label>
        <select
          value={accountId}
          onChange={(event) => handleAccountChange(event.target.value)}
          className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 min-w-[140px]"
        >
          <option value="">All Accounts</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide">
          Asset
        </label>
        <select
          value={assetId}
          onChange={(event) => handleAssetChange(event.target.value)}
          className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 min-w-[160px]"
        >
          <option value="">All Assets</option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.symbol} ({asset.name})
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide">
          Tx Type
        </label>
        <select
          value={txType}
          onChange={(event) => handleTxTypeChange(event.target.value)}
          className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 min-w-[160px]"
        >
          <option value="">All Types</option>
          {TX_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}