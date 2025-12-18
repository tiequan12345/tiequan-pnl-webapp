import { prisma } from '@/lib/db';
import { getAppSettings } from '@/lib/settings';
import { resolveAssetPrice, type LatestPriceRecord } from '@/lib/pricing';
import type { Prisma } from '@prisma/client';

export type HoldingRow = {
  assetId: number;
  assetSymbol: string;
  assetName: string;
  assetType: string;
  volatilityBucket: string;
  pricingMode: 'AUTO' | 'MANUAL';
  manualPrice: number | null;
  accountId: number;
  accountName: string;
  quantity: number;
  price: number | null;
  priceSource: string | null;
  lastUpdated: Date | null;
  isManual: boolean;
  isStale: boolean;
  marketValue: number | null;
  averageCost: number | null;
  totalCostBasis: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
};

export type HoldingsSummary = {
  totalValue: number;
  totalCostBasis: number | null;
  totalUnrealizedPnl: number | null;
  byType: Record<string, number>;
  byVolatility: Record<string, number>;
  updatedAt: Date | null;
  autoUpdatedAt: Date | null;
  hasAutoAssets: boolean;
};

export type HoldingsResult = {
  rows: HoldingRow[];
  summary: HoldingsSummary;
};

type HoldingFilters = {
  accountIds?: number[];
  assetTypes?: string[];
  volatilityBuckets?: string[];
};

export function decimalToNumber(
  value: Prisma.Decimal | number | bigint | string | null | undefined,
): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof (value as Prisma.Decimal).toNumber === 'function') {
    return (value as Prisma.Decimal).toNumber();
  }
  return 0;
}

function decimalToNullableNumber(
  value: Prisma.Decimal | number | bigint | string | null | undefined,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const converted = decimalToNumber(value);
  return Number.isFinite(converted) ? converted : null;
}

function buildLatestPriceRecord(
  record: { price_in_base: Prisma.Decimal; last_updated: Date } | null | undefined,
): LatestPriceRecord | null {
  if (!record) {
    return null;
  }
  return {
    priceInBase: decimalToNumber(record.price_in_base),
    lastUpdated: record.last_updated,
  };
}

function isValidPrice(price: number | null | undefined): price is number {
  return typeof price === 'number' && Number.isFinite(price) && price > 0;
}

function getTransactionValue(
  quantity: Prisma.Decimal | number | bigint | string | null | undefined,
  totalValue: Prisma.Decimal | number | bigint | string | null | undefined,
  unitPrice: Prisma.Decimal | number | bigint | string | null | undefined,
): number | null {
  const totalValueNumber = decimalToNullableNumber(totalValue);
  if (totalValueNumber !== null) {
    return Math.abs(totalValueNumber);
  }

  const unitPriceNumber = decimalToNullableNumber(unitPrice);
  const quantityNumber = decimalToNullableNumber(quantity);
  if (
    unitPriceNumber !== null &&
    quantityNumber !== null &&
    Math.abs(quantityNumber) > 0
  ) {
    return Math.abs(unitPriceNumber * quantityNumber);
  }

  return null;
}

type LedgerTransactionWithRelations = Prisma.LedgerTransactionGetPayload<{
  include: {
    asset: {
      include: {
        price_latest: true;
      };
    };
    account: true;
  };
}>;

