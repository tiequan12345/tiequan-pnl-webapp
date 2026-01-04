'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ALLOWED_TX_TYPES } from '@/lib/ledger';

type LedgerFiltersProps = {
  accounts: { id: number; name: string; usageCount?: number }[];
  assets: { id: number; symbol: string; name: string; usageCount?: number }[];
  initialFilters: {
    dateFrom?: string;
    dateTo?: string;
    accountId?: number | null;
    assetId?: number | null;
    txType?: string | null;
  };
};

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

  const handleExportCsv = () => {
    const params = new URLSearchParams(searchParams.toString());
    // Ensure we don't include pagination in the export
    params.delete('page');
    params.delete('pageSize');

    window.location.href = `/api/ledger/export?${params.toString()}`;
  };

  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div className="flex flex-col md:flex-row md:items-end gap-3 flex-wrap">
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
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-[160px]"
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
            {ALLOWED_TX_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        onClick={handleExportCsv}
        className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white px-4 py-1.5 rounded-lg text-xs font-medium transition-all shadow-sm whitespace-nowrap shrink-0"
      >
        <svg
          className="w-3.5 h-3.5"
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
        Export CSV
      </button>
    </div>
  );
}