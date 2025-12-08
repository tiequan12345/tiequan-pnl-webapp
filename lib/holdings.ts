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
};

export type HoldingsSummary = {
  totalValue: number;
  byType: Record<string, number>;
  byVolatility: Record<string, number>;
  updatedAt: Date | null;
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

function decimalToNumber(value: Prisma.Decimal | number | bigint | string | null | undefined): number {
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

function buildLatestPriceRecord(record: { price_in_base: Prisma.Decimal; last_updated: Date } | null | undefined): LatestPriceRecord | null {
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

export async function fetchHoldingRows(filters?: HoldingFilters): Promise<HoldingRow[]> {
  const settings = await getAppSettings();
  const refreshIntervalMinutes = settings.priceAutoRefreshIntervalMinutes;

  const where: Prisma.LedgerTransactionWhereInput = {};
  if (filters?.accountIds && filters.accountIds.length > 0) {
    where.account_id = { in: filters.accountIds };
  }

  const grouped = await prisma.ledgerTransaction.groupBy({
    by: ['asset_id', 'account_id'],
    _sum: {
      quantity: true,
    },
    where,
  });

  if (grouped.length === 0) {
    return [];
  }

  const assetIds = Array.from(new Set(grouped.map((row) => row.asset_id)));
  const accountIds = Array.from(new Set(grouped.map((row) => row.account_id)));

  const assets = await prisma.asset.findMany({
    where: {
      id: { in: assetIds },
      ...(filters?.assetTypes && filters.assetTypes.length > 0
        ? { type: { in: filters.assetTypes } }
        : {}),
      ...(filters?.volatilityBuckets && filters.volatilityBuckets.length > 0
        ? { volatility_bucket: { in: filters.volatilityBuckets } }
        : {}),
    },
    include: {
      price_latest: true,
    },
  });

  const assetMap = assets.reduce<Record<number, (typeof assets)[number]>>((acc, asset) => {
    acc[asset.id] = asset;
    return acc;
  }, {});

  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds } },
  });

  const accountMap = accounts.reduce<Record<number, (typeof accounts)[number]>>((acc, account) => {
    acc[account.id] = account;
    return acc;
  }, {});

  const rows: HoldingRow[] = [];

  for (const group of grouped) {
    const asset = assetMap[group.asset_id];
    if (!asset) {
      continue;
    }

    const account = accountMap[group.account_id];
    if (!account) {
      continue;
    }

    const quantity = decimalToNumber(group._sum.quantity);
    const latestPriceRecord = buildLatestPriceRecord(asset.price_latest ?? null);

    const priceResolution = resolveAssetPrice({
      pricingMode: asset.pricing_mode as 'AUTO' | 'MANUAL',
      manualPrice: asset.manual_price ? decimalToNumber(asset.manual_price) : null,
      latestPrice: latestPriceRecord,
      refreshIntervalMinutes,
    });

    const price = isValidPrice(priceResolution.price) ? priceResolution.price : null;
    const marketValue = price ? quantity * price : null;

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
    });
  }

  rows.sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));
  return rows;
}

export function summarizeHoldings(rows: HoldingRow[]): HoldingsSummary {
  const summary: HoldingsSummary = {
    totalValue: 0,
    byType: {},
    byVolatility: {},
    updatedAt: null,
  };

  for (const row of rows) {
    if (isValidPrice(row.price) && row.marketValue !== null) {
      summary.totalValue += row.marketValue;

      summary.byType[row.assetType] = (summary.byType[row.assetType] || 0) + row.marketValue;
      summary.byVolatility[row.volatilityBucket] =
        (summary.byVolatility[row.volatilityBucket] || 0) + row.marketValue;

      if (!summary.updatedAt || (row.lastUpdated && row.lastUpdated > summary.updatedAt)) {
        summary.updatedAt = row.lastUpdated;
      }
    }
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