export async function fetchHoldingRows(filters?: HoldingFilters): Promise<HoldingRow[]> {
  const settings = await getAppSettings();
  const refreshIntervalMinutes = settings.priceAutoRefreshIntervalMinutes;

  const where: Prisma.LedgerTransactionWhereInput = {};
  if (filters?.accountIds && filters.accountIds.length > 0) {
    where.account_id = { in: filters.accountIds };
  }

  const assetWhere: Prisma.AssetWhereInput = {};
  if (filters?.assetTypes && filters.assetTypes.length > 0) {
    assetWhere.type = { in: filters.assetTypes };
  }
  if (filters?.volatilityBuckets && filters.volatilityBuckets.length > 0) {
    assetWhere.volatility_bucket = { in: filters.volatilityBuckets };
  }
  if (Object.keys(assetWhere).length > 0) {
    where.asset = { is: assetWhere };
  }

  const transactions = await prisma.ledgerTransaction.findMany({
    where,
    orderBy: { date_time: 'asc' },
    include: {
      asset: {
        include: {
          price_latest: true,
        },
      },
      account: true,
    },
  }) as LedgerTransactionWithRelations[];

  if (transactions.length === 0) {
    return [];
  }

  const positions = new Map<
    string,
    {
      asset: LedgerTransactionWithRelations['asset'];
      account: LedgerTransactionWithRelations['account'];
      quantity: number;
      costBasis: number;
      costBasisKnown: boolean;
    }
  >();

  const isCashLikeAsset = (asset: LedgerTransactionWithRelations['asset']): boolean => {
    const type = (asset.type ?? '').toUpperCase();
    const bucket = (asset.volatility_bucket ?? '').toUpperCase();
    const symbol = (asset.symbol ?? '').toUpperCase();
    return (
      type === 'CASH' ||
      type === 'STABLE' ||
      bucket === 'CASH_LIKE' ||
      symbol === 'USD' ||
      symbol === 'USDT' ||
      symbol === 'USDC'
    );
  };

  for (const tx of transactions) {
    const key = `${tx.asset_id}-${tx.account_id}`;
    const quantity = decimalToNumber(tx.quantity);
    const existing = positions.get(key);

    const position =
      existing ?? {
        asset: tx.asset,
        account: tx.account,
        quantity: 0,
        costBasis: 0,
        costBasisKnown: true,
      };

    if (tx.tx_type === 'COST_BASIS_RESET') {
      const resetValue = decimalToNullableNumber(tx.total_value_in_base);
      if (resetValue === null) {
        position.costBasisKnown = false;
      } else {
        position.costBasisKnown = true;
        position.costBasis = Math.max(Math.abs(resetValue), 0);
      }
      positions.set(key, position);
      continue;
    }

    if (isCashLikeAsset(tx.asset)) {
      // Cash-like assets are assumed to be 1:1 with the base currency, so we can infer cost basis
      // from quantity alone (no per-tx valuation required).
      if (quantity > 0) {
        position.costBasisKnown = true;
        position.costBasis += Math.abs(quantity);
        position.quantity += quantity;
      } else if (quantity < 0) {
        position.costBasisKnown = true;
        position.costBasis -= Math.abs(quantity);
        if (position.costBasis < 0) {
          position.costBasis = 0;
        }
        position.quantity += quantity;
      }

      positions.set(key, position);
      continue;
    }

    const txValue = getTransactionValue(
      tx.quantity,
      tx.total_value_in_base,
      tx.unit_price_in_base,
    );

    if (quantity > 0) {
      if (txValue === null) {
        position.costBasisKnown = false;
      } else {
        position.costBasis += txValue;
      }
      position.quantity += quantity;
    } else if (quantity < 0) {
      const sellQuantity = Math.abs(quantity);
      if (position.costBasisKnown && position.quantity > 0) {
        const averageCost = position.quantity === 0 ? 0 : position.costBasis / position.quantity;
        position.costBasis -= averageCost * sellQuantity;
        if (position.costBasis < 0) {
          position.costBasis = 0;
        }
      } else {
        position.costBasisKnown = false;
      }
      position.quantity += quantity;
    }

    positions.set(key, position);
  }

  const rows: HoldingRow[] = [];

  for (const position of positions.values()) {
    const asset = position.asset;
    const account = position.account;
    const quantity = position.quantity;

    const latestPriceRecord = buildLatestPriceRecord(asset.price_latest ?? null);
    const priceResolution = resolveAssetPrice({
      pricingMode: asset.pricing_mode as 'AUTO' | 'MANUAL',
      manualPrice: asset.manual_price ? decimalToNumber(asset.manual_price) : null,
      latestPrice: latestPriceRecord,
      refreshIntervalMinutes,
    });

    const price = isValidPrice(priceResolution.price) ? priceResolution.price : null;
    const marketValue = price !== null ? quantity * price : null;

    const totalCostBasis = position.costBasisKnown ? Math.max(position.costBasis, 0) : null;
    const averageCost =
      totalCostBasis !== null && Math.abs(quantity) > 0
        ? totalCostBasis / Math.abs(quantity)
        : null;
    const unrealizedPnl =
      marketValue !== null && totalCostBasis !== null
        ? marketValue - totalCostBasis
        : null;
    const unrealizedPnlPct =
      totalCostBasis && totalCostBasis !== 0 && unrealizedPnl !== null
        ? (unrealizedPnl / totalCostBasis) * 100
        : null;

    rows.push({
      assetId: asset.id,
      assetSymbol: asset.symbol,
      assetName: asset.name,
      assetType: asset.type,
      volatilityBucket: asset.volatility_bucket,
      pricingMode: asset.pricing_mode as 'AUTO' | 'MANUAL',
      manualPrice: asset.manual_price ? decimalToNumber(asset.manual_price) : null,
      accountId: account.id,
      accountName: account.name,
      quantity,
      price,
      priceSource: priceResolution.source,
      lastUpdated: priceResolution.lastUpdated,
      isManual: priceResolution.isManual,
      isStale: priceResolution.isStale,
      marketValue,
      averageCost,
      totalCostBasis,
      unrealizedPnl,
      unrealizedPnlPct,
    });
  }

  rows.sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));
  return rows;
}

