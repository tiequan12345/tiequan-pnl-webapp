'use client';

import React from 'react';
import { TrendingUp } from 'lucide-react';
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

// --- DUMMY DATA BASED ON PRD ---

const ASSETS = [
  {
    id: 1,
    symbol: 'BTC',
    name: 'Bitcoin',
    type: 'CRYPTO',
    price: 64230.5,
    balance: 1.25,
    value: 80288.12,
    pnl: 12500.0,
    pnlPct: 18.4,
    mode: 'AUTO',
    updated: '2m ago',
  },
  {
    id: 2,
    symbol: 'ETH',
    name: 'Ethereum',
    type: 'CRYPTO',
    price: 3450.2,
    balance: 10.5,
    value: 36227.1,
    pnl: -2100.0,
    pnlPct: -5.4,
    mode: 'AUTO',
    updated: '2m ago',
  },
  {
    id: 3,
    symbol: 'NVDA',
    name: 'Nvidia',
    type: 'EQUITY',
    price: 890.0,
    balance: 50,
    value: 44500.0,
    pnl: 15000.0,
    pnlPct: 50.8,
    mode: 'AUTO',
    updated: 'Market Close',
  },
  {
    id: 4,
    symbol: 'USD',
    name: 'Cash Reserve',
    type: 'CASH',
    price: 1.0,
    balance: 25000,
    value: 25000.0,
    pnl: 0,
    pnlPct: 0,
    mode: 'MANUAL',
    updated: 'Manual',
  },
  {
    id: 5,
    symbol: 'BAYC',
    name: 'Bored Ape',
    type: 'NFT',
    price: 45000.0,
    balance: 1,
    value: 45000.0,
    pnl: -80000.0,
    pnlPct: -64.0,
    mode: 'MANUAL',
    updated: '3d ago',
  },
];

const ALLOCATION_DATA = [
  { name: 'Crypto', value: 116515 },
  { name: 'Equity', value: 44500 },
  { name: 'Cash', value: 25000 },
  { name: 'NFT', value: 45000 },
];

const VOLATILITY_DATA = [
  { name: 'Volatile', value: 161015 },
  { name: 'Stable', value: 25000 },
  { name: 'Cash-Like', value: 45000 },
];

const COLORS = ['#3b82f6', '#10b981', '#6366f1', '#f59e0b', '#ec4899'];

const formatCurrency = (val: number | string) => {
  const numVal = typeof val === 'string' ? parseFloat(val) : val;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(numVal);
};

export function DashboardView() {
  return (
    <div className="space-y-6">
      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-zinc-400 text-sm font-medium">
              Total Portfolio Value
            </h2>
            <div className="mt-2 flex items-baseline gap-4">
              <span className="text-4xl font-bold text-white">
                $231,015.22
              </span>
              <span className="flex items-center text-emerald-400 text-sm font-medium bg-emerald-500/10 px-2 py-1 rounded">
                <TrendingUp className="w-3 h-3 mr-1" /> +2.4% (24h)
              </span>
            </div>
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

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-zinc-100 font-semibold mb-6">
            Allocation by Asset Type
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RePieChart>
                <Pie
                  data={ALLOCATION_DATA}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {ALLOCATION_DATA.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
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
                  data={VOLATILITY_DATA}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {VOLATILITY_DATA.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
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

      {/* Top Holdings Preview */}
      <Card>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-zinc-100 font-semibold">Top Holdings</h3>
          <button className="text-xs text-blue-400 hover:text-blue-300">
            View All
          </button>
        </div>
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
              {ASSETS.slice(0, 4).map((asset) => (
                <tr key={asset.id} className="group">
                  <td className="py-3 text-zinc-200 font-medium">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px]">
                        {asset.symbol[0]}
                      </div>
                      {asset.name}{' '}
                      <span className="text-zinc-500">({asset.symbol})</span>
                    </div>
                  </td>
                  <td className="py-3 text-right">
                    {formatCurrency(asset.price)}
                  </td>
                  <td className="py-3 text-right text-white font-medium">
                    {formatCurrency(asset.value)}
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xs">
                        {((asset.value / 231015) * 100).toFixed(1)}%
                      </span>
                      <div className="w-16 h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500"
                          style={{
                            width: `${(asset.value / 231015) * 100}%`,
                          }}
                        ></div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}