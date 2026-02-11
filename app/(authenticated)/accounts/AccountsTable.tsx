'use client';

import { DataTable, type DataTableColumn } from '../_components/table/DataTable';
import { Badge } from '../_components/ui/Badge';
import { AccountRowActions } from './AccountRowActions';

type AccountRow = {
  id: number;
  name: string;
  platform: string;
  accountType: string;
  chainOrMarket: string | null;
  status: string;
  notes: string | null;
};

type AccountsTableProps = {
  rows: AccountRow[];
};

export function AccountsTable({ rows }: AccountsTableProps) {
  const columns: DataTableColumn<AccountRow>[] = [
    {
      id: 'name',
      header: 'Name',
      accessor: (row) => row.name,
      cell: (row) => <span className="font-semibold text-zinc-200">{row.name}</span>,
      sortable: true,
    },
    {
      id: 'platform',
      header: 'Platform',
      accessor: (row) => row.platform,
      cell: (row) => <span className="text-zinc-300">{row.platform}</span>,
      sortable: true,
    },
    {
      id: 'accountType',
      header: 'Type',
      accessor: (row) => row.accountType,
      cell: (row) => <span className="text-zinc-400">{row.accountType}</span>,
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
      id: 'status',
      header: 'Status',
      accessor: (row) => row.status,
      cell: (row) => (
        <Badge type={row.status === 'ACTIVE' ? 'green' : 'default'}>{row.status}</Badge>
      ),
      sortable: true,
    },
    {
      id: 'notes',
      header: 'Notes',
      accessor: (row) => row.notes ?? '—',
      cell: (row) => <span className="text-zinc-500 max-w-xs truncate">{row.notes ?? '—'}</span>,
      sortable: true,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (row) => <AccountRowActions accountId={row.id} accountType={row.accountType} />,
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
      defaultSort={{ columnId: 'name', direction: 'asc' }}
      globalSearch={{ placeholder: 'Search accounts' }}
      emptyMessage={'No accounts found. Use "Add Account" to create your first account.'}
      rowClassName={() => 'hover:bg-zinc-800/30'}
      stickyHeader
    />
  );
}