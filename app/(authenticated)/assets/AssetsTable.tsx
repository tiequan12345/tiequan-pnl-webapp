'use client';

import { DataTable, type DataTableColumn } from '../_components/table/DataTable';
import { Badge } from '../_components/ui/Badge';
import { AssetRowActions } from './AssetRowActions';

export type AssetRow = {
  id: number;
  symbol: string;
  name: string;
  type: string;
  volatilityBucket: string;
  chainOrMarket: string;
  pricingMode: string;
  manualPrice: string | null;
  manualPriceValue: number | null;
};

type AssetsTableProps = {
  rows: AssetRow[];
};

export function AssetsTable({ rows }: AssetsTableProps) {
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

  return (
    <DataTable
      columns={columns}
      rows={rows}
      keyFn={(row) => row.id}
      defaultSort={{ columnId: 'symbol', direction: 'asc' }}
      globalSearch={{ placeholder: 'Search assets' }}
      emptyMessage={'No assets found. Use "Add Asset" to create your first asset.'}
      rowClassName={() => 'hover:bg-zinc-800/30'}
    />
  );
}