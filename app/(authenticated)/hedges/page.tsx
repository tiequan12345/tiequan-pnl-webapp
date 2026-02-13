import { prisma } from '@/lib/db';
import { Card } from '../_components/ui/Card';
import {
  NetExposureTable,
  type NetExposureRow,
  AggregatedHedgesTable,
  type AggregatedHedgeRow,
  AccountAggregatedHedgesTable,
  type AccountAggregatedHedgeRow,
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
  const [groupedHedges, groupedHedgesByAccount, groupedHoldings, settings] = await Promise.all([
    prisma.ledgerTransaction.groupBy({
      by: ['asset_id'],
      where: {
        tx_type: 'HEDGE',
      },
      _sum: { quantity: true },
      _count: { _all: true },
    }),
    prisma.ledgerTransaction.groupBy({
      by: ['asset_id', 'account_id'],
      where: {
        tx_type: 'HEDGE',
      },
      _sum: { quantity: true },
      _count: { _all: true },
    }),
    prisma.ledgerTransaction.groupBy({
      by: ['asset_id'],
      where: { tx_type: { not: 'HEDGE' } },
      _sum: { quantity: true },
    }),
    getAppSettings(),
  ]);

  const refreshIntervalMinutes = settings.priceAutoRefreshIntervalMinutes;

  const allAssetIds = Array.from(
    new Set([
      ...groupedHedges.map((item) => item.asset_id),
      ...groupedHoldings.map((item) => item.asset_id),
    ]),
  );

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

  const accountIds = Array.from(new Set(groupedHedgesByAccount.map((item) => item.account_id)));
  const accounts = accountIds.length
    ? await prisma.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, name: true },
    })
    : [];
  const accountById = new Map(accounts.map((account) => [account.id, account]));

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
      const netExposure = holdings + hedge;

      if (Math.abs(netExposure) < 0.01) return null;

      const latestPriceRecord = asset.price_latest
        ? {
          priceInBase: decimalToNumber(asset.price_latest.price_in_base),
          lastUpdated: asset.price_latest.last_updated,
        }
        : null;

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
      const asset = assetById.get(row.assetId);
      return asset?.volatility_bucket === 'VOLATILE' && hedgeByAssetId.has(row.assetId);
    })
    .sort((a, b) => a.assetSymbol.localeCompare(b.assetSymbol));

  const aggregatedHedgeRows: AggregatedHedgeRow[] = groupedHedges
    .map((item) => {
      const asset = assetById.get(item.asset_id);
      if (!asset) return null;
      if (asset.volatility_bucket === 'CASH_LIKE') return null;

      const totalQty = Number(item._sum.quantity?.toString() ?? '0');
      if (!Number.isFinite(totalQty) || Math.abs(totalQty) < 1e-9) return null;

      const latestPriceRecord = asset.price_latest
        ? {
          priceInBase: decimalToNumber(asset.price_latest.price_in_base),
          lastUpdated: asset.price_latest.last_updated,
        }
        : null;

      const priceResolution = resolveAssetPrice({
        pricingMode: asset.pricing_mode as 'AUTO' | 'MANUAL',
        manualPrice: asset.manual_price ? decimalToNumber(asset.manual_price) : null,
        latestPrice: latestPriceRecord,
        refreshIntervalMinutes,
      });

      const price = priceResolution.price && priceResolution.price > 0 ? priceResolution.price : null;
      const totalMarketValue = price ? totalQty * price : null;

      return {
        assetId: asset.id,
        assetSymbol: asset.symbol,
        assetName: asset.name,
        totalQuantity: totalQty.toString(),
        totalQuantityValue: totalQty,
        price,
        totalMarketValue,
      };
    })
    .filter((row): row is AggregatedHedgeRow => Boolean(row))
    .filter((row) => {
      if (row.totalMarketValue !== null) {
        return Math.abs(row.totalMarketValue) >= 500;
      }
      return Math.abs(row.totalQuantityValue) >= 0.01;
    })
    .sort((a, b) => a.assetSymbol.localeCompare(b.assetSymbol));

  const accountHedgeRows: AccountAggregatedHedgeRow[] = groupedHedgesByAccount
    .map((item) => {
      const asset = assetById.get(item.asset_id);
      const account = accountById.get(item.account_id);
      if (!asset || !account) return null;
      if (asset.volatility_bucket === 'CASH_LIKE') return null;

      const totalQty = Number(item._sum.quantity?.toString() ?? '0');
      if (!Number.isFinite(totalQty) || Math.abs(totalQty) < 1e-9) return null;

      const latestPriceRecord = asset.price_latest
        ? {
          priceInBase: decimalToNumber(asset.price_latest.price_in_base),
          lastUpdated: asset.price_latest.last_updated,
        }
        : null;

      const priceResolution = resolveAssetPrice({
        pricingMode: asset.pricing_mode as 'AUTO' | 'MANUAL',
        manualPrice: asset.manual_price ? decimalToNumber(asset.manual_price) : null,
        latestPrice: latestPriceRecord,
        refreshIntervalMinutes,
      });

      const price = priceResolution.price && priceResolution.price > 0 ? priceResolution.price : null;
      const totalMarketValue = price ? totalQty * price : null;

      return {
        accountId: account.id,
        accountName: account.name,
        assetId: asset.id,
        assetSymbol: asset.symbol,
        assetName: asset.name,
        totalQuantity: totalQty.toString(),
        totalQuantityValue: totalQty,
        price,
        totalMarketValue,
      };
    })
    .filter((row): row is AccountAggregatedHedgeRow => Boolean(row))
    .filter((row) => {
      if (row.totalMarketValue !== null) {
        return Math.abs(row.totalMarketValue) >= 500;
      }
      return Math.abs(row.totalQuantityValue) >= 0.01;
    })
    .sort((a, b) => {
      const aValue = Math.abs(a.totalMarketValue ?? 0);
      const bValue = Math.abs(b.totalMarketValue ?? 0);
      if (aValue !== bValue) return bValue - aValue;
      return a.assetSymbol.localeCompare(b.assetSymbol);
    });

  const volatileHedgeEntryCount = groupedHedges.reduce((sum, item) => {
    const asset = assetById.get(item.asset_id);
    if (!asset || asset.volatility_bucket === 'CASH_LIKE') return sum;
    const count = (item as any)._count?._all ?? 0;
    return sum + (Number.isFinite(count) ? count : 0);
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">Hedges</h2>
        <div className="text-xs text-zinc-500">
          {volatileHedgeEntryCount === 0
            ? 'No volatile hedge transactions yet'
            : `${volatileHedgeEntryCount} volatile hedge entries`}
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

      <Card className="p-0 rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl">
        <div className="border-b border-white/5 px-4 py-3">
          <h3 className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">Active Hedges by Account</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Same as Active Hedges, but broken out per account so Binance vs Bybit exposure is visible.
          </p>
        </div>
        <AccountAggregatedHedgesTable rows={accountHedgeRows} />
      </Card>
    </div>
  );
}
