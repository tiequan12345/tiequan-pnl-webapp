"use client";

import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Wallet, 
  PieChart, 
  ArrowRightLeft, 
  Settings, 
  Plus, 
  Search, 
  Download, 
  Upload, 
  RefreshCw,
  MoreHorizontal,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Landmark,
  Layers
} from 'lucide-react';
import { 
  PieChart as RePieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip as ReTooltip,
  Legend
} from 'recharts';

// --- DUMMY DATA BASED ON PRD ---

const ASSETS = [
  { id: 1, symbol: 'BTC', name: 'Bitcoin', type: 'CRYPTO', price: 64230.50, balance: 1.25, value: 80288.12, pnl: 12500.00, pnlPct: 18.4, mode: 'AUTO', updated: '2m ago' },
  { id: 2, symbol: 'ETH', name: 'Ethereum', type: 'CRYPTO', price: 3450.20, balance: 10.5, value: 36227.10, pnl: -2100.00, pnlPct: -5.4, mode: 'AUTO', updated: '2m ago' },
  { id: 3, symbol: 'NVDA', name: 'Nvidia', type: 'EQUITY', price: 890.00, balance: 50, value: 44500.00, pnl: 15000.00, pnlPct: 50.8, mode: 'AUTO', updated: 'Market Close' },
  { id: 4, symbol: 'USD', name: 'Cash Reserve', type: 'CASH', price: 1.00, balance: 25000, value: 25000.00, pnl: 0, pnlPct: 0, mode: 'MANUAL', updated: 'Manual' },
  { id: 5, symbol: 'BAYC', name: 'Bored Ape', type: 'NFT', price: 45000.00, balance: 1, value: 45000.00, pnl: -80000.00, pnlPct: -64.0, mode: 'MANUAL', updated: '3d ago' },
];

const ACCOUNTS = [
  { id: 1, name: 'Coinbase Pro', type: 'CEX', platform: 'Coinbase', status: 'ACTIVE', value: 45200.00 },
  { id: 2, name: 'Ledger Cold', type: 'WALLET', platform: 'Hardware', status: 'ACTIVE', value: 116515.22 },
  { id: 3, name: 'Chase Checking', type: 'BANK', platform: 'Chase', status: 'ACTIVE', value: 25000.00 },
  { id: 4, name: 'Robinhood', type: 'BROKER', platform: 'Robinhood', status: 'INACTIVE', value: 0.00 },
];

