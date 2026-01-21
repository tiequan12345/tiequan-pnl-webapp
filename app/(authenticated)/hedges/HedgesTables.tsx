'use client';

import { DataTable, type DataTableColumn } from '../_components/table/DataTable';

export type NetExposureRow = {
  assetId: number;
  assetSymbol: string;
  assetName: string;
  netQuantity: string;
  netQuantityValue: number;
  price: number | null;
  marketValue: number | null;
};

export type HedgeTableRow = {
  id: number;
  dateTime: string;
  accountName: string;
  assetSymbol: string;
  assetName: string;
  quantity: string;
  quantityValue: number;
  price: number | null;
  marketValue: number | null;
};

export type AggregatedHedgeRow = {
  assetId: number;
  assetSymbol: string;
  assetName: string;
  totalQuantity: string;
  totalQuantityValue: number;
  price: number | null;
  totalMarketValue: number | null;
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
      cell: (row) => {
        const absValue = Math.abs(row.netQuantityValue);
        const formatted = absValue.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        return (
          <span className="text-zinc-300">
            {row.netQuantityValue < 0 ? `-${formatted}` : `+${formatted}`}
          </span>
        );
      },
      sortable: true,
      align: 'right',
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      id: 'price',
      header: 'Price',
      accessor: (row) => row.price ?? -Infinity,
      cell: (row) => (
        <span className="text-zinc-300">
          {row.price ? `$${row.price.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 6,
          })}` : '—'}
        </span>
      ),
      sortable: true,
      sortFn: (a, b) => (a.price ?? -Infinity) - (b.price ?? -Infinity),
      align: 'right',
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      id: 'marketValue',
      header: 'Market Value',
      accessor: (row) => row.marketValue ?? -Infinity,
      cell: (row) => {
        const value = row.marketValue;
        if (value === null || value === undefined) return <span className="text-zinc-300">—</span>;
        const formatted = Math.abs(value).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        return (
          <span className="text-zinc-300">
            {value < 0 ? `-$${formatted}` : `$${formatted}`}
          </span>
        );
      },
      sortable: true,
      sortFn: (a, b) => (a.marketValue ?? -Infinity) - (b.marketValue ?? -Infinity),
      align: 'right',
      className: 'text-right',
      headerClassName: 'text-right',
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
      stickyHeader
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
      cell: (row) => {
        const absValue = Math.abs(row.quantityValue);
        const formatted = absValue.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        return (
          <span className="text-zinc-300">
            {row.quantityValue < 0 ? `-${formatted}` : `+${formatted}`}
          </span>
        );
      },
      sortable: true,
      align: 'right',
      className: 'text-right',
    },
    {
      id: 'price',
      header: 'Price',
      accessor: (row) => row.price ?? -Infinity,
      cell: (row) => (
        <span className="text-zinc-300">
          {row.price ? `$${row.price.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 6,
          })}` : '—'}
        </span>
      ),
      sortable: true,
      sortFn: (a, b) => (a.price ?? -Infinity) - (b.price ?? -Infinity),
      align: 'right',
      className: 'text-right',
    },
    {
      id: 'marketValue',
      header: 'Market Value',
      accessor: (row) => row.marketValue ?? -Infinity,
      cell: (row) => {
        const value = row.marketValue;
        if (value === null || value === undefined) return <span className="text-zinc-300">—</span>;
        const formatted = value.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        return (
          <span className="text-zinc-300">
            {value < 0 ? `-$${formatted.slice(1)}` : `$${formatted}`}
          </span>
        );
      },
      sortable: true,
      sortFn: (a, b) => (a.marketValue ?? -Infinity) - (b.marketValue ?? -Infinity),
      align: 'right',
      className: 'text-right',
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
      stickyHeader
    />
  );
}

type AggregatedHedgesTableProps = {
  rows: AggregatedHedgeRow[];
};

export function AggregatedHedgesTable({ rows }: AggregatedHedgesTableProps) {
  const columns: DataTableColumn<AggregatedHedgeRow>[] = [
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
      id: 'totalQuantityValue',
      header: 'Total Quantity',
      accessor: (row) => row.totalQuantityValue,
      cell: (row) => {
        const absValue = Math.abs(row.totalQuantityValue);
        const formatted = absValue.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        return (
          <span className="text-zinc-300">
            {row.totalQuantityValue < 0 ? `-${formatted}` : `+${formatted}`}
          </span>
        );
      },
      sortable: true,
      align: 'right',
      className: 'text-right',
    },
    {
      id: 'price',
      header: 'Price',
      accessor: (row) => row.price ?? -Infinity,
      cell: (row) => (
        <span className="text-zinc-300">
          {row.price ? `$${row.price.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 6,
          })}` : '—'}
        </span>
      ),
      sortable: true,
      sortFn: (a, b) => (a.price ?? -Infinity) - (b.price ?? -Infinity),
      align: 'right',
      className: 'text-right',
    },
    {
      id: 'totalMarketValue',
      header: 'Total Market Value',
      accessor: (row) => row.totalMarketValue ?? -Infinity,
      cell: (row) => {
        const value = row.totalMarketValue;
        if (value === null || value === undefined) return <span className="text-zinc-300">—</span>;
        const formatted = Math.abs(value).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        return (
          <span className="text-zinc-300">
            {value < 0 ? `-$${formatted}` : `$${formatted}`}
          </span>
        );
      },
      sortable: true,
      sortFn: (a, b) => (a.totalMarketValue ?? -Infinity) - (b.totalMarketValue ?? -Infinity),
      align: 'right',
      className: 'text-right',
    },
  ];

  const toolbar = (
    <span className="text-xs text-zinc-500">
      {rows.length === 1
        ? '1 volatile hedge asset'
        : `${rows.length} volatile hedge assets`}
    </span>
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      keyFn={(row) => row.assetId}
      defaultSort={{ columnId: 'assetSymbol', direction: 'asc' }}
      globalSearch={{ placeholder: 'Search volatile hedge assets' }}
      emptyMessage="No volatile hedge transactions found. Add HEDGE entries for volatile assets in the ledger to see them here."
      rowClassName={() => 'hover:bg-zinc-800/30'}
      toolbar={toolbar}
      stickyHeader
    />
  );
}