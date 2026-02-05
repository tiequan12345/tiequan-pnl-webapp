'use client';
import { Plus, Upload } from 'lucide-react';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '../_components/ui/Card';
import { DataTable, type DataTableColumn } from '../_components/table/DataTable';
import { HoldingsTable } from '../_components/holdings/HoldingsTable';
import { HoldingsAllocationCharts } from '../_components/charts/HoldingsAllocationCharts';
import { PnlTimeSeriesChart, type PnlTimeSeriesPoint } from '../_components/charts/PnlTimeSeriesChart';
import type { HoldingRow, HoldingsSummary } from '@/lib/holdings';
import { usePrivacy } from '../_contexts/PrivacyContext';

type LedgerItem = {
  id: number;
  dateTime: string;
  accountName: string;
  assetSymbol: string;
  txType: string;
  quantity: number;
  notes: string | null;
};

type LedgerResponse = {
  items: {
    id: number;
    date_time: string;
    account: { name: string };
    asset: { symbol: string };
    tx_type: string;
    quantity: string;
    notes: string | null;
  }[];
};

type HoldingsResponse = {
  rows: HoldingRow[];
  summary: HoldingsSummary;
  baseCurrency: string;
  refreshIntervalMinutes: number;
  timezone: string;
};

type DashboardState = {
  rows: HoldingRow[];
  summary: HoldingsSummary | null;
  baseCurrency: string;
  refreshIntervalMinutes: number;
  lastUpdated: Date | null;
  timezone: string;
  ledgerItems: LedgerItem[];
};

const INITIAL_STATE: DashboardState = {
  rows: [],
  summary: null,
  baseCurrency: 'USD',
  refreshIntervalMinutes: 0,
  lastUpdated: null,
  timezone: 'UTC',
  ledgerItems: [],
};



function baseFormatCurrency(value: number | null | undefined, currency: string) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'Unpriced';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: Date | null, timezone: string) {
  if (!value) {
    return 'Unknown';
  }
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'UTC',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}