const TRANSACTIONS = [
  { id: 1, date: '2023-10-24 14:30', type: 'TRADE_BUY', asset: 'BTC', amount: 0.5, price: 63000, value: 31500, account: 'Coinbase Pro' },
  { id: 2, date: '2023-10-23 09:15', type: 'DEPOSIT', asset: 'USD', amount: 5000, price: 1, value: 5000, account: 'Chase Checking' },
  { id: 3, date: '2023-10-22 18:45', type: 'TRADE_SELL', asset: 'SOL', amount: 100, price: 120, value: 12000, account: 'Coinbase Pro' },
  { id: 4, date: '2023-10-20 11:00', type: 'NFT_PURCHASE', asset: 'BAYC', amount: 1, price: 45000, value: 45000, account: 'Ledger Cold' },
  { id: 5, date: '2023-10-15 10:00', type: 'YIELD', asset: 'USDC', amount: 50, price: 1, value: 50, account: 'Coinbase Pro' },
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

// --- COMPONENTS ---

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-zinc-900 border border-zinc-800 rounded-xl p-6 ${className}`}>
    {children}
  </div>
);

const Badge = ({ children, type = 'default' }: { children: React.ReactNode; type?: string }) => {
  const styles: Record<string, string> = {
    default: 'bg-zinc-800 text-zinc-300',
    green: 'bg-emerald-500/10 text-emerald-400',
    red: 'bg-rose-500/10 text-rose-400',
    blue: 'bg-blue-500/10 text-blue-400',
    orange: 'bg-orange-500/10 text-orange-400',
  };
  return (
    <span className={`px-2 py-1 rounded-md text-xs font-medium ${styles[type] || styles.default}`}>
      {children}
    </span>
  );
};

const formatCurrency = (val: number | string) => {
  const numVal = typeof val === 'string' ? parseFloat(val) : val;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(numVal);
};

// --- VIEWS ---

const DashboardView = () => (
  <div className="space-y-6">
    {/* Hero Stats */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="md:col-span-2 relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-zinc-400 text-sm font-medium">Total Portfolio Value</h2>
          <div className="mt-2 flex items-baseline gap-4">
            <span className="text-4xl font-bold text-white">$231,015.22</span>
            <span className="flex items-center text-emerald-400 text-sm font-medium bg-emerald-500/10 px-2 py-1 rounded">
              <TrendingUp className="w-3 h-3 mr-1" /> +2.4% (24h)
            </span>
          </div>
        </div>
        <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-blue-500/5 to-transparent pointer-events-none" />
      </Card>
      
      <Card>
        <h2 className="text-zinc-400 text-sm font-medium mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          <button className="flex flex-col items-center justify-center p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg transition text-xs text-zinc-300 gap-2 border border-zinc-700/50">
            <Plus className="w-5 h-5" /> Add Trade
          </button>
          <button className="flex flex-col items-center justify-center p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg transition text-xs text-zinc-300 gap-2 border border-zinc-700/50">
            <Upload className="w-5 h-5" /> Import CSV
          </button>
        </div>
      </Card>
    </div>

    {/* Charts */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <h3 className="text-zinc-100 font-semibold mb-6">Allocation by Asset Type</h3>
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
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <ReTooltip 
                contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                itemStyle={{ color: '#e4e4e7' }}
                formatter={(value) => formatCurrency(Array.isArray(value) ? value[0] : value)}
              />
              <Legend verticalAlign="bottom" height={36} iconType="circle" />
            </RePieChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <h3 className="text-zinc-100 font-semibold mb-6">Allocation by Risk (Volatility)</h3>
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
                  <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                ))}
              </Pie>
              <ReTooltip 
                 contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                 itemStyle={{ color: '#e4e4e7' }}
                 formatter={(value) => formatCurrency(Array.isArray(value) ? value[0] : value)}
              />
              <Legend verticalAlign="bottom" height={36} iconType="circle"/>
            </RePieChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>

    {/* Top Holdings Preview */}
    <Card>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-zinc-100 font-semibold">Top Holdings</h3>
        <button className="text-xs text-blue-400 hover:text-blue-300">View All</button>
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
                    <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px]">{asset.symbol[0]}</div>
                    {asset.name} <span className="text-zinc-500">({asset.symbol})</span>
                  </div>
                </td>
                <td className="py-3 text-right">{formatCurrency(asset.price)}</td>
                <td className="py-3 text-right text-white font-medium">{formatCurrency(asset.value)}</td>
                <td className="py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-xs">{((asset.value / 231015) * 100).toFixed(1)}%</span>
                    <div className="w-16 h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${(asset.value / 231015) * 100}%` }}></div>
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

