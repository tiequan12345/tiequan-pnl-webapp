'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card } from '../_components/ui/Card';
import { DateRangePicker, type DateRange } from '../_components/ui/DateRangePicker';
import { HoldingsFilters } from '../holdings/HoldingsFilters';
import { PnlTimeSeriesChart } from '../_components/charts/PnlTimeSeriesChart';
import { DataTable, type DataTableColumn } from '../_components/table/DataTable';

type PnlAssetSummary = {
  assetId: number;
  symbol: string;
  name: string;
  type: string;
  volatilityBucket: string;
  value: number;
  quantity: number;
  price: number;
};

type PnlApiPoint = {
  snapshotId: number;
  snapshotAt: string;
  totalValue: number;
  byType: Record<string, number>;
  byVolatility: Record<string, number>;
  byAccount: Record<number, { name: string; value: number }>;
  byAsset: Record<number, PnlAssetSummary>;
};

type AssetChangeRow = PnlAssetSummary & {
  previousValue: number | null;
  change: number | null;
  changePct: number | null;
};

type AssetStatus = 'ACTIVE' | 'INACTIVE';

type AssetStatusResponse = {
  id: number;
  status?: AssetStatus | null;
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

const formatCurrencyValue = (
  value: number | null | undefined,
  currency: string,
  fallback = '—',
) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return fallback;
  }
  return formatCurrency(value, currency);
};

const formatChangeClass = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'text-zinc-500';
  }
  return value > 0 ? 'text-emerald-400' : value < 0 ? 'text-rose-400' : 'text-zinc-400';
};

const formatChangePercent = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
};

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

