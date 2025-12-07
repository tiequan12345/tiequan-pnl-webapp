import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Card } from '../_components/ui/Card';
import { AssetsTable, type AssetRow } from './AssetsTable';

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
    manualPriceValue: asset.manual_price ? Number(asset.manual_price.toString()) : null,
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
        <AssetsTable rows={rows} />
      </Card>
    </div>
  );
}