const HoldingsView = () => (
  <div className="space-y-6">
    <div className="flex justify-between items-end">
      <div>
        <h2 className="text-2xl font-bold text-white">Holdings</h2>
        <p className="text-zinc-400 text-sm mt-1">Consolidated view across all accounts</p>
      </div>
      <div className="flex gap-2">
        <button className="px-3 py-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-lg text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh Prices
        </button>
      </div>
    </div>

    <Card className="p-0 overflow-hidden">
      <table className="w-full text-left text-sm text-zinc-400">
        <thead className="bg-zinc-900/50 border-b border-zinc-800 text-xs uppercase tracking-wider">
          <tr>
            <th className="px-6 py-4 font-medium">Asset</th>
            <th className="px-6 py-4 font-medium text-right">Quantity</th>
            <th className="px-6 py-4 font-medium text-right">Avg Cost</th>
            <th className="px-6 py-4 font-medium text-right">Price</th>
            <th className="px-6 py-4 font-medium text-right">Value</th>
            <th className="px-6 py-4 font-medium text-right">Unrealized PnL</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {ASSETS.map((asset) => (
            <tr key={asset.id} className="hover:bg-zinc-800/30 transition-colors">
              <td className="px-6 py-4 text-zinc-200">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center font-bold text-xs">{asset.symbol.substring(0,2)}</div>
                  <div>
                    <div className="font-medium">{asset.name}</div>
                    <div className="text-xs text-zinc-500">{asset.type} • {asset.mode}</div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 text-right">{asset.balance.toLocaleString()}</td>
              <td className="px-6 py-4 text-right text-zinc-500">{asset.pnl !== 0 ? formatCurrency((asset.value - asset.pnl) / asset.balance) : '-'}</td>
              <td className="px-6 py-4 text-right text-zinc-300">{formatCurrency(asset.price)}</td>
              <td className="px-6 py-4 text-right font-medium text-white">{formatCurrency(asset.value)}</td>
              <td className="px-6 py-4 text-right">
                <div className={asset.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {asset.pnl >= 0 ? '+' : ''}{formatCurrency(asset.pnl)}
                </div>
                <div className={`text-xs ${asset.pnlPct >= 0 ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>
                   {asset.pnlPct.toFixed(2)}%
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  </div>
);

const LedgerView = () => (
  <div className="space-y-6">
    <div className="flex justify-between items-center">
      <div>
        <h2 className="text-2xl font-bold text-white">Ledger</h2>
        <p className="text-zinc-400 text-sm mt-1">History of all trades, transfers, and income</p>
      </div>
      <div className="flex gap-2">
        <button className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Transaction
        </button>
        <button className="px-3 py-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-lg text-sm flex items-center gap-2">
          <Upload className="w-4 h-4" /> Import CSV
        </button>
      </div>
    </div>

    {/* Filters Toolbar */}
    <div className="flex gap-3 pb-2 overflow-x-auto">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
        <input 
          type="text" 
          placeholder="Search ledger..." 
          className="pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white focus:outline-none focus:border-zinc-600 w-64"
        />
      </div>
      <select className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-300 focus:outline-none">
        <option>All Accounts</option>
        <option>Coinbase</option>
        <option>Chase</option>
      </select>
      <select className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-300 focus:outline-none">
        <option>All Types</option>
        <option>Trade</option>
        <option>Deposit</option>
        <option>Yield</option>
      </select>
    </div>

    <Card className="p-0 overflow-hidden">
      <table className="w-full text-left text-sm text-zinc-400">
        <thead className="bg-zinc-900/50 border-b border-zinc-800 text-xs uppercase tracking-wider">
          <tr>
            <th className="px-6 py-4 font-medium">Date</th>
            <th className="px-6 py-4 font-medium">Type</th>
            <th className="px-6 py-4 font-medium">Account</th>
            <th className="px-6 py-4 font-medium">Asset</th>
            <th className="px-6 py-4 font-medium text-right">Quantity</th>
            <th className="px-6 py-4 font-medium text-right">Price</th>
            <th className="px-6 py-4 font-medium text-right">Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {TRANSACTIONS.map((tx) => (
            <tr key={tx.id} className="hover:bg-zinc-800/30 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap">{tx.date}</td>
              <td className="px-6 py-4">
                <Badge type={tx.type.includes('BUY') || tx.type === 'DEPOSIT' || tx.type === 'YIELD' ? 'green' : tx.type.includes('SELL') ? 'orange' : 'default'}>
                  {tx.type.replace('_', ' ')}
                </Badge>
              </td>
              <td className="px-6 py-4 text-zinc-300">{tx.account}</td>
              <td className="px-6 py-4 font-medium text-white">{tx.asset}</td>
              <td className="px-6 py-4 text-right">{tx.amount}</td>
              <td className="px-6 py-4 text-right text-zinc-500">{formatCurrency(tx.price)}</td>
              <td className="px-6 py-4 text-right text-white font-medium">{formatCurrency(tx.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Pagination Stub */}
      <div className="px-6 py-4 border-t border-zinc-800 flex justify-between items-center text-xs text-zinc-500">
        <span>Showing 1-5 of 128 results</span>
        <div className="flex gap-2">
          <button className="px-3 py-1 bg-zinc-800 rounded hover:bg-zinc-700 text-zinc-300">Previous</button>
          <button className="px-3 py-1 bg-zinc-800 rounded hover:bg-zinc-700 text-zinc-300">Next</button>
        </div>
      </div>
    </Card>
  </div>
);

const AssetsAccountsView = () => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
    {/* Accounts Column */}
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-white">Accounts</h2>
        <button className="text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-700">
          + Add Account
        </button>
      </div>
      <div className="space-y-4">
        {ACCOUNTS.map(acc => (
          <Card key={acc.id} className="p-4 flex justify-between items-center hover:border-zinc-600 transition-colors cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 group-hover:text-white transition-colors">
                {acc.type === 'BANK' ? <Landmark className="w-5 h-5"/> : <Wallet className="w-5 h-5"/>}
              </div>
              <div>
                <h3 className="font-medium text-zinc-200">{acc.name}</h3>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span>{acc.platform}</span>
                  <span className="w-1 h-1 bg-zinc-600 rounded-full"></span>
                  <span className={acc.status === 'ACTIVE' ? 'text-emerald-500' : 'text-zinc-500'}>{acc.status}</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-medium text-white">{formatCurrency(acc.value)}</div>
              <div className="text-xs text-zinc-500">Equity</div>
            </div>
          </Card>
        ))}
      </div>
    </div>

    {/* Assets Column */}
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-white">Assets</h2>
        <button className="text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-700">
          + Add Asset
        </button>
      </div>
      <Card className="p-0">
         <table className="w-full text-left text-sm text-zinc-400">
            <thead className="bg-zinc-900/50 border-b border-zinc-800 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Symbol</th>
                <th className="px-4 py-3 font-medium">Mode</th>
                <th className="px-4 py-3 font-medium text-right">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {ASSETS.map(asset => (
                <tr key={asset.id} className="group hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-300 font-medium flex items-center gap-2">
                    {asset.symbol}
                    {asset.type === 'CRYPTO' && <Badge type="blue">C</Badge>}
                    {asset.type === 'EQUITY' && <Badge type="default">S</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] uppercase border px-1.5 py-0.5 rounded ${asset.mode === 'AUTO' ? 'border-emerald-500/30 text-emerald-500' : 'border-zinc-600 text-zinc-500'}`}>
                      {asset.mode}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-300">{formatCurrency(asset.price)}</td>
                </tr>
              ))}
            </tbody>
         </table>
      </Card>
    </div>
  </div>
);

const SettingsView = () => (
  <div className="max-w-2xl mx-auto space-y-8">
     <div className="border-b border-zinc-800 pb-4">
        <h2 className="text-2xl font-bold text-white">Settings</h2>
        <p className="text-zinc-400 text-sm mt-1">Manage global preferences and data backups.</p>
     </div>

     <div className="space-y-6">
       <div>
         <h3 className="text-lg font-medium text-white mb-4">General</h3>
         <Card className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-500 uppercase">Base Currency</label>
                <select className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 outline-none">
                  <option>USD - United States Dollar</option>
                  <option>EUR - Euro</option>
                  <option>GBP - British Pound</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-500 uppercase">Timezone</label>
                <select className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 outline-none">
                  <option>America/New_York (UTC-5)</option>
                  <option>America/Los_Angeles (UTC-8)</option>
                  <option>Europe/London (UTC+0)</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              <div>
                <div className="text-zinc-200 font-medium">Auto-Refresh Prices</div>
                <div className="text-zinc-500 text-xs">Automatically fetch prices every 15 minutes.</div>
              </div>
              <div className="w-10 h-6 bg-blue-600 rounded-full relative cursor-pointer">
                <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
              </div>
            </div>
         </Card>
       </div>

       <div>
         <h3 className="text-lg font-medium text-white mb-4">Data Management</h3>
         <Card className="space-y-4">
            <div className="flex items-center justify-between p-3 border border-zinc-800 rounded-lg bg-zinc-900/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-zinc-800 rounded text-zinc-400"><Download className="w-4 h-4" /></div>
                <div>
                  <div className="text-zinc-200 text-sm font-medium">Export Ledger</div>
                  <div className="text-zinc-500 text-xs">CSV format, includes all history.</div>
                </div>
              </div>
              <button className="text-sm text-white hover:underline">Download</button>
            </div>
            
            <div className="flex items-center justify-between p-3 border border-zinc-800 rounded-lg bg-zinc-900/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-zinc-800 rounded text-zinc-400"><Download className="w-4 h-4" /></div>
                <div>
                  <div className="text-zinc-200 text-sm font-medium">Export Database</div>
                  <div className="text-zinc-500 text-xs">Full SQLite backup.</div>
                </div>
              </div>
              <button className="text-sm text-white hover:underline">Download</button>
            </div>

            <div className="pt-4 border-t border-zinc-800">
               <button className="w-full py-2 border border-rose-900/50 text-rose-500 hover:bg-rose-900/10 rounded-lg text-sm transition-colors">
                 Reset Database (Dev Only)
               </button>
            </div>
         </Card>
       </div>
     </div>
  </div>
);

// --- MAIN LAYOUT SHELL ---

const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  const renderContent = () => {
    switch(activeTab) {
      case 'dashboard': return <DashboardView />;
      case 'holdings': return <HoldingsView />;
      case 'ledger': return <LedgerView />;
      case 'assets': return <AssetsAccountsView />;
      case 'settings': return <SettingsView />;
      default: return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-blue-500/30">
      <div className="flex h-screen overflow-hidden">
        
        {/* Sidebar */}
        <aside className="w-64 border-r border-zinc-800 bg-zinc-950 hidden md:flex flex-col">
          <div className="p-6">
            <div className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Layers className="text-white w-5 h-5" />
              </div>
              Portfolio
            </div>
          </div>
          
          <nav className="flex-1 px-4 space-y-1">
            {[
              { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
              { id: 'holdings', icon: PieChart, label: 'Holdings' },
              { id: 'ledger', icon: ArrowRightLeft, label: 'Ledger' },
              { id: 'assets', icon: Wallet, label: 'Assets & Accounts' },
              { id: 'settings', icon: Settings, label: 'Settings' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === item.id 
                    ? 'bg-zinc-800 text-white' 
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="p-4 border-t border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500" />
              <div>
                <div className="text-sm font-medium text-white">Admin User</div>
                <div className="text-xs text-zinc-500">Local Session</div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          
          {/* Top Bar (Mobile support + Breadcrumb placeholder) */}
          <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-950/80 backdrop-blur-sm z-10">
            <div className="text-sm text-zinc-400 flex items-center gap-2">
              <span className="text-zinc-600">App</span>
              <span className="text-zinc-700">/</span>
              <span className="capitalize text-zinc-200">{activeTab.replace('-', ' ')}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-2 text-xs text-zinc-500 bg-zinc-900 px-3 py-1.5 rounded-full border border-zinc-800">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                System Operational
              </div>
            </div>
          </header>

          {/* Scrollable Page Content */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 scroll-smooth">
            <div className="max-w-6xl mx-auto">
              {renderContent()}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;