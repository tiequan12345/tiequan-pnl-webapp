'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { DataTable, type DataTableColumn } from '../_components/table/DataTable';
import { LedgerRowActions } from './LedgerRowActions';
import { LedgerBulkEditModal } from './LedgerBulkEditModal';
import type { LedgerTxType } from '@/lib/ledger';


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

function QuantityCell({ quantity, value }: { quantity: string; value: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(Math.abs(value).toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      onMouseDown={(e) => e.stopPropagation()}
      title="Click to copy absolute value"
      className={`whitespace-nowrap cursor-pointer transition-colors duration-200 inline-block bg-transparent border-none p-0 focus:outline-none ${copied ? 'text-emerald-400 font-medium' : 'text-zinc-300 hover:text-white'
        }`}
    >
      {quantity.startsWith('-') ? quantity : `+${quantity}`}
    </button>
  );
}

export function LedgerTable({ rows }: LedgerTableProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [accounts, setAccounts] = useState<{ id: number; name: string }[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Fetch accounts for the bulk edit modal
    const fetchAccounts = async () => {
      try {
        const res = await fetch('/api/accounts');
        if (!res.ok) {
          // If the endpoint doesn't exist or fails, we fail gracefully
          console.warn('Accounts endpoint returned status:', res.status);
          return;
        }
        const data = await res.json();

        // Robust handling of different response shapes
        let accountList: { id: number; name: string }[] = [];
        if (Array.isArray(data)) {
          accountList = data;
        } else if (data && Array.isArray(data.accounts)) {
          accountList = data.accounts;
        } else if (data && Array.isArray(data.items)) {
          accountList = data.items;
        } else if (data && Array.isArray(data.data)) {
          accountList = data.data;
        }

        setAccounts(accountList);
      } catch (err) {
        console.error('Failed to fetch accounts for bulk edit', err);
      }
    };

    fetchAccounts();
  }, []);

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} transactions?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch('/api/ledger', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete transactions');
      }

      setSelectedIds(new Set());
      router.refresh();
    } catch (error) {
      console.error(error);
      alert('Failed to delete transactions.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkEditConfirm = async (updates: {
    date_time?: string;
    account_id?: number;
    tx_type?: LedgerTxType;
    notes?: string;
  }) => {
    const response = await fetch('/api/ledger', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: Array.from(selectedIds),
        updates,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to update transactions');
    }

    setSelectedIds(new Set());
    router.refresh();
  };

  const columns: DataTableColumn<LedgerTableRow>[] = [
    {
      id: 'dateTime',
      header: 'Date / Time',
      accessor: (row) => new Date(row.dateTime).getTime(),
      cell: (row) => {
        const d = new Date(row.dateTime);
        const pad = (n: number) => n.toString().padStart(2, '0');
        const formatted = `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear().toString().slice(-2)} ${pad(
          d.getHours()
        )}:${pad(d.getMinutes())}`;
        return (
          <span className="text-zinc-300 whitespace-nowrap">
            {formatted}
          </span>
        );
      },
      sortable: true,
      footer: (rows) => <span className="text-zinc-400 font-medium pl-2">Total ({rows.length})</span>,
      headerClassName: 'w-[140px]',
    },
    {
      id: 'accountName',
      header: 'Account',
      accessor: (row) => row.accountName,
      cell: (row) => (
        <span className="text-zinc-200 font-semibold block truncate" title={row.accountName}>
          {row.accountName}
        </span>
      ),
      sortable: true,
      headerClassName: 'w-[15%]',
    },
    {
      id: 'assetLabel',
      header: 'Asset',
      accessor: (row) => row.assetLabel,
      cell: (row) => (
        <span className="text-zinc-300 block truncate" title={row.assetLabel}>
          {row.assetLabel}
        </span>
      ),
      sortable: true,
      headerClassName: 'w-[15%]',
    },
    {
      id: 'txType',
      header: 'Tx Type',
      accessor: (row) => row.txType,
      cell: (row) => <span className="text-zinc-400 block truncate">{row.txType}</span>,
      sortable: true,
      headerClassName: 'w-[100px]',
    },
    {
      id: 'quantityValue',
      header: 'Quantity',
      accessor: (row) => row.quantityValue,
      cell: (row) => <QuantityCell quantity={row.quantity} value={row.quantityValue} />,
      sortable: true,
      sortFn: (a, b) => a.quantityValue - b.quantityValue,
      align: 'right',
      className: 'text-right',
      footer: (rows) => {
        const total = rows.reduce((sum, row) => sum + row.quantityValue, 0);
        return (
          <span className="text-zinc-200 font-medium whitespace-nowrap">
            {total > 0 ? '+' : ''}{total.toLocaleString(undefined, { maximumFractionDigits: 8 })}
          </span>
        );
      },
      headerClassName: 'w-[15%]',
    },
    {
      id: 'notes',
      header: 'Notes',
      accessor: (row) => row.notes ?? '—',
      cell: (row) => (
        <span className="text-zinc-500 block truncate" title={row.notes ?? ''}>
          {row.notes ?? '—'}
        </span>
      ),
      sortable: true,
      headerClassName: 'w-auto',
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (row) => <LedgerRowActions transactionId={row.id} />,
      sortable: false,
      align: 'right',
      className: 'text-right',
      headerClassName: 'w-[120px]',
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
    <>
      <DataTable
        columns={columns}
        rows={rows}
        keyFn={(row) => row.id}
        defaultSort={{ columnId: 'dateTime', direction: 'desc' }}
        globalSearch={{ placeholder: 'Search ledger' }}
        emptyMessage="No ledger transactions found. Once you add transactions, they will appear here."
        rowClassName={() => 'cursor-pointer'}
        toolbar={toolbar}
        enableSelection={true}
        selectedRowIds={selectedIds}
        onSelectionChange={setSelectedIds}
        tableClassName="table-fixed w-full"
        stickyHeader
      />

      {mounted && selectedIds.size > 0 && createPortal(
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-zinc-900 border border-zinc-700 rounded-full px-6 py-3 shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
          <span className="text-sm font-medium text-zinc-200 whitespace-nowrap">
            {selectedIds.size} selected
          </span>
          <div className="h-4 w-px bg-zinc-700" />
          <button
            onClick={() => setIsEditModalOpen(true)}
            className="text-sm text-blue-400 hover:text-blue-300 font-medium transition"
          >
            Edit
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={isDeleting}
            className="text-sm text-rose-400 hover:text-rose-300 font-medium transition disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
          <div className="h-4 w-px bg-zinc-700" />
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-zinc-400 hover:text-zinc-300 transition"
          >
            Cancel
          </button>
        </div>,
        document.body
      )}

      <LedgerBulkEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        selectedCount={selectedIds.size}
        accounts={accounts}
        onConfirm={handleBulkEditConfirm}
      />
    </>
  );
}