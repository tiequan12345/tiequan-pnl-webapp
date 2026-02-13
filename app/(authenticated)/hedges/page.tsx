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

function buildPairKey(assetId: number, accountId: number) {
  return `${assetId}:${accountId}`;
}

export default async function HedgesPage() {
  const [settings, hedgeBasePairRows] = await Promise.all([
    getAppSettings(),
    prisma.ledgerTransaction.findMany({
      where: {
        tx_type: 'HEDGE',
        // Exclude quote legs and cash-like hedge legs.
        asset: {
          is: {
            volatility_bucket: { not: 'CASH_LIKE' },
          },
        },
        OR: [
          // CCXT futures position reconciliation rows.
          { external_reference: { contains: ':POSITION:' } },
          // CCXT base legs.
          { external_reference: { contains: ':BASE' } },
          // Legacy/manual hedges without a reference.
          { external_reference: null },
          { external_reference: '' },
        ],
        NOT: [
          { external_reference: { contains: ':QUOTE' } },
          { external_reference: { contains: 'POSITION_QUOTE' } },
        ],
      },
      distinct: ['asset_id', 'account_id'],
      select: {
        asset_id: true,
        account_id: true,
      },
    }),
  ]);

  const refreshIntervalMinutes = settings.priceAutoRefreshIntervalMinutes;

  const hedgeBasePairs = new Set<string>();
  const hedgeAssetIds = new Set<number>();
  const hedgeAccountIds = new Set<number>();

  for (const row of hedgeBasePairRows) {
    hedgeBasePairs.add(buildPairKey(row.asset_id, row.account_id));
    hedgeAssetIds.add(row.asset_id);
    hedgeAccountIds.add(row.account_id);
  }

  const hedgeAssetIdList = Array.from(hedgeAssetIds);
  const hedgeAccountIdList = Array.from(hedgeAccountIds);

  const [netTotalsByAsset, totalsByAccountAsset] = await Promise.all([
    hedgeAssetIdList.length
      ? prisma.ledgerTransaction.groupBy({
        by: ['asset_id'],
        where: { asset_id: { in: hedgeAssetIdList } },
        _sum: { quantity: true },
      })
      : Promise.resolve([]),
    hedgeAssetIdList.length && hedgeAccountIdList.length
      ? prisma.ledgerTransaction.groupBy({
        by: ['asset_id', 'account_id'],
        where: {
          asset_id: { in: hedgeAssetIdList },
          account_id: { in: hedgeAccountIdList },
        },
        _sum: { quantity: true },
      })
      : Promise.resolve([]),
  ]);

  const assets = hedgeAssetIdList.length
    ? await prisma.asset.findMany({
      where: { id: { in: hedgeAssetIdList } },
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

  const accounts = hedgeAccountIdList.length
    ? await prisma.account.findMany({
      where: { id: { in: hedgeAccountIdList } },
      select: { id: true, name: true },
    })
    : [];

  const accountById = new Map(accounts.map((account) => [account.id, account]));

  // --- Active hedge positions by account (NOT just HEDGE rows) ---
  const accountHedgeRows: AccountAggregatedHedgeRow[] = [];
  const hedgesQtyByAssetId = new Map<number, number>();

  for (const item of totalsByAccountAsset) {
    const pairKey = buildPairKey(item.asset_id, item.account_id);
    if (!hedgeBasePairs.has(pairKey)) {
      continue;
    }

    const asset = assetById.get(item.asset_id);
    const account = accountById.get(item.account_id);
    if (!asset || !account) {
      continue;
    }

    // Safety: keep the UI focused on volatile hedges.
    if (asset.volatility_bucket === 'CASH_LIKE') {
      continue;
    }

    const totalQty = Number(item._sum.quantity?.toString() ?? '0');
    if (!Number.isFinite(totalQty) || Math.abs(totalQty) < 1e-9) {
      continue;
    }

    hedgesQtyByAssetId.set(asset.id, (hedgesQtyByAssetId.get(asset.id) ?? 0) + totalQty);

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

    accountHedgeRows.push({
      accountId: account.id,
      accountName: account.name,
      assetId: asset.id,
      assetSymbol: asset.symbol,
      assetName: asset.name,
      totalQuantity: totalQty.toString(),
      totalQuantityValue: totalQty,
      price,
      totalMarketValue,
    });
  }

  accountHedgeRows
    .sort((a, b) => {
      const aValue = Math.abs(a.totalMarketValue ?? 0);
      const bValue = Math.abs(b.totalMarketValue ?? 0);
      if (aValue !== bValue) return bValue - aValue;
      if (a.accountName !== b.accountName) return a.accountName.localeCompare(b.accountName);
      return a.assetSymbol.localeCompare(b.assetSymbol);
    });

  // --- Active hedges aggregated by asset ---
  const aggregatedHedgeRows: AggregatedHedgeRow[] = Array.from(hedgesQtyByAssetId.entries())
    .map(([assetId, totalQty]) => {
      const asset = assetById.get(assetId);
      if (!asset) return null;

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

  // --- Net exposure by asset (spot + hedge accounts) ---
  const netQtyByAssetId = new Map<number, number>();
  for (const item of netTotalsByAsset) {
    const qty = Number(item._sum.quantity?.toString() ?? '0');
    if (!Number.isFinite(qty)) continue;
    netQtyByAssetId.set(item.asset_id, qty);
  }

  const netExposureRows: NetExposureRow[] = hedgeAssetIdList
    .map((assetId) => {
      const asset = assetById.get(assetId);
      if (!asset) return null;

      // Keep net exposure focused on volatile hedges.
      if (asset.volatility_bucket !== 'VOLATILE') {
        return null;
      }

      const netExposure = netQtyByAssetId.get(assetId) ?? 0;
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
    .filter((row): row is NetExposureRow => Boolean(row))
    .sort((a, b) => a.assetSymbol.localeCompare(b.assetSymbol));

  const hedgePositionsCount = accountHedgeRows.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">Hedges</h2>
        <div className="text-xs text-zinc-500">
          {hedgePositionsCount === 0 ? 'No volatile hedge positions yet' : `${hedgePositionsCount} volatile hedge positions`}
        </div>
      </div>

      <Card className="rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl">
        <div className="border-b border-white/5 px-4 py-3">
          <h3 className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">Net Exposure by Asset</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Net exposure = total net quantity across all accounts for assets that have an active hedge position.
          </p>
        </div>
        <NetExposureTable rows={netExposureRows} />
      </Card>

      <Card className="p-0 rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl">
        <div className="border-b border-white/5 px-4 py-3">
          <h3 className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">Active Hedges</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Aggregated hedge positions by asset (not just HEDGE rows), showing total quantity and market value across hedge accounts. CASH_LIKE assets excluded.
          </p>
        </div>
        <AggregatedHedgesTable rows={aggregatedHedgeRows} />
      </Card>

      <Card className="p-0 rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl">
        <div className="border-b border-white/5 px-4 py-3">
          <h3 className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">Active Hedges by Account</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Hedge positions broken out per account (Binance vs Bybit), computed from total ledger positions for accounts/assets marked as hedge base legs.
          </p>
        </div>
        <AccountAggregatedHedgesTable rows={accountHedgeRows} />
      </Card>
    </div>
  );
}
