'use client';

import React, { useMemo, useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Sector,
} from 'recharts';
import { Card } from '../ui/Card';
import type { HoldingsSummary } from '@/lib/holdings';

// Best-in-class dark/neon palette
const COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#6366f1', // Indigo
  '#84cc16', // Lime
];

const VOLATILITY_COLORS = [
  '#ef4444', // Red (High Risk)
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green (Low Risk)
  '#06b6d4', // Cyan
  '#a855f7', // Purple
  '#ec4899', // Pink
];

export type HoldingsAllocationChartsProps = {
  summary: HoldingsSummary | null | undefined;
  baseCurrency: string;
};

type ChartData = {
  name: string;
  value: number;
  color: string;
};

// Format large numbers cleanly for charts
function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercentage(value: number, total: number) {
  if (total === 0) return '0%';
  return ((value / total) * 100).toFixed(1) + '%';
}

// Custom active shape with neon glow effect
const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        cornerRadius={6}
      />
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 10}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        className="opacity-20"
        cornerRadius={8}
      />
    </g>
  );
};

function DonutChart({
  title,
  data,
  currency,
}: {
  title: string;
  data: ChartData[];
  currency: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | undefined>();
  
  const total = useMemo(() => data.reduce((sum, item) => sum + item.value, 0), [data]);
  const activeItem = activeIndex !== undefined ? data[activeIndex] : null;

  if (data.length === 0) {
    return (
      <Card className="flex items-center justify-center min-h-[320px]">
        <div className="text-zinc-500 text-sm">No {title.toLowerCase()} data</div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-full min-h-[320px]">
      <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-6">
        {title}
      </h3>
      
      <div className="flex flex-col xl:flex-row items-center gap-8 flex-1">
        {/* Chart Container */}
        <div className="relative w-64 h-64 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                activeIndex={activeIndex}
                activeShape={renderActiveShape}
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={75}
                outerRadius={95}
                paddingAngle={3}
                dataKey="value"
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(undefined)}
                stroke="none"
                cornerRadius={5}
                startAngle={90}
                endAngle={-270}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color}
                    stroke="rgba(0,0,0,0)"
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          
          {/* Center Info */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
            <div className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">
              {activeItem ? activeItem.name : 'Total Value'}
            </div>
            <div className="text-2xl font-bold text-white tracking-tight mt-0.5">
              {activeItem
                ? formatCurrency(activeItem.value, currency)
                : formatCurrency(total, currency)}
            </div>
            {activeItem && (
               <div className="text-xs text-zinc-400 font-medium bg-zinc-800/50 px-2 py-0.5 rounded-full mt-1">
                 {formatPercentage(activeItem.value, total)}
               </div>
            )}
          </div>
        </div>

        {/* Interactive Legend */}
        <div className="flex-1 w-full overflow-y-auto max-h-64 pr-1">
          <div className="flex flex-col gap-1">
            {data.map((item, index) => {
              const isActive = activeIndex === index;
              return (
                <button
                  key={item.name}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(undefined)}
                  className={`group flex items-center justify-between w-full p-2.5 rounded-lg transition-all duration-200 border border-transparent ${
                    isActive
                      ? 'bg-zinc-800/80 border-zinc-700/50 shadow-sm'
                      : 'hover:bg-zinc-800/40 hover:border-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${isActive ? 'scale-110 shadow-[0_0_8px_currentColor]' : ''}`}
                      style={{ backgroundColor: item.color, color: item.color }}
                    />
                    <span className={`text-sm font-medium truncate transition-colors ${isActive ? 'text-zinc-100' : 'text-zinc-400 group-hover:text-zinc-300'}`}>
                      {item.name}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 ml-4">
                    <span className={`text-sm font-semibold transition-colors ${isActive ? 'text-white' : 'text-zinc-300'}`}>
                      {formatCurrency(item.value, currency)}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-medium">
                      {formatPercentage(item.value, total)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function HoldingsAllocationCharts({
  summary,
  baseCurrency,
}: HoldingsAllocationChartsProps) {
  const allocationData = useMemo(() => {
    if (!summary?.byType) return [];
    return Object.entries(summary.byType)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .map((item, index) => ({
        ...item,
        color: COLORS[index % COLORS.length],
      }));
  }, [summary]);

  const volatilityData = useMemo(() => {
    if (!summary?.byVolatility) return [];

    const VOLATILITY_COLOR_MAP: Record<string, string> = {
      'VOLATILE': '#ef4444',   // Red
      'CASH_LIKE': '#10b981',  // Emerald Green
    };

    return Object.entries(summary.byVolatility)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .map((item, index) => ({
        ...item,
        color: VOLATILITY_COLOR_MAP[item.name] ?? VOLATILITY_COLORS[index % VOLATILITY_COLORS.length],
      }));
  }, [summary]);

  if (allocationData.length === 0 && volatilityData.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <DonutChart
        title="Allocation by Asset Type"
        data={allocationData}
        currency={baseCurrency}
      />
      <DonutChart
        title="Risk Profile (Volatility)"
        data={volatilityData}
        currency={baseCurrency}
      />
    </div>
  );
}