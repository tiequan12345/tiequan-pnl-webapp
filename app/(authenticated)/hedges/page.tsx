import React from 'react';
import { prisma } from '@/lib/db';
import { Card } from '../_components/ui/Card';

type HedgeRow = {
  id: number;
  dateTime: string;
  accountName: string;
  assetSymbol: string;
  assetName: string;
  quantity: string;
  notes: string | null;
};

type NetExposureRow = {
  assetId: number;
  assetSymbol: string;
  assetName: string;
  netQuantity: string;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export default async function HedgesPage() {
  const [activeHedges, grouped] = await Promise.all([
    prisma.ledgerTransaction.findMany({
      where: { tx_type: 'HEDGE' },
      orderBy: { date_time: 'desc' },
      include: {
        account: { select: { name: true } },
        asset: { select: { symbol: true, name: true } },
      },
    }),
    prisma.ledgerTransaction.groupBy({
      by: ['asset_id'],
      _sum: { quantity: true },
    }),
  ]);

  const assetIds = grouped.map((item) => item.asset_id);
  const assets = assetIds.length
    ? await prisma.asset.findMany({
        where: { id: { in: assetIds } },
        select: { id: true, symbol: true, name: true },
      })
    : [];

  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const netExposureRows: NetExposureRow[] = grouped
    .map((item) => {
      const asset = assetById.get(item.asset_id);
      const netQuantity = item._sum.quantity?.toString() ?? '0';
      return asset
        ? {
            assetId: asset.id,
            assetSymbol: asset.symbol,
            assetName: asset.name,
            netQuantity,
          }
        : null;
    })
    .filter((row): row is NetExposureRow => Boolean(row))
    .sort((a, b) => a.assetSymbol.localeCompare(b.assetSymbol));

  const hedgeRows: HedgeRow[] = activeHedges.map((tx) => ({
    id: tx.id,
    dateTime: tx.date_time.toISOString(),
    accountName: tx.account.name,
    assetSymbol: tx.asset.symbol,
    assetName: tx.asset.name,
    quantity: tx.quantity.toString(),
    notes: tx.notes ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Hedges</h2>
        <div className="text-xs text-zinc-500">
          {hedgeRows.length === 0
            ? 'No hedge transactions yet'
            : `${hedgeRows.length} active hedge entries`}
        </div>
      </div>

      <Card>
        <div className="border-b border-zinc-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-zinc-100">Net Exposure by Asset</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Sum of signed hedge quantities grouped by asset.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-400">
            <thead className="bg-zinc-900/50 border-b border-zinc-800 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 font-medium">Asset</th>
                <th className="px-4 py-3 font-medium text-right">Net Quantity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {netExposureRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="px-4 py-8 text-center text-sm text-zinc-500"
                  >
                    No hedge exposures yet. Add HEDGE transactions to see net exposure.
                  </td>
                </tr>
              ) : (
                netExposureRows.map((row) => (
                  <tr key={row.assetId} className="hover:bg-zinc-800/30">
                    <td className="px-4 py-3 text-zinc-200 font-semibold">
                      {row.assetSymbol} <span className="text-zinc-500">({row.assetName})</span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-300">
                      {row.netQuantity.startsWith('-') ? row.netQuantity : `+${row.netQuantity}`}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-0">
        <div className="border-b border-zinc-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-zinc-100">Active Hedges</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Latest hedge transactions with account and notes.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-400">
            <thead className="bg-zinc-900/50 border-b border-zinc-800 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 font-medium">Date / Time</th>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Asset</th>
                <th className="px-4 py-3 font-medium text-right">Quantity</th>
                <th className="px-4 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {hedgeRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-zinc-500"
                  >
                    No hedge transactions found. Add HEDGE entries in the ledger to see them here.
                  </td>
                </tr>
              ) : (
                hedgeRows.map((row) => (
                  <tr key={row.id} className="hover:bg-zinc-800/30">
                    <td className="px-4 py-3 text-zinc-300">
                      {formatDateTime(row.dateTime)}
                    </td>
                    <td className="px-4 py-3 text-zinc-200 font-semibold">
                      {row.accountName}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {row.assetSymbol} <span className="text-zinc-500">({row.assetName})</span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-300">
                      {row.quantity.startsWith('-') ? row.quantity : `+${row.quantity}`}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 max-w-xs truncate">
                      {row.notes ?? '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}