export function DashboardView() {
  const router = useRouter();
  const { isPrivacyMode } = usePrivacy();
  const [state, setState] = useState<DashboardState>(INITIAL_STATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [pnlPoints, setPnlPoints] = useState<PnlTimeSeriesPoint[]>([]);
  const [pnlTimezone, setPnlTimezone] = useState('UTC');
  const [pnlLoading, setPnlLoading] = useState(false);
  const [pnlError, setPnlError] = useState<string | null>(null);

  const formatCurrency = useCallback(
    (value: number | null | undefined, currency: string) => {
      if (isPrivacyMode) {
        return '****';
      }
      return baseFormatCurrency(value, currency);
    },
    [isPrivacyMode]
  );

  const normalizeDateValue = (
    value: string | Date | null | undefined,
  ): Date | null => {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const fetchHoldings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/holdings?view=consolidated', {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Failed to load holdings');
      }
      const payload = (await response.json()) as HoldingsResponse;
      const rawSummary: HoldingsSummary = payload.summary ?? {
        totalValue: 0,
        totalCostBasis: null,
        totalUnrealizedPnl: null,
        byType: {},
        byVolatility: {},
        updatedAt: null,
        autoUpdatedAt: null,
        hasAutoAssets: false,
      };

      const normalizedSummary: HoldingsSummary = {
        ...rawSummary,
        updatedAt: normalizeDateValue(rawSummary.updatedAt),
        autoUpdatedAt: normalizeDateValue(rawSummary.autoUpdatedAt),
      };
      const updatedAt = normalizedSummary.updatedAt;

      setState((prev) => ({
        ...prev,
        rows: payload.rows ?? [],
        summary: normalizedSummary,
        baseCurrency: payload.baseCurrency ?? 'USD',
        refreshIntervalMinutes: payload.refreshIntervalMinutes ?? 0,
        lastUpdated: updatedAt,
        timezone: payload.timezone ?? 'UTC',
      }));
    } catch (fetchError) {
      console.error(fetchError);
      setError('Unable to load holdings right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRecentLedger = useCallback(async () => {
    setLedgerLoading(true);
    setLedgerError(null);
    try {
      const response = await fetch('/api/ledger?page=1&pageSize=10', {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Failed to load recent activity');
      }
      const payload = (await response.json()) as LedgerResponse;
      const items =
        payload.items?.map((item) => ({
          id: item.id,
          dateTime: item.date_time,
          accountName: item.account.name,
          assetSymbol: item.asset.symbol,
          txType: item.tx_type,
          quantity: Number(item.quantity),
          notes: item.notes,
        })) ?? [];

      setState((prev) => ({
        ...prev,
        ledgerItems: items,
      }));
    } catch (ledgerErr) {
      console.error(ledgerErr);
      setLedgerError('Unable to load recent activity.');
    } finally {
      setLedgerLoading(false);
    }
  }, []);

  const fetchPnlHistory = useCallback(async () => {
    setPnlLoading(true);
    setPnlError(null);

    try {
      const now = new Date();
      const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const params = new URLSearchParams({
        from: from.toISOString(),
        to: now.toISOString(),
      });

      const response = await fetch(`/api/pnl?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Failed to load portfolio history');
      }

      const payload = (await response.json()) as {
        baseCurrency: string;
        timezone?: string;
        points: PnlTimeSeriesPoint[];
      };

      setPnlPoints(payload.points ?? []);
      setPnlTimezone(payload.timezone ?? 'UTC');
    } catch (pnlError) {
      console.error(pnlError);
      setPnlError('Unable to load PNL history.');
    } finally {
      setPnlLoading(false);
    }
  }, []);


  useEffect(() => {
    fetchHoldings();
    fetchRecentLedger();
    fetchPnlHistory();
  }, [fetchHoldings, fetchRecentLedger, fetchPnlHistory]);

  const totalCurrency = state.baseCurrency;

  const latestSnapshot = pnlPoints[pnlPoints.length - 1];
  const earliestSnapshot = pnlPoints[0];
  const latestHoldingsValue = state.summary?.totalValue ?? 0;
  const pnlLatestValue = latestHoldingsValue || (latestSnapshot?.totalValue ?? 0);
  const pnlEarliestValue = pnlPoints.length > 0 ? earliestSnapshot?.totalValue ?? 0 : 0;
  const pnlChangeValue = pnlLatestValue - pnlEarliestValue;
  const pnlChangePercent =
    pnlEarliestValue !== 0 ? (pnlChangeValue / pnlEarliestValue) * 100 : undefined;
  const pnlChangeClass = pnlChangeValue > 0 ? 'text-emerald-400' : pnlChangeValue < 0 ? 'text-rose-400' : 'text-zinc-500';
  const pnlRangeLabel = 'Last 24h';

  const handleAddTrade = useCallback(() => {
    router.push('/ledger');
  }, [router]);

  const handleImportCsv = useCallback(() => {
    router.push('/ledger/import');
  }, [router]);

  const recentColumns = useMemo<DataTableColumn<LedgerItem>[]>(
    () => [
      {
        id: 'dateTime',
        header: 'Date',
        accessor: (row) => new Date(row.dateTime).getTime(),
        cell: (row) => (
          <span className="text-zinc-200">
            {formatDateTime(new Date(row.dateTime), state.timezone)}
          </span>
        ),
        sortable: true,
      },
      {
        id: 'accountName',
        header: 'Account',
        accessor: (row) => row.accountName,
        cell: (row) => <span className="text-zinc-300">{row.accountName}</span>,
        sortable: true,
      },
      {
        id: 'assetSymbol',
        header: 'Asset',
        accessor: (row) => row.assetSymbol,
        cell: (row) => <span className="text-zinc-300">{row.assetSymbol}</span>,
        sortable: true,
      },
      {
        id: 'quantity',
        header: 'Quantity',
        accessor: (row) => row.quantity,
        cell: (row) => (
          <span className="text-zinc-200">
            {isPrivacyMode ? '****' : row.quantity.toLocaleString()}
          </span>
        ),
        sortable: true,
        align: 'right',
        className: 'text-right',
      },
      {
        id: 'txType',
        header: 'Type',
        accessor: (row) => row.txType,
        cell: (row) => <span className="text-zinc-400">{row.txType}</span>,
        sortable: true,
      },
      {
        id: 'notes',
        header: 'Notes',
        accessor: (row) => row.notes ?? '—',
        cell: (row) => (
          <span className="text-zinc-500 inline-block max-w-[200px] truncate align-bottom" title={row.notes ?? ''}>
            {row.notes ?? '—'}
          </span>
        ),
        sortable: true,
      },
    ],
    [state.timezone, isPrivacyMode]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
                Total Portfolio Value
              </p>
              <div className="mt-2 text-4xl sm:text-5xl font-bold tracking-tight text-white mb-2">
                {formatCurrency(pnlLatestValue, totalCurrency)}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className={pnlChangeClass}>
                  {isPrivacyMode
                    ? '****'
                    : pnlChangePercent !== undefined
                      ? `${pnlChangePercent >= 0 ? '+' : ''}${pnlChangePercent.toFixed(2)}%`
                      : '—'}
                </span>
                <span className={pnlChangeClass}>
                  {isPrivacyMode
                    ? '****'
                    : Number.isFinite(pnlChangeValue)
                      ? `${pnlChangeValue >= 0 ? '+' : ''}${baseFormatCurrency(pnlChangeValue, totalCurrency)}`
                      : '—'}
                </span>
                <span className="text-zinc-500">vs {pnlRangeLabel}</span>
              </div>
            </div>
            <div className="text-xs text-zinc-500">
              {pnlTimezone} · {pnlRangeLabel} · {pnlPoints.length} snapshots
            </div>
          </div>
          {pnlLoading ? (
            <div className="px-4 py-10 text-center text-sm text-zinc-500">
              Loading PNL history…
            </div>
          ) : pnlError ? (
            <div className="px-4 py-10 text-center text-sm text-rose-300">
              {pnlError}
            </div>
          ) : (
            <PnlTimeSeriesChart
              data={pnlPoints}
              baseCurrency={totalCurrency}
              timezone={pnlTimezone}
              height={220}
              isPrivacyMode={isPrivacyMode}
            />
          )}
        </Card>

        <Card className="rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl">
          <h2 className="text-xs uppercase tracking-wider text-zinc-400 font-semibold mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 gap-4">
            <button
              onClick={handleAddTrade}
              className="group relative overflow-hidden flex flex-col items-center justify-center p-4 rounded-xl border border-white/5 bg-zinc-900/50 hover:bg-zinc-800/50 hover:border-blue-500/30 transition-all duration-300"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative mb-3 p-3 rounded-full bg-blue-500/10 text-blue-400 group-hover:scale-110 group-hover:bg-blue-500/20 transition-all duration-300">
                <Plus className="w-5 h-5" />
              </div>
              <span className="relative text-sm font-medium text-zinc-200 group-hover:text-blue-100 transition-colors">Add Trade</span>
              <span className="relative text-[10px] uppercase tracking-wider text-zinc-500 mt-1 group-hover:text-zinc-400 transition-colors">Manual Entry</span>
            </button>

            <button
              onClick={handleImportCsv}
              className="group relative overflow-hidden flex flex-col items-center justify-center p-4 rounded-xl border border-white/5 bg-zinc-900/50 hover:bg-zinc-800/50 hover:border-emerald-500/30 transition-all duration-300"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative mb-3 p-3 rounded-full bg-emerald-500/10 text-emerald-400 group-hover:scale-110 group-hover:bg-emerald-500/20 transition-all duration-300">
                <Upload className="w-5 h-5" />
              </div>
              <span className="relative text-sm font-medium text-zinc-200 group-hover:text-emerald-100 transition-colors">Import CSV</span>
              <span className="relative text-[10px] uppercase tracking-wider text-zinc-500 mt-1 group-hover:text-zinc-400 transition-colors">Bulk Upload</span>
            </button>
          </div>
        </Card>
      </div>

      <HoldingsAllocationCharts
        summary={state.summary}
        rows={state.rows}
        baseCurrency={totalCurrency}
        isPrivacyMode={isPrivacyMode}
      />


      <Card className="rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">Top Holdings</h3>
          <button className="text-xs text-blue-400 hover:text-blue-300">
            View All
          </button>
        </div>
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500">
            Loading holdings…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <HoldingsTable
              rows={state.rows}
              baseCurrency={totalCurrency}
              limit={5}
              showPriceSourceBadges={false}
              priceFormatter={formatCurrency}
              emptyMessage="No holdings found yet. Add ledger transactions to populate the dashboard."
            />
          </div>
        )}
      </Card>

      <Card className="rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">Recent Activity</h3>
          <button
            onClick={handleAddTrade}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            View Ledger
          </button>
        </div>
        {ledgerLoading ? (
          <div className="px-4 py-6 text-center text-sm text-zinc-500">
            Loading recent activity…
          </div>
        ) : ledgerError ? (
          <div className="px-4 py-6 text-center text-sm text-rose-300">
            {ledgerError}
          </div>
        ) : state.ledgerItems.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-zinc-500">
            No recent transactions. Add a trade to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <DataTable
              columns={recentColumns}
              rows={state.ledgerItems}
              keyFn={(row) => row.id}
              defaultSort={{ columnId: 'dateTime', direction: 'desc' }}
              globalSearch={{ placeholder: 'Search recent activity' }}
              rowClassName={() => 'hover:bg-zinc-800/30'}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
