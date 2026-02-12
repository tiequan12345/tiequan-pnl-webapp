import { prisma } from '@/lib/db';
import { getAppSettings } from '@/lib/settings';
import {
  decimalToNumber,
  fetchHoldingRows,
  summarizeHoldings,
} from '@/lib/holdings';

const DEFAULT_LIMIT = 90;
const MAX_LIMIT = 5000;

export type PnlFilters = {
  accountIds?: number[];
  assetTypes?: string[];
  volatilityBuckets?: string[];
  from?: Date;
  to?: Date;
  limit?: number;
};

export type PnlAccountSummary = {
  name: string;
  value: number;
};

export type PnlAssetSummary = {
  assetId: number;
  symbol: string;
  name: string;
  type: string;
  volatilityBucket: string;
  value: number; // market value
  quantity: number;
  price: number;
};

export type PnlSnapshotPoint = {
  snapshotId: number;
  snapshotAt: Date;
  totalValue: number;
  baseCurrency: string;
  byType: Record<string, number>;
  byVolatility: Record<string, number>;
  byAccount: Record<number, PnlAccountSummary>;
  byAsset: Record<number, PnlAssetSummary>;
};

export type PnlSnapshotsResult = {
  baseCurrency: string;
  points: PnlSnapshotPoint[];
};

type CreatePortfolioSnapshotOptions = {
  timestamp?: Date;
  dedupeWindowMinutes?: number;
};

function normalizeToInterval(date: Date, minutes: number) {
  const msPerInterval = minutes * 60 * 1000;
  return new Date(Math.floor(date.getTime() / msPerInterval) * msPerInterval);
}

function sanitizeLimit(value?: number) {
  if (!value || Number.isNaN(value)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(value, 1), MAX_LIMIT);
}

export async function createPortfolioSnapshot(
  options?: CreatePortfolioSnapshotOptions,
): Promise<PnlSnapshotPoint | null> {
  const now = options?.timestamp ?? new Date();
  const windowMinutes = options?.dedupeWindowMinutes ?? 1;
  const snapshotAt = normalizeToInterval(now, windowMinutes);

  const [settings, rows] = await Promise.all([
    getAppSettings(),
    fetchHoldingRows(),
  ]);

  const summary = summarizeHoldings(rows);
  const components = rows.map((row) => ({
    asset_id: row.assetId,
    asset_symbol: row.assetSymbol,
    asset_name: row.assetName,
    asset_type: row.assetType,
    volatility_bucket: row.volatilityBucket,
    account_id: row.accountId,
    account_name: row.accountName,
    quantity: row.quantity,
    price_in_base: row.price ?? undefined,
    market_value: row.marketValue ?? undefined,
  }));

  const snapshot = await prisma.$transaction(async (tx) => {
    const created = await tx.portfolioSnapshot.upsert({
      where: { snapshot_at: snapshotAt },
      create: {
        snapshot_at: snapshotAt,
        base_currency: settings.baseCurrency,
        total_value: summary.totalValue,
      },
      update: {
        base_currency: settings.baseCurrency,
        total_value: summary.totalValue,
      },
    });

    await tx.portfolioSnapshotComponent.deleteMany({
      where: { snapshot_id: created.id },
    });

    if (components.length > 0) {
      await tx.portfolioSnapshotComponent.createMany({
        data: components.map((component) => ({
          ...component,
          snapshot_id: created.id,
        })),
      });
    }

    return created;
  });

  if (!snapshot) {
    return null;
  }

  return {
    snapshotId: snapshot.id,
    snapshotAt: snapshot.snapshot_at,
    totalValue: decimalToNumber(snapshot.total_value),
    baseCurrency: snapshot.base_currency,
    byType: {},
    byVolatility: {},
    byAccount: {},
    byAsset: {},
  };
}

