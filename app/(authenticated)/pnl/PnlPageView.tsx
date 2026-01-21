'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card } from '../_components/ui/Card';
import { DateRangePicker, type DateRange } from '../_components/ui/DateRangePicker';
import { HoldingsFilters } from '../holdings/HoldingsFilters';
import { PnlTimeSeriesChart } from '../_components/charts/PnlTimeSeriesChart';
import { formatCurrencyFinance } from '@/lib/formatters';

type PnlApiPoint = {
  snapshotId: number;
  snapshotAt: string;
  totalValue: number;
  byType: Record<string, number>;
  byVolatility: Record<string, number>;
  byAccount: Record<number, { name: string; value: number }>;
};

function parseNumberList(value?: string | null): number[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((number) => Number.isFinite(number));
}

function parseStringList(value?: string | null): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

const formatCurrency = (value: number, currency: string) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);

const formatSnapshotLabel = (value: string, timezone: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export default function PnlPageView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const [points, setPoints] = useState<PnlApiPoint[]>([]);
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [timezone, setTimezone] = useState('UTC');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedFilters = useMemo(() => {
    const params = new URLSearchParams(searchKey);
    return {
      accountIds: parseNumberList(params.get('accountIds')),
      assetTypes: parseStringList(params.get('assetTypes')),
      volatilityBuckets: parseStringList(params.get('volatilityBuckets')),
      from: params.get('from'),
      to: params.get('to'),
    };
  }, [searchKey]);

  // Handle default "Last 24 Hours" on mount if no dates specified
  useEffect(() => {
    const params = new URLSearchParams(searchKey);
    if (!params.has('from') && !params.has('to')) {
      const now = new Date();
      const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const to = now.toISOString();
      handleParamUpdate('from', from);
      handleParamUpdate('to', to);
    }
  }, []);

  const handleParamUpdate = (key: string, value: string) => {
    const params = new URLSearchParams(searchKey);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    const target = pathname ?? '/pnl';
    const query = params.toString();
    router.push(query ? `${target}?${query}` : target);
  };

  const handleDateRangeChange = (range: DateRange) => {
    const params = new URLSearchParams(searchKey);
    if (range.from) {
      params.set('from', range.from.toISOString());
    } else {
      params.delete('from');
    }
    
    if (range.to) {
      params.set('to', range.to.toISOString());
    } else {
      params.delete('to');
    }
    
    // Remove limit to show all points in range
    params.delete('limit');
    
    const target = pathname ?? '/pnl';
    const query = params.toString();
    router.push(query ? `${target}?${query}` : target);
  };

  useEffect(() => {
    const abortController = new AbortController();
    const params = new URLSearchParams(searchKey);
    
    // Skip fetch if we are just about to redirect to default 24h view
    if (!params.has('from') && !params.has('to')) {
        return;
    }

    const query = params.toString();
    setLoading(true);
    setError(null);

    fetch(`/api/pnl?${query}`, {
      cache: 'no-store',
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Unable to load PNL history');
        }
        const payload = await response.json();
        setPoints(payload.points ?? []);
        setBaseCurrency(payload.baseCurrency ?? 'USD');
        setTimezone(payload.timezone ?? 'UTC');
      })
      .catch((fetchError) => {
        if (abortController.signal.aborted) return;
        console.error(fetchError);
        setError('Unable to load PNL data.');
      })
      .finally(() => setLoading(false));

    return () => abortController.abort();
  }, [searchKey]);

  const latestPoint = points[points.length - 1];
  const previousPoint = points[points.length - 2];
  const latestValue = latestPoint?.totalValue ?? 0;
  const previousValue = previousPoint?.totalValue ?? 0;
  const changeValue = latestValue - previousValue;
  const changePercent = previousValue ? (changeValue / previousValue) * 100 : undefined;
  const changeClass = changeValue > 0 ? 'text-emerald-400' : changeValue < 0 ? 'text-rose-400' : 'text-zinc-500';

  const byTypeEntries = useMemo(() => {
    const entries = Object.entries(latestPoint?.byType ?? {});
    return entries.sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [latestPoint]);

  const byVolatilityEntries = useMemo(() => {
    const entries = Object.entries(latestPoint?.byVolatility ?? {});
    return entries.sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [latestPoint]);

  const byAccountEntries = useMemo(() => {
    const entries = Object.values(latestPoint?.byAccount ?? {}).sort(
      (a, b) => b.value - a.value,
    );
    return entries.slice(0, 4);
  }, [latestPoint]);

  const chartPoints = useMemo(() => {
    return points.map((point) => ({
      snapshotAt: point.snapshotAt,
      totalValue: point.totalValue,
    }));
  }, [points]);

  const snapshotLabel = latestPoint
    ? formatSnapshotLabel(latestPoint.snapshotAt, timezone)
    : 'Awaiting data';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">PNL Over Time</h1>
          <p className="text-sm text-zinc-400">
            USD-denominated snapshots · {points.length} data points
          </p>
        </div>

        <HoldingsFilters
          currentView="per-account"
          currentAccountIds={parsedFilters.accountIds}
          currentAssetTypes={parsedFilters.assetTypes}
          currentVolatilityBuckets={parsedFilters.volatilityBuckets}
          hideViewToggle
        />

        <DateRangePicker
          from={parsedFilters.from ? new Date(parsedFilters.from) : undefined}
          to={parsedFilters.to ? new Date(parsedFilters.to) : undefined}
          onChange={handleDateRangeChange}
        />
      </div>

      <Card className="rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">Latest Snapshot</p>
            <p className="text-3xl font-semibold text-white">
              {formatCurrency(latestValue, baseCurrency)}
            </p>
            <p className="text-sm text-zinc-400">{snapshotLabel}</p>
          </div>
          <div className="text-sm">
            <p className={changeClass}>
              {changePercent !== undefined
                ? `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`
                : '—'}
            </p>
            <p className="text-xs text-zinc-500">vs previous snapshot</p>
          </div>
        </div>
        <div className="mt-6">
          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-zinc-500">
              Loading PNL history…
            </div>
          ) : error ? (
            <div className="px-4 py-10 text-center text-sm text-rose-300">
              {error}
            </div>
          ) : (
            <PnlTimeSeriesChart
              data={chartPoints}
              baseCurrency={baseCurrency}
              timezone={timezone}
              height={240}
            />
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl">
          <p className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">By Asset Type</p>
          {byTypeEntries.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No allocation data</p>
          ) : (
            <div className="mt-3 space-y-2">
              {byTypeEntries.map(([name, value]) => (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-sm text-zinc-300">{name}</span>
                  <span className="text-sm font-semibold text-white">
                    {formatCurrency(value, baseCurrency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl">
          <p className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">By Volatility</p>
          {byVolatilityEntries.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No volatility data</p>
          ) : (
            <div className="mt-3 space-y-2">
              {byVolatilityEntries.map(([name, value]) => (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-sm text-zinc-300">{name}</span>
                  <span className="text-sm font-semibold text-white">
                    {formatCurrency(value, baseCurrency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl">
          <p className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">By Account</p>
          {byAccountEntries.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No account data</p>
          ) : (
            <div className="mt-3 space-y-2">
              {byAccountEntries.map((entry, index) => (
                <div key={`${entry.name}-${index}`} className="flex items-center justify-between">
                  <span className="text-sm text-zinc-300 truncate">{entry.name}</span>
                  <span className="text-sm font-semibold text-white">
                    {formatCurrency(entry.value, baseCurrency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
