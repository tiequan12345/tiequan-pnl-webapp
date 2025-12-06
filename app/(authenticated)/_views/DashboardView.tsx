'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PieChart as RePieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  Legend,
} from 'recharts';
import { Card } from '../_components/ui/Card';
import { Badge } from '../_components/ui/Badge';
import type { HoldingRow, HoldingsSummary } from '@/lib/holdings';
import { isPriceStale } from '@/lib/pricing';

type HoldingsResponse = {
  rows: HoldingRow[];
  summary: HoldingsSummary;
  baseCurrency: string;
  refreshIntervalMinutes: number;
};

type DashboardState = {
  rows: HoldingRow[];
  summary: HoldingsSummary | null;
  baseCurrency: string;
  refreshIntervalMinutes: number;
  lastUpdated: Date | null;
};

const INITIAL_STATE: DashboardState = {
  rows: [],
  summary: null,
  baseCurrency: 'USD',
  refreshIntervalMinutes: 0,
  lastUpdated: null,
};

const COLORS = ['#3b82f6', '#10b981', '#6366f1', '#f59e0b', '#ec4899'];

function formatCurrency(value: number | null | undefined, currency: string) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'Unpriced';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function DashboardView() {
  const [state, setState] = useState<DashboardState>(INITIAL_STATE);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHoldings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/holdings', {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Failed to load holdings');
      }
      const payload = (await response.json()) as HoldingsResponse;
      const normalizedSummary: HoldingsSummary = payload.summary ?? {
        totalValue: 0,
        byType: {},
        byVolatility: {},
        updatedAt: null,
      };
      const updatedAt = normalizedSummary.updatedAt
        ? new Date(normalizedSummary.updatedAt)
        : null;

      setState({
        rows: payload.rows ?? [],
        summary: normalizedSummary,
        baseCurrency: payload.baseCurrency ?? 'USD',
        refreshIntervalMinutes: payload.refreshIntervalMinutes ?? 0,
        lastUpdated: updatedAt,
      });
    } catch (fetchError) {
      console.error(fetchError);
      setError('Unable to load holdings right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch('/api/prices/refresh', {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to refresh prices');
      }
      await fetchHoldings();
    } catch (refreshError) {
      console.error(refreshError);
      setError('Price refresh failed.');
    } finally {
      setRefreshing(false);
    }
  }, [fetchHoldings]);

  useEffect(() => {
    fetchHoldings();
  }, [fetchHoldings]);

  const allocationData = useMemo(() => {
    return Object.entries(state.summary?.byType ?? {}).map(([name, value]) => ({
      name,
      value,
    }));
  }, [state.summary]);

  const volatilityData = useMemo(() => {
    return Object.entries(state.summary?.byVolatility ?? {}).map(
      ([name, value]) => ({
        name,
        value,
      }),
    );
  }, [state.summary]);

  const totalValue = state.summary?.totalValue ?? 0;
  const totalCurrency = state.baseCurrency;
  const lastUpdated = state.lastUpdated;
  const pricesStale =
    !lastUpdated || isPriceStale(lastUpdated, state.refreshIntervalMinutes);
  const staleBadge = pricesStale ? <Badge type="red">Stale prices</Badge> : null;
  const refreshLabel = refreshing ? 'Refreshing…' : 'Refresh Prices';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-zinc-400 text-sm font-medium">
                  Total Portfolio Value
                </h2>
                <div className="mt-2 text-4xl font-bold text-white">
                  {formatCurrency(totalValue, totalCurrency)}
                </div>
                {lastUpdated ? (
                  <div className="text-xs text-zinc-500 mt-1">
                    Updated {lastUpdated.toLocaleString()}
                    {state.refreshIntervalMinutes
                      ? ` · Refresh every ${state.refreshIntervalMinutes} min`
                      : ''}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500 mt-1">
                    Awaiting price data…
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs">
                {staleBadge}
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="bg-zinc-900/60 text-zinc-200 px-3 py-1 rounded-lg border border-zinc-800 text-[11px] transition hover:border-blue-500 disabled:opacity-50"
                >
                  {refreshLabel}
                </button>
              </div>
            </div>
            {error && (
              <div className="mt-4 text-xs text-rose-300">{error}</div>
            )}
          </div>
          <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-blue-500/5 to-transparent pointer-events-none" />
        </Card>

        <Card>
          <h2 className="text-zinc-400 text-sm font-medium mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <button className="flex flex-col items-center justify-center p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg transition text-xs text-zinc-300 gap-2 border border-zinc-700/50">
              <span className="w-5 h-5 rounded-md bg-zinc-900/60 flex items-center justify-center text-zinc-400">
                +
              </span>
              Add Trade
            </button>
            <button className="flex flex-col items-center justify-center p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg transition text-xs text-zinc-300 gap-2 border border-zinc-700/50">
              <span className="w-5 h-5 rounded-md bg-zinc-900/60 flex items-center justify-center text-zinc-400">
                ⬆
              </span>
              Import CSV
            </button>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-zinc-100 font-semibold mb-6">
            Allocation by Asset Type
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RePieChart>
                <Pie
                  data={allocationData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {allocationData.map((entry, index) => (
                    <Cell
                      key={`cell-${entry.name}-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <ReTooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    borderColor: '#27272a',
                    borderRadius: '8px',
                  }}
                  itemStyle={{ color: '#e4e4e7' }}
                  formatter={(value) =>
                    formatCurrency(
                      Array.isArray(value) ? (value[0] as number) : (value as number),
                      totalCurrency,
                    )
                  }
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  iconType="circle"
                />
              </RePieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h3 className="text-zinc-100 font-semibold mb-6">
            Allocation by Risk (Volatility)
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RePieChart>
                <Pie
                  data={volatilityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {volatilityData.map((entry, index) => (
                    <Cell
                      key={`vol-cell-${entry.name}-${index}`}
                      fill={COLORS[(index + 2) % COLORS.length]}
                    />
                  ))}
                </Pie>
                <ReTooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    borderColor: '#27272a',
                    borderRadius: '8px',
                  }}
                  itemStyle={{ color: '#e4e4e7' }}
                  formatter={(value) =>
                    formatCurrency(
                      Array.isArray(value) ? (value[0] as number) : (value as number),
                      totalCurrency,
                    )
                  }
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  iconType="circle"
                />
              </RePieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-zinc-100 font-semibold">Top Holdings</h3>
          <button className="text-xs text-blue-400 hover:text-blue-300">
            View All
          </button>
        </div>
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500">
            Loading holdings…
          </div>
        ) : state.rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500">
            No holdings found yet. Add ledger transactions to populate the dashboard.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-400">
              <thead className="border-b border-zinc-800 text-xs uppercase tracking-wider">
                <tr>
                  <th className="pb-3 font-medium">Asset</th>
                  <th className="pb-3 font-medium text-right">Price</th>
                  <th className="pb-3 font-medium text-right">Value</th>
                  <th className="pb-3 font-medium text-right">Allocation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {state.rows.map((row) => {
                  const allocationPct =
                    totalValue > 0 && row.marketValue
                      ? ((row.marketValue / totalValue) * 100).toFixed(1)
                      : '0.0';
                  const barWidth =
                    totalValue > 0 && row.marketValue
                      ? Math.min(100, Math.max(0, (row.marketValue / totalValue) * 100))
                      : 0;
                  return (
                    <tr key={`${row.assetId}-${row.accountId}`} className="group">
                      <td className="py-3 text-zinc-200 font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px]">
                            {row.assetSymbol?.[0] ?? ''}
                          </div>
                          {row.assetName}{' '}
                          <span className="text-zinc-500">({row.assetSymbol})</span>
                        </div>
                      </td>
                      <td className="py-3 text-right text-zinc-200">
                        {formatCurrency(row.price, totalCurrency)}
                      </td>
                      <td className="py-3 text-right text-white font-medium">
                        {formatCurrency(row.marketValue, totalCurrency)}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs">{allocationPct}%</span>
                          <div className="w-16 h-1 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500"
                              style={{
                                width: `${barWidth}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
