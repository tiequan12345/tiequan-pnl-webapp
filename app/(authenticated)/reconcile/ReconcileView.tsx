'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from '../_components/table/DataTable';
import { Badge } from '../_components/ui/Badge';

export type TransferIssueLeg = {
  id: number;
  date_time: string;
  quantity: string;
  account_id: number;
  account_name: string;
  asset_id: number;
  asset_symbol: string;
  asset_name: string;
};

export type TransferIssue = {
  key: string;
  assetId: number;
  dateTime: string;
  issue: 'UNMATCHED' | 'AMBIGUOUS' | 'INVALID_LEGS' | 'FEE_MISMATCH';
  legIds: number[];
  legs: TransferIssueLeg[];
};

type TransferIssueResponse = {
  diagnostics: TransferIssue[];
  total: number;
};

const ISSUE_LABELS: Record<TransferIssue['issue'], { label: string; type: 'default' | 'green' | 'red' | 'blue' | 'orange' }> = {
  UNMATCHED: { label: 'Unmatched', type: 'red' },
  AMBIGUOUS: { label: 'Ambiguous', type: 'orange' },
  INVALID_LEGS: { label: 'Invalid', type: 'red' },
  FEE_MISMATCH: { label: 'Fee Mismatch', type: 'orange' },
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (num: number) => num.toString().padStart(2, '0');
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear().toString().slice(-2)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ReconcileView() {
  const [rows, setRows] = useState<TransferIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);
  const [selectedIssueKeys, setSelectedIssueKeys] = useState<Set<string | number>>(new Set());
  const [bulkResolving, setBulkResolving] = useState(false);

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/ledger/transfer-issues', {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Failed to load transfer issues');
      }
      const payload = (await response.json()) as TransferIssueResponse;
      setRows(payload.diagnostics ?? []);
      setSelectedIssueKeys(new Set());
    } catch (err) {
      console.error(err);
      setError('Failed to load transfer issues.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  const handleResolve = useCallback(
    async (issue: TransferIssue, action: 'MATCH' | 'SEPARATE') => {
      setResolvingKey(issue.key);
      try {
        const response = await fetch('/api/ledger/resolve-transfer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            legIds: issue.legIds,
            action,
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || 'Failed to resolve transfer');
        }

        await fetchIssues();
      } catch (err) {
        console.error(err);
        alert('Failed to resolve transfer.');
      } finally {
        setResolvingKey(null);
      }
    },
    [fetchIssues],
  );

  const handleMatchSelected = useCallback(async () => {
    if (bulkResolving) {
      return;
    }

    const selected = rows.filter((row) => selectedIssueKeys.has(row.key));
    if (selected.length !== 2) {
      alert('Select exactly two issues to match.');
      return;
    }

    const assetIds = new Set(selected.map((row) => row.assetId));
    if (assetIds.size > 1) {
      alert('Selected issues must be for the same asset.');
      return;
    }

    const legIds = Array.from(new Set(selected.flatMap((row) => row.legIds)));
    if (legIds.length < 2) {
      alert('Selected issues do not contain enough legs to match.');
      return;
    }

    setBulkResolving(true);
    try {
      const response = await fetch('/api/ledger/resolve-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legIds,
          action: 'MATCH',
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to match selected issues');
      }

      await fetchIssues();
    } catch (err) {
      console.error(err);
      alert('Failed to match selected issues.');
    } finally {
      setBulkResolving(false);
    }
  }, [bulkResolving, fetchIssues, rows, selectedIssueKeys]);

  const columns: DataTableColumn<TransferIssue>[] = useMemo(
    () => [
      {
        id: 'dateTime',
        header: 'Date / Time',
        accessor: (row) => row.dateTime,
        cell: (row) => (
          <span className="text-zinc-300 whitespace-nowrap">
            {formatDateTime(row.dateTime)}
          </span>
        ),
        sortable: true,
        headerClassName: 'w-[160px]',
      },
      {
        id: 'asset',
        header: 'Asset',
        accessor: (row) => row.legs[0]?.asset_symbol ?? 'Unknown',
        cell: (row) => {
          const leg = row.legs[0];
          if (!leg) {
            return <span className="text-zinc-400">Unknown</span>;
          }
          return (
            <span className="text-zinc-200 font-semibold">
              {leg.asset_symbol}
            </span>
          );
        },
        sortable: true,
        headerClassName: 'w-[80px]',
      },
      {
        id: 'issue',
        header: 'Issue',
        accessor: (row) => row.issue,
        cell: (row) => {
          const info = ISSUE_LABELS[row.issue];
          return <Badge type={info.type}>{info.label}</Badge>;
        },
        sortable: true,
        headerClassName: 'w-[140px]',
      },
      {
        id: 'legs',
        header: 'Legs',
        cell: (row) => {
          if (row.legs.length === 0) {
            return <span className="text-zinc-500">No legs found</span>;
          }
          return (
            <div className="space-y-1">
              {row.legs.map((leg) => (
                <div key={leg.id} className="text-xs text-zinc-300">
                  <span className="font-medium text-zinc-100">{leg.account_name}</span>{' '}
                  <span className={Number(leg.quantity) < 0 ? 'text-rose-400' : 'text-emerald-400'}>
                    {Number(leg.quantity) < 0 ? '' : '+'}{leg.quantity}
                  </span>
                </div>
              ))}
            </div>
          );
        },
        sortable: false,
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: (row) => {
          const isResolving = resolvingKey === row.key;
          const canMatch = row.legIds.length >= 2;
          return (
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                disabled={!canMatch || isResolving}
                onClick={() => handleResolve(row, 'MATCH')}
                className={`px-2.5 py-1 text-xs rounded-md border border-emerald-500/30 ${
                  !canMatch || isResolving
                    ? 'text-zinc-500 bg-zinc-900/40 cursor-not-allowed'
                    : 'text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20'
                }`}
              >
                Match
              </button>
              <button
                type="button"
                disabled={isResolving}
                onClick={() => handleResolve(row, 'SEPARATE')}
                className={`px-2.5 py-1 text-xs rounded-md border border-orange-500/30 ${
                  isResolving
                    ? 'text-zinc-500 bg-zinc-900/40 cursor-not-allowed'
                    : 'text-orange-200 bg-orange-500/10 hover:bg-orange-500/20'
                }`}
              >
                Separate
              </button>
            </div>
          );
        },
        sortable: false,
        align: 'right',
        className: 'text-right',
        headerClassName: 'w-[160px]',
      },
    ],
    [handleResolve, resolvingKey],
  );

  const toolbar = (
    <div className="flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
      <span>{rows.length === 1 ? '1 issue' : `${rows.length} issues`}</span>
      <button
        type="button"
        onClick={fetchIssues}
        className="px-2 py-1 rounded-md border border-white/5 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
      >
        Refresh
      </button>
      <button
        type="button"
        onClick={handleMatchSelected}
        disabled={selectedIssueKeys.size !== 2 || bulkResolving}
        className={`px-2 py-1 rounded-md border border-emerald-500/30 ${
          selectedIssueKeys.size !== 2 || bulkResolving
            ? 'text-zinc-500 bg-zinc-900/40 cursor-not-allowed'
            : 'text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20'
        }`}
      >
        Match Selected
      </button>
      <button
        type="button"
        onClick={() => setSelectedIssueKeys(new Set())}
        disabled={selectedIssueKeys.size === 0 || bulkResolving}
        className={`px-2 py-1 rounded-md border border-white/5 ${
          selectedIssueKeys.size === 0 || bulkResolving
            ? 'text-zinc-500 bg-zinc-900/40 cursor-not-allowed'
            : 'text-zinc-300 bg-zinc-900 hover:bg-zinc-800'
        }`}
      >
        Clear Selection
      </button>
      {loading && <span className="text-zinc-600">Loading…</span>}
      {error && <span className="text-rose-400">{error}</span>}
    </div>
  );

  const globalSearch = useMemo(
    () => ({
      placeholder: 'Search by account or asset',
      filterFn: (row: TransferIssue, query: string) => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return true;
        const asset = row.legs[0]?.asset_symbol?.toLowerCase() ?? '';
        const accounts = row.legs.map((leg) => leg.account_name.toLowerCase()).join(' ');
        return asset.includes(normalized) || accounts.includes(normalized);
      },
    }),
    [],
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      keyFn={(row) => row.key}
      toolbar={toolbar}
      emptyMessage="No transfer issues found."
      defaultSort={{ columnId: 'dateTime', direction: 'desc' }}
      globalSearch={globalSearch}
      stickyHeader
      enableSelection
      selectedRowIds={selectedIssueKeys}
      onSelectionChange={setSelectedIssueKeys}
    />
  );
}
