'use client';

import { useMemo, useState } from 'react';
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
      {statusFilter === 'ACTIVE' ? (
        <button
          type="button"
          disabled={selectedIds.size === 0 || isUpdating}
          onClick={() => handleStatusUpdate('INACTIVE')}
          className="text-xs px-2.5 py-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
        >
          Mark Inactive
        </button>
      ) : (
        <button
          type="button"
          disabled={selectedIds.size === 0 || isUpdating}
          onClick={() => handleStatusUpdate('ACTIVE')}
          className="text-xs px-2.5 py-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
        >
          Mark Active
        </button>
      )}
      <span className="text-xs text-zinc-500">{selectedIds.size} selected</span>
    </div>
  );

  return (
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
    />
  );
}