export async function fetchSnapshots(
  filters: PnlFilters = {},
): Promise<PnlSnapshotsResult> {
  const settings = await getAppSettings();

  // If date filters are active and no limit is specified, we default to MAX_LIMIT
  // to ensure we capture the requested timeframe.
  // Otherwise (no date filters, no limit), we use DEFAULT_LIMIT for initial view.
  const hasDateFilters = !!(filters.from || filters.to);
  const effectiveLimit = filters.limit
    ? sanitizeLimit(filters.limit)
    : hasDateFilters
      ? MAX_LIMIT
      : DEFAULT_LIMIT;

  const snapshotWhere: any = {};

  if (filters.from || filters.to) {
    snapshotWhere.snapshot_at = {};
    if (filters.from) {
      snapshotWhere.snapshot_at.gte = filters.from;
    }
    if (filters.to) {
      snapshotWhere.snapshot_at.lte = filters.to;
    }
  }

  const snapshots = await prisma.portfolioSnapshot.findMany({
    where: snapshotWhere,
    orderBy: { snapshot_at: 'desc' },
    take: effectiveLimit,
  });

  if (snapshots.length === 0) {
    return { baseCurrency: settings.baseCurrency, points: [] };
  }

  const snapshotIds = snapshots.map((snapshot) => snapshot.id);

  const componentWhere: any = {
    snapshot_id: { in: snapshotIds },
    ...(filters.accountIds && filters.accountIds.length > 0
      ? { account_id: { in: filters.accountIds } }
      : {}),
    ...(filters.assetTypes && filters.assetTypes.length > 0
      ? { asset_type: { in: filters.assetTypes } }
      : {}),
    ...(filters.volatilityBuckets && filters.volatilityBuckets.length > 0
      ? { volatility_bucket: { in: filters.volatilityBuckets } }
      : {}),
  };

  const [totals, typeGroups, volatilityGroups, accountGroups, assetGroups] =
    await prisma.$transaction([
      prisma.portfolioSnapshotComponent.groupBy({
        by: ['snapshot_id'],
        _sum: { market_value: true },
        where: componentWhere,
        orderBy: { snapshot_id: 'asc' },
      }),
      prisma.portfolioSnapshotComponent.groupBy({
        by: ['snapshot_id', 'asset_type'],
        _sum: { market_value: true },
        where: componentWhere,
        orderBy: { snapshot_id: 'asc' },
      }),
      prisma.portfolioSnapshotComponent.groupBy({
        by: ['snapshot_id', 'volatility_bucket'],
        _sum: { market_value: true },
        where: componentWhere,
        orderBy: { snapshot_id: 'asc' },
      }),
      prisma.portfolioSnapshotComponent.groupBy({
        by: ['snapshot_id', 'account_id', 'account_name'],
        _sum: { market_value: true },
        where: componentWhere,
        orderBy: { snapshot_id: 'asc' },
      }),
      prisma.portfolioSnapshotComponent.groupBy({
        by: [
          'snapshot_id',
          'asset_id',
          'asset_symbol',
          'asset_name',
          'asset_type',
          'volatility_bucket',
        ],
        _sum: { market_value: true, quantity: true },
        _max: { price_in_base: true },
        where: componentWhere,
        orderBy: { snapshot_id: 'asc' },
      }),
    ]);

  const totalMap = new Map<number, number>();
  for (const entry of totals) {
    totalMap.set(entry.snapshot_id, decimalToNumber(entry._sum?.market_value || 0));
  }

  const typeMap = new Map<number, Record<string, number>>();
  for (const entry of typeGroups) {
    const snapshotId = entry.snapshot_id;
    const bucket = entry.asset_type;
    if (!bucket) continue;
    const current = typeMap.get(snapshotId) ?? {};
    current[bucket] =
      (current[bucket] ?? 0) + decimalToNumber(entry._sum?.market_value || 0);
    typeMap.set(snapshotId, current);
  }

  const volatilityMap = new Map<number, Record<string, number>>();
  for (const entry of volatilityGroups) {
    const snapshotId = entry.snapshot_id;
    const bucket = entry.volatility_bucket;
    if (!bucket) continue;
    const current = volatilityMap.get(snapshotId) ?? {};
    current[bucket] =
      (current[bucket] ?? 0) + decimalToNumber(entry._sum?.market_value || 0);
    volatilityMap.set(snapshotId, current);
  }

  const accountMap = new Map<number, Record<number, PnlAccountSummary>>();
  for (const entry of accountGroups) {
    const snapshotId = entry.snapshot_id;
    const accountId = entry.account_id;
    if (!accountId || !entry.account_name) continue;
    const current = accountMap.get(snapshotId) ?? {};
    current[accountId] = {
      name: entry.account_name,
      value: decimalToNumber(entry._sum?.market_value || 0),
    };
    accountMap.set(snapshotId, current);
  }

  const assetMap = new Map<number, Record<number, PnlAssetSummary>>();
  for (const entry of assetGroups) {
    const snapshotId = entry.snapshot_id;
    const assetId = entry.asset_id;
    if (!assetId) continue;
    const current = assetMap.get(snapshotId) ?? {};
    current[assetId] = {
      assetId,
      symbol: entry.asset_symbol ?? 'Unknown',
      name: entry.asset_name ?? 'Unknown',
      type: entry.asset_type ?? 'Unknown',
      volatilityBucket: entry.volatility_bucket ?? 'Unknown',
      value: decimalToNumber(entry._sum?.market_value || 0),
      quantity: decimalToNumber(entry._sum?.quantity || 0),
      price: decimalToNumber(entry._max?.price_in_base || 0),
    };
    assetMap.set(snapshotId, current);
  }

  const points: PnlSnapshotPoint[] = snapshots
    .map((snapshot) => ({
      snapshotId: snapshot.id,
      snapshotAt: snapshot.snapshot_at,
      totalValue: totalMap.get(snapshot.id) ?? 0,
      baseCurrency: snapshot.base_currency,
      byType: typeMap.get(snapshot.id) ?? {},
      byVolatility: volatilityMap.get(snapshot.id) ?? {},
      byAccount: accountMap.get(snapshot.id) ?? {},
      byAsset: assetMap.get(snapshot.id) ?? {},
    }))
    .reverse();

  return {
    baseCurrency: settings.baseCurrency,
    points,
  };
}