const formatRangeLabel = (
  from: string | null | undefined,
  to: string | null | undefined,
  timezone: string,
) => {
  if (!from && !to) {
    return 'Last 24h';
  }

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if ((fromDate && Number.isNaN(fromDate.getTime())) || (toDate && Number.isNaN(toDate.getTime()))) {
    return 'Custom range';
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const fromLabel = fromDate ? formatter.format(fromDate) : 'Start';
  const toLabel = toDate ? formatter.format(toDate) : 'Now';
  return `${fromLabel} → ${toLabel}`;
};

const getPresetRangeLabel = (
  from: string | null | undefined,
  to: string | null | undefined,
): string | null => {
  if (!from && !to) {
    return 'Last 24h';
  }

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (!fromDate || Number.isNaN(fromDate.getTime())) {
    return null;
  }

  if (fromDate.getTime() === 0) {
    return 'All time';
  }

  const end = toDate && !Number.isNaN(toDate.getTime()) ? toDate : null;
  if (!end) {
    return null;
  }

  const diff = end.getTime() - fromDate.getTime();
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  const tolerance = hour;

  if (Math.abs(diff - day) <= tolerance) {
    return 'Last 24h';
  }
  if (Math.abs(diff - 3 * day) <= tolerance) {
    return 'Last 3 days';
  }
  if (Math.abs(diff - 7 * day) <= tolerance) {
    return 'Last 7 days';
  }
  if (Math.abs(diff - 30 * day) <= 2 * hour) {
    return 'Last 30 days';
  }

  return null;
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
  const [assetStatusMap, setAssetStatusMap] = useState<Record<number, AssetStatus | null>>({});

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

  const pickerRange = useMemo(() => {
    if (parsedFilters.from || parsedFilters.to) {
      return {
        from: parsedFilters.from ? new Date(parsedFilters.from) : undefined,
        to: parsedFilters.to ? new Date(parsedFilters.to) : undefined,
      };
    }
    const now = new Date();
    return {
      from: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      to: now,
    };
  }, [parsedFilters.from, parsedFilters.to]);

  // Handle default "Last 24 Hours" on mount if no dates specified
  useEffect(() => {
    const params = new URLSearchParams(searchKey);
    if (!params.has('from') && !params.has('to')) {
      const now = new Date();
      const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const to = now.toISOString();
      params.set('from', from);
      params.set('to', to);
      const target = pathname ?? '/pnl';
      const query = params.toString();
      router.replace(query ? `${target}?${query}` : target);
    }
  }, [pathname, router, searchKey]);

  useEffect(() => {
    const abortController = new AbortController();
    fetch('/api/assets', { cache: 'no-store', signal: abortController.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Unable to load assets');
        }
        const payload = (await response.json()) as AssetStatusResponse[];
        if (!Array.isArray(payload)) {
          return;
        }
        const nextMap: Record<number, AssetStatus | null> = {};
        payload.forEach((asset) => {
          nextMap[asset.id] = asset.status ?? null;
        });
        setAssetStatusMap(nextMap);
      })
      .catch((fetchError) => {
        if (abortController.signal.aborted) return;
        console.error(fetchError);
      });

    return () => abortController.abort();
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
  const earliestPoint = points[0];
  const latestValue = latestPoint?.totalValue ?? 0;
  const earliestValue = earliestPoint?.totalValue ?? 0;
  const changeValue = latestValue - earliestValue;
  const changePercent = earliestValue ? (changeValue / earliestValue) * 100 : undefined;
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
  const presetRangeLabel = getPresetRangeLabel(parsedFilters.from, parsedFilters.to);
  const rangeLabel = presetRangeLabel ?? formatRangeLabel(parsedFilters.from, parsedFilters.to, timezone);
  const rangeCompareLabel = presetRangeLabel ? `vs ${presetRangeLabel}` : 'vs range start';

  const assetChanges = useMemo<AssetChangeRow[]>(() => {
    const latestAssets = Object.values(latestPoint?.byAsset ?? {});
    const earliestAssets = earliestPoint?.byAsset ?? {};
    return latestAssets
      .map<AssetChangeRow | null>((asset) => {
        const status = assetStatusMap[asset.assetId];
        const type = (asset.type ?? '').toUpperCase();
        if (status === 'INACTIVE' || type === 'STABLE' || type === 'OFFLINE' || type === 'CASH') {
          return null;
        }
        const previous = earliestAssets[asset.assetId];
        const previousValue = previous?.value ?? null;
        const previousPrice = previous?.price ?? null;
        const change = previousValue !== null ? asset.value - previousValue : null;
        const changePct =
          previousPrice !== null && previousPrice !== 0
            ? ((asset.price - previousPrice) / previousPrice) * 100
            : null;
        return {
          ...asset,
          previousValue,
          change,
          changePct,
        };
      })
      .filter((asset): asset is AssetChangeRow => asset !== null)
      .sort((a, b) => b.value - a.value);
  }, [latestPoint, earliestPoint, assetStatusMap]);

  const assetColumns = useMemo<DataTableColumn<AssetChangeRow>[]>(
    () => [
      {
        id: 'asset',
        header: 'Asset',
        accessor: (row) => `${row.symbol} ${row.name}`,
        cell: (row) => (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-zinc-800 text-sm font-semibold text-zinc-200 flex items-center justify-center">
              {row.symbol?.[0] ?? ''}
            </div>
            <div>
              <div className="font-semibold text-zinc-200">{row.symbol}</div>
              <div className="text-xs text-zinc-500">{row.name}</div>
            </div>
          </div>
        ),
        sortable: true,
      },
      {
        id: 'changePct',
        header: '% Change',
        accessor: (row) => row.changePct ?? -Infinity,
        cell: (row) => (
          <span className={`text-sm ${formatChangeClass(row.changePct)}`}>
            {formatChangePercent(row.changePct)}
          </span>
        ),
        sortable: true,
        sortFn: (a, b) => (a.changePct ?? -Infinity) - (b.changePct ?? -Infinity),
        align: 'right',
        className: 'text-right',
        disableUnsorted: true,
        defaultSortDirection: 'desc',
      },
      {
        id: 'change',
        header: 'Change',
        accessor: (row) => row.change ?? -Infinity,
        cell: (row) => (
          <span className={`text-sm ${formatChangeClass(row.change)}`}>
            {row.change === null
              ? '—'
              : `${row.change >= 0 ? '+' : ''}${formatCurrencyValue(row.change, baseCurrency)}`}
          </span>
        ),
        sortable: true,
        sortFn: (a, b) => (a.change ?? -Infinity) - (b.change ?? -Infinity),
        align: 'right',
        className: 'text-right',
        disableUnsorted: true,
        defaultSortDirection: 'desc',
      },
      {
        id: 'currentValue',
        header: 'Current Value',
        accessor: (row) => row.value,
        cell: (row) => (
          <span className="text-sm text-zinc-200">
            {formatCurrencyValue(row.value, baseCurrency)}
          </span>
        ),
        sortable: true,
        sortFn: (a, b) => a.value - b.value,
        align: 'right',
        className: 'text-right',
        disableUnsorted: true,
        defaultSortDirection: 'desc',
      },
    ],
    [baseCurrency],
  );

  const assetGlobalSearch = {
    placeholder: 'Search assets',
    filterFn: (row: AssetChangeRow, query: string) => {
      const normalized = query.trim().toLowerCase();
      if (!normalized) return true;
      const haystack = `${row.symbol ?? ''} ${row.name ?? ''}`.toLowerCase();
      return haystack.includes(normalized);
    },
  };

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
          from={pickerRange.from}
          to={pickerRange.to}
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
            <p className="text-xs text-zinc-500">Range: {rangeLabel}</p>
          </div>
          <div className="text-sm">
            <p className={changeClass}>
              {changePercent !== undefined
                ? `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`
                : '—'}
            </p>
            <p className={`text-sm ${changeClass}`}>
              {Number.isFinite(changeValue)
                ? `${changeValue >= 0 ? '+' : ''}${formatCurrency(changeValue, baseCurrency)}`
                : '—'}
            </p>
            <p className="text-xs text-zinc-500">{rangeCompareLabel}</p>
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

      <Card className="rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">Asset Changes</p>
            <p className="text-sm text-zinc-500">% change {rangeCompareLabel}</p>
          </div>
          <span className="text-xs text-zinc-500">{rangeLabel}</span>
        </div>
        <div className="mt-4">
          <DataTable
            columns={assetColumns}
            rows={assetChanges}
            keyFn={(row) => row.assetId}
            emptyMessage="No asset snapshot data."
            defaultSort={{ columnId: 'changePct', direction: 'desc' }}
            globalSearch={assetGlobalSearch}
            rowClassName={() => 'hover:bg-zinc-800/30'}
            stickyHeader={true}
          />
        </div>
      </Card>
    </div>
  );
}
