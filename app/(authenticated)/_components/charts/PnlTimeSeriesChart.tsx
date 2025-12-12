'use client';

import React, { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatNumberFinance } from '@/lib/formatters';

export type PnlTimeSeriesPoint = {
  snapshotAt: string;
  totalValue: number;
};

type PnlTimeSeriesChartProps = {
  data: PnlTimeSeriesPoint[];
  baseCurrency: string;
  timezone?: string;
  height?: number;
  isPrivacyMode?: boolean;
};

const formatCurrency = (value: number, currency: string) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
};

const formatDate = (value: number, timezone?: string) => {
  if (!value) {
    return '';
  }
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'UTC',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

export function PnlTimeSeriesChart({
  data,
  baseCurrency,
  timezone,
  height = 260,
  isPrivacyMode,
}: PnlTimeSeriesChartProps) {
  const chartData = useMemo(() => {
    return data
      .map((point) => {
        const timestamp = new Date(point.snapshotAt).getTime();
        if (Number.isNaN(timestamp)) {
          return null;
        }
        return {
          timestamp,
          totalValue: point.totalValue,
        };
      })
      .filter((point): point is { timestamp: number; totalValue: number } => Boolean(point));
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-zinc-900 rounded-xl border border-zinc-800 text-sm text-zinc-500">
        No snapshot data available
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.85} />
              <stop offset="100%" stopColor="#0f172a" stopOpacity={0.2} />
            </linearGradient>
          </defs>
          <CartesianGrid opacity={0.2} strokeDasharray="3 3" />
          <XAxis
            dataKey="timestamp"
            stroke="#4b5563"
            tickFormatter={(value) => formatDate(value, timezone)}
            axisLine={{ stroke: '#1f2937' }}
            tickLine={false}
            minTickGap={20}
          />
          <YAxis
            stroke="#4b5563"
            tickFormatter={(value) =>
              isPrivacyMode ? '****' : formatNumberFinance(Number(value), 0, 2)
            }
            axisLine={{ stroke: '#1f2937' }}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0f172a',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
            }}
            labelFormatter={(value) => formatDate(Number(value), timezone)}
            formatter={(value: number) => [
              isPrivacyMode ? '****' : formatCurrency(value, baseCurrency),
              'Total Value',
            ]}
          />
          <Area
            type="monotone"
            dataKey="totalValue"
            stroke="#60a5fa"
            strokeWidth={2}
            fill="url(#pnlGradient)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
