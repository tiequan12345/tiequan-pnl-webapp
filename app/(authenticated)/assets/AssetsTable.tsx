'use client';

import { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { DataTable, type DataTableColumn } from '../_components/table/DataTable';
import { Badge } from '../_components/ui/Badge';
import { AssetRowActions } from './AssetRowActions';

export type AssetRow = {
  id: number;
  symbol: string;
  name: string;
  type: string;
  volatilityBucket: string;
  chainOrMarket: string | null;
  pricingMode: string;
  coinGeckoId: string | null;
  resolvedCoinGeckoId: string | null;
  manualPrice: string | null;
  manualPriceValue: number | null;
  status: string;
  marketValue: number | null;
};

type AssetsTableProps = {
  rows: AssetRow[];
  statusFilter?: string;
};

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'Unpriced';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function AssetsTable({ rows, statusFilter = 'ACTIVE' }: AssetsTableProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<number | string>>(new Set());
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dustAssetIds = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            row.marketValue !== null && row.marketValue > -100 && row.marketValue < 100,
        )
        .map((row) => row.id),
    [rows],
  );

  const handleStatusUpdate = async (nextStatus: 'ACTIVE' | 'INACTIVE') => {
    if (selectedIds.size === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Update ${selectedIds.size} asset(s) to ${nextStatus.toLowerCase()}?`,
    );
    if (!confirmed) {
      return;
    }

    setIsUpdating(true);
    try {
      const response = await fetch('/api/assets/bulk-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assetIds: Array.from(selectedIds).map((id) => Number(id)),
          status: nextStatus,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        window.alert(data?.error || 'Failed to update asset status.');
        return;
      }

      setSelectedIds(new Set());
      router.refresh();
    } catch {
      window.alert('Unexpected error while updating asset status.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} asset(s)? All associated ledger transactions will also be deleted.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch('/api/assets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        window.alert(data?.error || 'Failed to delete assets.');
        return;
      }

      const result = (await response.json()) as { deleted?: number; deletedTransactions?: number; deletedPriceLatest?: number } | null;
      const deletedAssets = result?.deleted ?? 0;
      const deletedTransactions = result?.deletedTransactions ?? 0;
      const deletedPriceLatest = result?.deletedPriceLatest ?? 0;

      if (deletedTransactions > 0 || deletedPriceLatest > 0) {
        const parts = [];
        if (deletedTransactions > 0) {
          parts.push(`${deletedTransactions} ledger transaction(s)`);
        }
        if (deletedPriceLatest > 0) {
          parts.push(`${deletedPriceLatest} price record(s)`);
        }
        window.alert(`Successfully deleted ${deletedAssets} asset(s) and ${parts.join(' and ')}.`);
      }

      setSelectedIds(new Set());
      router.refresh();
    } catch {
      window.alert('Unexpected error while deleting assets.');
    } finally {
      setIsDeleting(false);
    }
  };

  const columns: DataTableColumn<AssetRow>[] = [
    {
      id: 'symbol',
      header: 'Symbol',
      accessor: (row) => row.symbol,
      cell: (row) => <span className="font-semibold text-zinc-200">{row.symbol}</span>,
      sortable: true,
    },
    {
      id: 'name',
      header: 'Name',
      accessor: (row) => row.name,
      cell: (row) => <span className="text-zinc-300">{row.name}</span>,
      sortable: true,
    },
    {
      id: 'type',
      header: 'Type',
      accessor: (row) => row.type,
      cell: (row) => <Badge type="blue">{row.type}</Badge>,
      sortable: true,
    },
    {
      id: 'volatilityBucket',
      header: 'Volatility',
      accessor: (row) => row.volatilityBucket,
      cell: (row) => <span className="text-zinc-400">{row.volatilityBucket}</span>,
      sortable: true,
    },
    {
      id: 'chainOrMarket',
      header: 'Chain / Market',
      accessor: (row) => row.chainOrMarket ?? '—',
      cell: (row) => <span className="text-zinc-400">{row.chainOrMarket ?? '—'}</span>,
      sortable: true,
    },
    {
      id: 'pricingMode',
      header: 'Pricing Mode',
      accessor: (row) => row.pricingMode,
      cell: (row) => (
        <Badge type={row.pricingMode === 'AUTO' ? 'green' : 'orange'}>
          {row.pricingMode}
        </Badge>
      ),
      sortable: true,
    },
    {
      id: 'coinGeckoId',
      header: 'CoinGecko Map',
      accessor: (row) => row.resolvedCoinGeckoId ?? '—',
      cell: (row) => {
        if (!row.resolvedCoinGeckoId) {
          return <span className="text-zinc-500">—</span>;
        }

        if (row.coinGeckoId) {
          return (
            <div className="flex items-center gap-2">
              <span className="text-zinc-200">{row.coinGeckoId}</span>
              <Badge type="green">override</Badge>
            </div>
          );
        }

        return (
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">{row.resolvedCoinGeckoId}</span>
            <Badge type="default">auto</Badge>
          </div>
        );
      },
      sortable: true,
    },
    {
      id: 'marketValue',
      header: 'Market Value',
      accessor: (row) => row.marketValue ?? -Infinity,
      cell: (row) => (
        <span className={row.marketValue === null ? 'text-zinc-500' : 'text-zinc-200'}>
          {formatCurrency(row.marketValue)}
        </span>
      ),
      sortable: true,
      sortFn: (a, b) => (a.marketValue ?? -Infinity) - (b.marketValue ?? -Infinity),
      align: 'right',
      className: 'text-right',
    },
    {
      id: 'manualPriceValue',
      header: 'Manual Price',
      accessor: (row) => row.manualPriceValue ?? -Infinity,
      cell: (row) => <span className="text-zinc-300">{row.manualPrice ?? '—'}</span>,
      sortable: true,
      sortFn: (a, b) =>
        (a.manualPriceValue ?? -Infinity) - (b.manualPriceValue ?? -Infinity),
      align: 'right',
      className: 'text-right',
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (row) => <AssetRowActions assetId={row.id} />,
      sortable: false,
      align: 'right',
      className: 'text-right',
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-zinc-500">
        {rows.length === 1 ? '1 asset' : `${rows.length} assets`}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSelectedIds(new Set(dustAssetIds))}
          className="text-xs px-2.5 py-1.5 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
        >
          Select Dust (±$100)
        </button>
        <button
          type="button"
          onClick={() => setSelectedIds(new Set())}
          className="text-xs px-2.5 py-1.5 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
        >
          Clear Selection
        </button>
        {selectedIds.size > 0 && (
          <span className="text-xs text-zinc-500">{selectedIds.size} selected</span>
        )}
      </div>
    </div>
  );

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        keyFn={(row) => row.id}
        defaultSort={{ columnId: 'symbol', direction: 'asc' }}
        globalSearch={{ placeholder: 'Search assets' }}
        emptyMessage={'No assets found. Use "Add Asset" to create your first asset.'}
        rowClassName={() => 'hover:bg-zinc-800/30'}
        enableSelection
        selectedRowIds={selectedIds}
        onSelectionChange={(next) => setSelectedIds(new Set(next))}
        toolbar={toolbar}
        stickyHeader
      />

      {mounted && selectedIds.size > 0 && createPortal(
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-zinc-900 border border-zinc-700 rounded-full px-6 py-3 shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
          <span className="text-sm font-medium text-zinc-200 whitespace-nowrap">
            {selectedIds.size} selected
          </span>
          <div className="h-4 w-px bg-zinc-700" />
          {statusFilter === 'ACTIVE' ? (
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => handleStatusUpdate('INACTIVE')}
              className="text-sm text-orange-400 hover:text-orange-300 font-medium transition disabled:opacity-50"
            >
              {isUpdating ? 'Updating...' : 'Mark Inactive'}
            </button>
          ) : (
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => handleStatusUpdate('ACTIVE')}
              className="text-sm text-emerald-400 hover:text-emerald-300 font-medium transition disabled:opacity-50"
            >
              {isUpdating ? 'Updating...' : 'Mark Active'}
            </button>
          )}
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={isDeleting}
            className="text-sm text-rose-400 hover:text-rose-300 font-medium transition disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>,
        document.body
      )}
    </>
  );
}