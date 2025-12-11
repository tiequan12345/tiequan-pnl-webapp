'use client';

import React, { useMemo } from 'react';
import {
  PieChart as RePieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  Legend,
} from 'recharts';
import { Card } from '../ui/Card';
import type { HoldingsSummary } from '@/lib/holdings';

export type HoldingsAllocationChartsProps = {
  summary: HoldingsSummary | null | undefined;
  baseCurrency: string;
};

// Color constants moved from DashboardView
const COLORS = ['#3b82f6', '#10b981', '#6366f1', '#f59e0b', '#ec4899', '#8b5cf6'];
const VOLATILITY_COLORS = ['#dc2626', '#059669', '#7c3aed', '#ea580c', '#0891b2', '#be123c'];

// Currency formatter for chart tooltips
function formatCurrency(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'Unpriced';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

type PieTooltipProps = {
  active?: boolean;
  payload?: { payload: { value?: number }; name?: string; value?: number }[];
  total: number;
  currency: string;
};

function PieTooltip({ active, payload, total, currency }: PieTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const entry = payload[0];
  const rawValue =
    typeof entry.value === 'number'
      ? entry.value
      : typeof entry.payload?.value === 'number'
      ? entry.payload.value
      : 0;
  const value = rawValue ?? 0;
  const percent = total > 0 ? (value / total) * 100 : 0;
  const amountLabel = formatCurrency(value, currency);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200">
      <div className="font-semibold">{entry.name}</div>
      <div>
        {amountLabel} / {percent.toFixed(1)}%
      </div>
    </div>
  );
}

// Label generator function
function createPieLabel(total: number) {
  return (entry: { name: string; value: number }) => {
    if (total <= 0 || entry.value <= 0) {
      return '';
    }
    const percent = (entry.value / total) * 100;
    if (percent < 5) {
      return '';
    }
    return `${percent.toFixed(1)}%`;
  };
}

export function HoldingsAllocationCharts({
  summary,
  baseCurrency,
}: HoldingsAllocationChartsProps) {
  const allocationData = useMemo(
    () =>
      Object.entries(summary?.byType ?? {}).map(([name, value]) => ({
        name,
        value,
      })),
    [summary],
  );

  const volatilityData = useMemo(
    () =>
      Object.entries(summary?.byVolatility ?? {}).map(([name, value]) => ({
        name,
        value,
      })),
    [summary],
  );

  const allocationTotal = useMemo(
    () => allocationData.reduce((sum, entry) => sum + entry.value, 0),
    [allocationData],
  );

  const volatilityTotal = useMemo(
    () => volatilityData.reduce((sum, entry) => sum + entry.value, 0),
    [volatilityData],
  );

  return (
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
                labelLine={false}
                label={createPieLabel(allocationTotal)}
              >
                {allocationData.map((entry, index) => (
                  <Cell
                    key={`type-cell-${entry.name}-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <ReTooltip
                content={
                  <PieTooltip
                    total={allocationTotal}
                    currency={baseCurrency}
                  />
                }
                cursor={{ fill: 'transparent' }}
              />
              <Legend verticalAlign="bottom" height={36} iconType="circle" />
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
                labelLine={false}
                label={createPieLabel(volatilityTotal)}
              >
                {volatilityData.map((entry, index) => (
                  <Cell
                    key={`vol-cell-${entry.name}-${index}`}
                    fill={VOLATILITY_COLORS[index % VOLATILITY_COLORS.length]}
                  />
                ))}
              </Pie>
              <ReTooltip
                content={
                  <PieTooltip
                    total={volatilityTotal}
                    currency={baseCurrency}
                  />
                }
                cursor={{ fill: 'transparent' }}
              />
              <Legend verticalAlign="bottom" height={36} iconType="circle" />
            </RePieChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}