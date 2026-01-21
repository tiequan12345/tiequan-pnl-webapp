import { prisma } from '@/lib/db';
import { Card } from '../_components/ui/Card';
import {
  HedgeTransactionsTable,
  type HedgeTableRow,
  NetExposureTable,
  type NetExposureRow,
  AggregatedHedgesTable,
  type AggregatedHedgeRow,
} from './HedgesTables';
import { getAppSettings } from '@/lib/settings';
import { resolveAssetPrice } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

function decimalToNumber(value: any): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof (value as any).toNumber === 'function') {
    return (value as any).toNumber();
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export default async function HedgesPage() {
  const [activeHedges, groupedHedges, groupedHoldings, settings] = await Promise.all([
    prisma.ledgerTransaction.findMany({
      where: {
        tx_type: 'HEDGE',
      },
      orderBy: { date_time: 'desc' },
      include: {
        account: { select: { name: true } },
        asset: {
          select: {
            id: true,
            symbol: true,
            name: true,
            volatility_bucket: true,
            pricing_mode: true,
            manual_price: true,
            price_latest: true,
          }
        },
      },
    }),
    prisma.ledgerTransaction.groupBy({
      by: ['asset_id'],
      where: {
        tx_type: 'HEDGE',
      },
      _sum: { quantity: true },
    }),
    // Get holdings by excluding HEDGE transactions
    prisma.ledgerTransaction.groupBy({
      by: ['asset_id'],
      where: { tx_type: { not: 'HEDGE' } },
      _sum: { quantity: true },
    }),
    getAppSettings(),
  ]);

  const refreshIntervalMinutes = settings.priceAutoRefreshIntervalMinutes;

  const allAssetIds = Array.from(new Set([
    ...groupedHedges.map(item => item.asset_id),
    ...groupedHoldings.map(item => item.asset_id)
  ]));

  const assets = allAssetIds.length
    ? await prisma.asset.findMany({
      where: { id: { in: allAssetIds } },
      select: {
        id: true,
        symbol: true,
        name: true,
        volatility_bucket: true,
        pricing_mode: true,
        manual_price: true,
        price_latest: true,
      },
    })
    : [];

  const assetById = new Map(assets.map((asset) => [asset.id, asset]));

  // Create maps for quick lookup
  const hedgeByAssetId = new Map<number, number>();
  for (const item of groupedHedges) {
    if (item._sum) {
      hedgeByAssetId.set(item.asset_id, Number(item._sum.quantity?.toString() ?? '0'));
    }
  }

  const holdingsByAssetId = new Map<number, number>();
  for (const item of groupedHoldings) {
    if (item._sum) {
      holdingsByAssetId.set(item.asset_id, Number(item._sum.quantity?.toString() ?? '0'));
    }
  }

  const netExposureRows: NetExposureRow[] = allAssetIds
    .map((assetId) => {
      const asset = assetById.get(assetId);
      if (!asset) return null;

      const holdings = holdingsByAssetId.get(assetId) || 0;
      const hedge = hedgeByAssetId.get(assetId) || 0;
      const netExposure = holdings + hedge; // holdings + (negative hedge)

      // Only include assets that have meaningful net exposure
      if (Math.abs(netExposure) < 0.01) return null;

      // Calculate price
      const latestPriceRecord = asset.price_latest ? {
        priceInBase: decimalToNumber(asset.price_latest.price_in_base),
        lastUpdated: asset.price_latest.last_updated,
      } : null;

      const priceResolution = resolveAssetPrice({
        pricingMode: asset.pricing_mode as 'AUTO' | 'MANUAL',
        manualPrice: asset.manual_price ? decimalToNumber(asset.manual_price) : null,
        latestPrice: latestPriceRecord,
        refreshIntervalMinutes,
      });

      const price = priceResolution.price && priceResolution.price > 0 ? priceResolution.price : null;
      const marketValue = price ? netExposure * price : null;

      return {
        assetId: asset.id,
        assetSymbol: asset.symbol,
        assetName: asset.name,
        netQuantity: netExposure.toString(),
        netQuantityValue: netExposure,
        price,
        marketValue,
      };
    })
    .filter((row): row is NetExposureRow => {
      if (!row) return false;
      // Only include assets that have hedge transactions AND are volatile
      const asset = assetById.get(row.assetId);
      return asset?.volatility_bucket === 'VOLATILE' && hedgeByAssetId.has(row.assetId);
    })
    .sort((a, b) => a.assetSymbol.localeCompare(b.assetSymbol));

  // Filter out CASH_LIKE assets from hedge transactions
  const volatileActiveHedges = activeHedges.filter(tx => tx.asset.volatility_bucket !== 'CASH_LIKE');

  // Aggregate hedge transactions by asset
  const aggregatedHedgesByAsset = new Map<number, {
    assetId: number;
    assetSymbol: string;
    assetName: string;
    totalQuantity: number;
    asset: any; // Asset data for price resolution
  }>();

  volatileActiveHedges.forEach((tx) => {
    const assetId = tx.asset.id;
    const existing = aggregatedHedgesByAsset.get(assetId);

    if (existing) {
      existing.totalQuantity += Number(tx.quantity.toString());
    } else {
      aggregatedHedgesByAsset.set(assetId, {
        assetId,
        assetSymbol: tx.asset.symbol,
        assetName: tx.asset.name,
        totalQuantity: Number(tx.quantity.toString()),
        asset: tx.asset,
      });
    }
  });

  // Create aggregated hedge rows with price resolution
  const aggregatedHedgeRows: AggregatedHedgeRow[] = Array.from(aggregatedHedgesByAsset.values()).map((hedge) => {
    // Calculate price for this asset
    const latestPriceRecord = hedge.asset.price_latest ? {
      priceInBase: decimalToNumber(hedge.asset.price_latest.price_in_base),
      lastUpdated: hedge.asset.price_latest.last_updated,
    } : null;

    const priceResolution = resolveAssetPrice({
      pricingMode: hedge.asset.pricing_mode as 'AUTO' | 'MANUAL',
      manualPrice: hedge.asset.manual_price ? decimalToNumber(hedge.asset.manual_price) : null,
      latestPrice: latestPriceRecord,
      refreshIntervalMinutes,
    });

    const price = priceResolution.price && priceResolution.price > 0 ? priceResolution.price : null;
    const totalMarketValue = price ? hedge.totalQuantity * price : null;

    return {
      assetId: hedge.assetId,
      assetSymbol: hedge.assetSymbol,
      assetName: hedge.assetName,
      totalQuantity: hedge.totalQuantity.toString(),
      totalQuantityValue: hedge.totalQuantity,
      price,
      totalMarketValue,
    };
  })
    .filter(row => row.totalMarketValue !== null && Math.abs(row.totalMarketValue) >= 500)
    .sort((a, b) => a.assetSymbol.localeCompare(b.assetSymbol));

  // Keep the original hedge rows for reference (not used in the new UI)
  const hedgeRows: HedgeTableRow[] = volatileActiveHedges.map((tx) => {
    // Calculate price for this transaction
    const latestPriceRecord = tx.asset.price_latest ? {
      priceInBase: decimalToNumber(tx.asset.price_latest.price_in_base),
      lastUpdated: tx.asset.price_latest.last_updated,
    } : null;

    const priceResolution = resolveAssetPrice({
      pricingMode: tx.asset.pricing_mode as 'AUTO' | 'MANUAL',
      manualPrice: tx.asset.manual_price ? decimalToNumber(tx.asset.manual_price) : null,
      latestPrice: latestPriceRecord,
      refreshIntervalMinutes,
    });

    const price = priceResolution.price && priceResolution.price > 0 ? priceResolution.price : null;
    const marketValue = price ? Number(tx.quantity.toString()) * price : null;

    return {
      id: tx.id,
      dateTime: tx.date_time.toISOString(),
      accountName: tx.account.name,
      assetSymbol: tx.asset.symbol,
      assetName: tx.asset.name,
      quantity: tx.quantity.toString(),
      quantityValue: Number(tx.quantity.toString()),
      price,
      marketValue,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">Hedges</h2>
        <div className="text-xs text-zinc-500">
          {hedgeRows.length === 0
            ? 'No volatile hedge transactions yet'
            : `${hedgeRows.length} volatile hedge entries`}
        </div>
      </div>

      <Card className="rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl">
        <div className="border-b border-white/5 px-4 py-3">
          <h3 className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">Net Exposure by Asset</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Net exposure = holdings + hedge transactions, with price and market value for volatile assets.
          </p>
        </div>
        <NetExposureTable rows={netExposureRows} />
      </Card>

      <Card className="p-0 rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl">
        <div className="border-b border-white/5 px-4 py-3">
          <h3 className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">Active Hedges</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Aggregated hedge positions by asset, showing total quantity and market value across all accounts. CASH_LIKE assets excluded.
          </p>
        </div>
        <AggregatedHedgesTable rows={aggregatedHedgeRows} />
      </Card>
    </div>
  );
}
