import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Card } from '../_components/ui/Card';
import { AssetsTable, type AssetRow } from './AssetsTable';
import { AssetsFilters } from './AssetsFilters';
import { consolidateHoldingsByAsset, getHoldings } from '@/lib/holdings';

type AssetsPageProps = {
  searchParams: Promise<{
    status?: string;
  }>;
};

export default async function AssetsPage(props: AssetsPageProps) {
  const searchParams = await props.searchParams;
  const params = searchParams ?? {};
  const statusFilter = params.status ?? 'ACTIVE';

  const assets = await prisma.asset.findMany({
    orderBy: { symbol: 'asc' },
  });

  const holdings = await getHoldings();
  const consolidated = consolidateHoldingsByAsset(holdings.rows);
  const marketValueMap = new Map<number, number | null>(
    consolidated.map((row) => [row.assetId, row.marketValue ?? null]),
  );

  const filteredAssets = assets.filter((asset) => asset.status === statusFilter);

  const rows: AssetRow[] = filteredAssets.map((asset) => ({
    id: asset.id,
    symbol: asset.symbol,
    name: asset.name,
    type: asset.type,
    volatilityBucket: asset.volatility_bucket,
    chainOrMarket: asset.chain_or_market,
    pricingMode: asset.pricing_mode,
    manualPrice: asset.manual_price ? asset.manual_price.toString() : null,
    manualPriceValue: asset.manual_price ? Number(asset.manual_price.toString()) : null,
    status: asset.status,
    marketValue: marketValueMap.get(asset.id) ?? null,
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

      <div className="text-zinc-400 text-sm">
        Assets are the individual tokens, equities, or instruments that you track across accounts.
      </div>

      <AssetsFilters currentStatus={statusFilter} />

      <Card className="p-0">
        <AssetsTable rows={rows} statusFilter={statusFilter} />
      </Card>
    </div>
  );
}