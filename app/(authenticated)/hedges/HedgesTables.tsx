'use client';

import { DataTable, type DataTableColumn } from '../_components/table/DataTable';

export type NetExposureRow = {
  assetId: number;
  assetSymbol: string;
  assetName: string;
  netQuantity: string;
  netQuantityValue: number;
};

export type HedgeTableRow = {
  id: number;
  dateTime: string;
  accountName: string;
  assetSymbol: string;
  assetName: string;
  quantity: string;
  quantityValue: number;
  notes: string | null;
};

const HEDGE_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

type NetExposureTableProps = {
  rows: NetExposureRow[];
};

type HedgeTransactionsTableProps = {
  rows: HedgeTableRow[];
};

export function NetExposureTable({ rows }: NetExposureTableProps) {
  const columns: DataTableColumn<NetExposureRow>[] = [
    {
      id: 'assetSymbol',
      header: 'Asset',
      accessor: (row) => `${row.assetSymbol} ${row.assetName}`,
      cell: (row) => (
        <span className="text-zinc-200 font-semibold">
          {row.assetSymbol}{' '}
          <span className="text-zinc-500">({row.assetName})</span>
        </span>
      ),
      sortable: true,
    },
    {
      id: 'netQuantityValue',
      header: 'Net Quantity',
      accessor: (row) => row.netQuantityValue,
      cell: (row) => (
        <span className="text-zinc-300">
          {row.netQuantity.startsWith('-') ? row.netQuantity : `+${row.netQuantity}`}
        </span>
      ),
      sortable: true,
      align: 'right',
      className: 'text-right',
    },
  ];

  const toolbar = (
    <span className="text-xs text-zinc-500">
      {rows.length === 1 ? '1 volatile exposure' : `${rows.length} volatile exposures`}
    </span>
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      keyFn={(row) => row.assetId}
      defaultSort={{ columnId: 'assetSymbol', direction: 'asc' }}
      globalSearch={{ placeholder: 'Search volatile exposures' }}
      emptyMessage="No volatile hedge exposures yet. Add HEDGE transactions for volatile assets to see net exposure."
      rowClassName={() => 'hover:bg-zinc-800/30'}
      toolbar={toolbar}
    />
  );
}

export function HedgeTransactionsTable({ rows }: HedgeTransactionsTableProps) {
  const columns: DataTableColumn<HedgeTableRow>[] = [
    {
      id: 'dateTime',
      header: 'Date / Time',
      accessor: (row) => new Date(row.dateTime).getTime(),
      cell: (row) => (
        <span className="text-zinc-300">
          {HEDGE_DATE_FORMAT.format(new Date(row.dateTime))}
        </span>
      ),
      sortable: true,
    },
    {
      id: 'accountName',
      header: 'Account',
      accessor: (row) => row.accountName,
      cell: (row) => (
        <span className="text-zinc-200 font-semibold">{row.accountName}</span>
      ),
      sortable: true,
    },
    {
      id: 'assetSymbol',
      header: 'Asset',
      accessor: (row) => `${row.assetSymbol} ${row.assetName}`,
      cell: (row) => (
        <span className="text-zinc-300">
          {row.assetSymbol} <span className="text-zinc-500">({row.assetName})</span>
        </span>
      ),
      sortable: true,
    },
    {
      id: 'quantityValue',
      header: 'Quantity',
      accessor: (row) => row.quantityValue,
      cell: (row) => (
        <span className="text-zinc-300">
          {row.quantity.startsWith('-') ? row.quantity : `+${row.quantity}`}
        </span>
      ),
      sortable: true,
      align: 'right',
      className: 'text-right',
    },
    {
      id: 'notes',
      header: 'Notes',
      accessor: (row) => row.notes ?? '—',
      cell: (row) => (
        <span className="text-zinc-500 max-w-xs truncate">{row.notes ?? '—'}</span>
      ),
      sortable: true,
    },
  ];

  const toolbar = (
    <span className="text-xs text-zinc-500">
      {rows.length === 1
        ? '1 volatile hedge entry'
        : `${rows.length} volatile hedge entries`}
    </span>
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      keyFn={(row) => row.id}
      defaultSort={{ columnId: 'dateTime', direction: 'desc' }}
      globalSearch={{ placeholder: 'Search volatile hedge entries' }}
      emptyMessage="No volatile hedge transactions found. Add HEDGE entries for volatile assets in the ledger to see them here."
      rowClassName={() => 'hover:bg-zinc-800/30'}
      toolbar={toolbar}
    />
  );
}