export function summarizeHoldings(rows: HoldingRow[]): HoldingsSummary {
  const summary: HoldingsSummary = {
    totalValue: 0,
    totalCostBasis: null,
    totalUnrealizedPnl: null,
    byType: {},
    byVolatility: {},
    updatedAt: null,
    autoUpdatedAt: null,
    hasAutoAssets: false,
  };

  let costBasisSum = 0;
  let costBasisCount = 0;
  let unrealizedSum = 0;
  let unrealizedCount = 0;

  for (const row of rows) {
    if (isValidPrice(row.price) && row.marketValue !== null) {
      summary.totalValue += row.marketValue;

      summary.byType[row.assetType] = (summary.byType[row.assetType] || 0) + row.marketValue;
      summary.byVolatility[row.volatilityBucket] =
        (summary.byVolatility[row.volatilityBucket] || 0) + row.marketValue;

      if (!summary.updatedAt || (row.lastUpdated && row.lastUpdated > summary.updatedAt)) {
        summary.updatedAt = row.lastUpdated;
      }

      if (row.pricingMode === 'AUTO') {
        summary.hasAutoAssets = true;
        if (!summary.autoUpdatedAt || (row.lastUpdated && row.lastUpdated > summary.autoUpdatedAt)) {
          summary.autoUpdatedAt = row.lastUpdated;
        }
      }
    }

    if (row.totalCostBasis !== null) {
      costBasisSum += row.totalCostBasis;
      costBasisCount += 1;
    }

    if (row.unrealizedPnl !== null) {
      unrealizedSum += row.unrealizedPnl;
      unrealizedCount += 1;
    }
  }

  if (costBasisCount > 0) {
    summary.totalCostBasis = costBasisSum;
  }
  if (unrealizedCount > 0) {
    summary.totalUnrealizedPnl = unrealizedSum;
  }

  return summary;
}

export function consolidateHoldingsByAsset(rows: HoldingRow[]): HoldingRow[] {
  const grouped = rows.reduce<Record<number, HoldingRow[]>>((acc, row) => {
    acc[row.assetId] = acc[row.assetId] || [];
    acc[row.assetId].push(row);
    return acc;
  }, {});

  const consolidated: HoldingRow[] = [];

  Object.values(grouped).forEach((assetRows) => {
    if (assetRows.length === 0) {
      return;
    }

    const reference = assetRows[0];
    const totalQuantity = assetRows.reduce((sum, row) => sum + row.quantity, 0);
    const totalMarketValue = assetRows.reduce((sum, row) => sum + (row.marketValue ?? 0), 0);
    const hasPricedRow = assetRows.find((row) => isValidPrice(row.price));

    const latestUpdated = assetRows.reduce<Date | null>((latest, row) => {
      if (!latest || (row.lastUpdated && row.lastUpdated > latest)) {
        return row.lastUpdated ?? latest;
      }
      return latest;
    }, null);

    const ROW_ZERO_THRESHOLD = 1e-9;
    const meaningfulRows = assetRows.filter((row) => Math.abs(row.quantity) > ROW_ZERO_THRESHOLD);
    const relevantRows = meaningfulRows.length > 0 ? meaningfulRows : assetRows;

    const allCostBasisKnown = relevantRows.every((row) => row.totalCostBasis !== null);
    const aggregatedCostBasis = allCostBasisKnown
      ? relevantRows.reduce((sum, row) => sum + (row.totalCostBasis ?? 0), 0)
      : null;

    const allUnrealizedKnown = relevantRows.every((row) => row.unrealizedPnl !== null);
    const aggregatedUnrealizedPnl = allUnrealizedKnown
      ? relevantRows.reduce((sum, row) => sum + (row.unrealizedPnl ?? 0), 0)
      : null;

    const consolidatedAverageCost =
      aggregatedCostBasis !== null && Math.abs(totalQuantity) > 0
        ? aggregatedCostBasis / Math.abs(totalQuantity)
        : null;

    const consolidatedUnrealizedPct =
      aggregatedCostBasis !== null &&
      aggregatedCostBasis !== 0 &&
      aggregatedUnrealizedPnl !== null
        ? (aggregatedUnrealizedPnl / aggregatedCostBasis) * 100
        : null;

    consolidated.push({
      ...reference,
      accountId: 0,
      accountName: 'Consolidated',
      quantity: totalQuantity,
      price: hasPricedRow?.price ?? null,
      priceSource: hasPricedRow?.priceSource ?? null,
      isManual: hasPricedRow?.isManual ?? false,
      isStale: assetRows.every((row) => row.isStale),
      lastUpdated: latestUpdated,
      marketValue: hasPricedRow ? totalMarketValue : null,
      averageCost: consolidatedAverageCost,
      totalCostBasis: aggregatedCostBasis,
      unrealizedPnl: aggregatedUnrealizedPnl,
      unrealizedPnlPct: consolidatedUnrealizedPct,
    });
  });

  consolidated.sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));
  return consolidated;
}

export async function getHoldings(filters?: HoldingFilters): Promise<HoldingsResult> {
  const rows = await fetchHoldingRows(filters);
  const summary = summarizeHoldings(rows);
  return { rows, summary };
}
