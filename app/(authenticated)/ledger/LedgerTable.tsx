'use client';

import { DataTable, type DataTableColumn } from '../_components/table/DataTable';
import { LedgerRowActions } from './LedgerRowActions';

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export type LedgerTableRow = {
  id: number;
  dateTime: string;
  accountName: string;
  assetLabel: string;
  txType: string;
  quantity: string;
  quantityValue: number;
  notes: string | null;
};

type LedgerTableProps = {
  rows: LedgerTableRow[];
};

export function LedgerTable({ rows }: LedgerTableProps) {
  const columns: DataTableColumn<LedgerTableRow>[] = [
    {
      id: 'dateTime',
      header: 'Date / Time',
      accessor: (row) => new Date(row.dateTime).getTime(),
      cell: (row) => (
        <span className="text-zinc-300">
          {DATE_FORMATTER.format(new Date(row.dateTime))}
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
      id: 'assetLabel',
      header: 'Asset',
      accessor: (row) => row.assetLabel,
      cell: (row) => <span className="text-zinc-300">{row.assetLabel}</span>,
      sortable: true,
    },
    {
      id: 'txType',
      header: 'Tx Type',
      accessor: (row) => row.txType,
      cell: (row) => <span className="text-zinc-400">{row.txType}</span>,
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
      sortFn: (a, b) => a.quantityValue - b.quantityValue,
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
    {
      id: 'actions',
      header: 'Actions',
      cell: (row) => <LedgerRowActions transactionId={row.id} />,
      sortable: false,
      align: 'right',
      className: 'text-right',
    },
  ];

  const toolbar = (
    <span className="text-xs text-zinc-500">
      {rows.length === 1
        ? '1 transaction on this page'
        : `${rows.length} transactions on this page`}
    </span>
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      keyFn={(row) => row.id}
      defaultSort={{ columnId: 'dateTime', direction: 'desc' }}
      globalSearch={{ placeholder: 'Search ledger' }}
      emptyMessage="No ledger transactions found. Once you add transactions, they will appear here."
      rowClassName={() => 'hover:bg-zinc-800/30'}
      toolbar={toolbar}
    />
  );
}