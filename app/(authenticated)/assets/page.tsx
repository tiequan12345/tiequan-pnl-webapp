import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Card } from '../_components/ui/Card';
import { Badge } from '../_components/ui/Badge';

type AssetRow = {
  id: number;
  symbol: string;
  name: string;
  type: string;
  volatilityBucket: string;
  chainOrMarket: string;
  pricingMode: string;
  manualPrice: string | null;
};

export default async function AssetsPage() {
  const assets = await prisma.asset.findMany({
    orderBy: { symbol: 'asc' },
  });

  const rows: AssetRow[] = assets.map((asset) => ({
    id: asset.id,
    symbol: asset.symbol,
    name: asset.name,
    type: asset.type,
    volatilityBucket: asset.volatility_bucket,
    chainOrMarket: asset.chain_or_market,
    pricingMode: asset.pricing_mode,
    manualPrice: asset.manual_price ? asset.manual_price.toString() : null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Assets</h2>
        <Link
          href="/assets/new"
          className="text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-700 transition-colors"
        >
          + Add Asset
        </Link>
      </div>

      <Card className="p-0">
        <table className="w-full text-left text-sm text-zinc-400">
          <thead className="bg-zinc-900/50 border-b border-zinc-800 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 font-medium">Symbol</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Volatility</th>
              <th className="px-4 py-3 font-medium">Chain / Market</th>
              <th className="px-4 py-3 font-medium">Pricing Mode</th>
              <th className="px-4 py-3 font-medium text-right">Manual Price</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-sm text-zinc-500"
                >
                  No assets found. Use "Add Asset" to create your first asset.
                </td>
              </tr>
            ) : (
              rows.map((asset) => (
                <tr key={asset.id} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-200 font-semibold">
                    {asset.symbol}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {asset.name}
                  </td>
                  <td className="px-4 py-3">
                    <Badge type="blue">{asset.type}</Badge>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {asset.volatilityBucket}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {asset.chainOrMarket}
                  </td>
                  <td className="px-4 py-3">
                    <Badge type={asset.pricingMode === 'AUTO' ? 'green' : 'orange'}>
                      {asset.pricingMode}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-300">
                    {asset.manualPrice ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/assets/${asset.id}`}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}