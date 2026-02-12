import { prisma } from '@/lib/db';
import { getAppSettings } from '@/lib/settings';
import { resolveAssetPrice, type LatestPriceRecord } from '@/lib/pricing';
import type { Prisma } from '@prisma/client';

export type CostBasisStatus =
  | 'KNOWN'
  | 'UNKNOWN'
  | 'TRANSFER_UNMATCHED'
  | 'TRANSFER_AMBIGUOUS'
  | 'TRANSFER_INVALID'
  | 'TRANSFER_FEE_MISMATCH';

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
  costBasisKnown: boolean;
  costBasisStatus: CostBasisStatus;
  transferDiagnosticKey: string | null;
  transferDiagnosticLegIds: number[] | null;
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
  assetIds?: number[];
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

type HoldingPosition = {
  asset: LedgerTransactionWithRelations['asset'];
  account: LedgerTransactionWithRelations['account'];
  quantity: number;
  costBasis: number;
  costBasisKnown: boolean;
  costBasisStatus: CostBasisStatus;
  transferDiagnosticKey: string | null;
  transferDiagnosticLegIds: number[] | null;
};

function buildPositionKey(assetId: number, accountId: number): string {
  return `${assetId}-${accountId}`;
}

const TRANSFER_MATCH_ABS_TOLERANCE = Number(
  process.env.TRANSFER_MATCH_ABS_TOLERANCE ?? '1e-6',
);
const TRANSFER_MATCH_REL_TOLERANCE = Number(
  process.env.TRANSFER_MATCH_REL_TOLERANCE ?? '0.01',
);

function getTransferMismatchInfo(sourceQtyAbs: number, destQtyAbs: number) {
  const mismatchAbs = Math.abs(sourceQtyAbs - destQtyAbs);
  const maxQty = Math.max(sourceQtyAbs, destQtyAbs, 0);
  const mismatchRel = maxQty > 0 ? mismatchAbs / maxQty : 0;
  const withinTolerance =
    mismatchAbs <= TRANSFER_MATCH_ABS_TOLERANCE ||
    mismatchRel <= TRANSFER_MATCH_REL_TOLERANCE;
  return { mismatchAbs, mismatchRel, withinTolerance };
}

function buildTransferKey(tx: LedgerTransactionWithRelations): string {
  const reference = (tx.external_reference ?? '').trim();
  if (reference.startsWith('MATCH:')) {
    return `${tx.asset_id}|${reference}`;
  }
  const dateKey = tx.date_time.toISOString();
  return `${tx.asset_id}|${dateKey}|${reference}`;
}

function isTransferStatus(status: CostBasisStatus): boolean {
  return (
    status === 'TRANSFER_UNMATCHED' ||
    status === 'TRANSFER_AMBIGUOUS' ||
    status === 'TRANSFER_INVALID' ||
    status === 'TRANSFER_FEE_MISMATCH'
  );
}

function markCostBasisStatus(
  position: HoldingPosition,
  status: CostBasisStatus,
  diagnostic?: { key: string; legIds: number[] },
): void {
  if (status === 'UNKNOWN') {
    if (position.costBasisStatus === 'KNOWN') {
      position.costBasisStatus = 'UNKNOWN';
    }
    return;
  }

  if (isTransferStatus(position.costBasisStatus)) {
    return;
  }

  position.costBasisStatus = status;
  position.transferDiagnosticKey = diagnostic?.key ?? null;
  position.transferDiagnosticLegIds = diagnostic?.legIds ?? null;
}

export async function fetchHoldingRows(filters?: HoldingFilters): Promise<HoldingRow[]> {
  const settings = await getAppSettings();
  const refreshIntervalMinutes = settings.priceAutoRefreshIntervalMinutes;

  const where: Prisma.LedgerTransactionWhereInput = {};
  if (filters?.accountIds && filters.accountIds.length > 0) {
    where.account_id = { in: filters.accountIds };
  }
  if (filters?.assetIds && filters.assetIds.length > 0) {
    where.asset_id = { in: filters.assetIds };
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
    orderBy: [{ date_time: 'asc' }, { id: 'asc' }],
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

  const accountIds = Array.from(new Set(transactions.map((tx) => tx.account_id)));

  const futuresUnrealizedByAccountAndSymbol = new Map<number, Map<string, number>>();

  if (accountIds.length > 0) {
    const ccxtConnections = await prisma.ccxtConnection.findMany({
      where: {
        account_id: { in: accountIds },
        exchange_id: 'binance',
      },
      select: {
        account_id: true,
        metadata_json: true,
      },
    });

    for (const connection of ccxtConnections) {
      if (!connection.metadata_json) {
        continue;
      }

      try {
        const parsed = JSON.parse(connection.metadata_json) as {
          futuresSnapshot?: {
            positions?: Array<{ symbol?: string; unrealizedPnl?: number | string | null }>;
          };
        };

        const positionsSnapshot = parsed?.futuresSnapshot?.positions;
        if (!Array.isArray(positionsSnapshot)) {
          continue;
        }

        const bySymbol = new Map<string, number>();
        for (const position of positionsSnapshot) {
          const symbol = String(position?.symbol ?? '').trim().toUpperCase();
          if (!symbol) {
            continue;
          }

          const unrealizedRaw = Number(position?.unrealizedPnl ?? 0);
          if (!Number.isFinite(unrealizedRaw)) {
            continue;
          }

          bySymbol.set(symbol, (bySymbol.get(symbol) ?? 0) + unrealizedRaw);
        }

        if (bySymbol.size > 0) {
          futuresUnrealizedByAccountAndSymbol.set(connection.account_id, bySymbol);
        }
      } catch {
        // Ignore malformed metadata snapshots.
      }
    }
  }

  const positions = new Map<string, HoldingPosition>();

  const isCashLikeAsset = (asset: LedgerTransactionWithRelations['asset']): boolean => {
    const type = (asset.type ?? '').toUpperCase();
    const symbol = (asset.symbol ?? '').toUpperCase();
    return (
      type === 'CASH' ||
      type === 'STABLE' ||
      symbol === 'USD' ||
      symbol === 'USDT' ||
      symbol === 'USDC'
    );
  };

  const getContractMultiplier = (asset: LedgerTransactionWithRelations['asset']): number => {
    const type = (asset.type ?? '').toUpperCase();
    // Equity/option contracts are quoted per-share but trade in 100-share contracts.
    // TradeStation option symbols we import are per-contract quantities, so we scale valuation by 100.
    if (type === 'OPTION') {
      return 100;
    }
    return 1;
  };

  const getOrCreatePosition = (tx: LedgerTransactionWithRelations): HoldingPosition => {
    const key = buildPositionKey(tx.asset_id, tx.account_id);
    const existing = positions.get(key);
    if (existing) {
      return existing;
    }

    const position: HoldingPosition = {
      asset: tx.asset,
      account: tx.account,
      quantity: 0,
      costBasis: 0,
      costBasisKnown: true,
      costBasisStatus: 'KNOWN',
      transferDiagnosticKey: null,
      transferDiagnosticLegIds: null,
    };
    positions.set(key, position);
    return position;
  };

  const applyNonTransferTransaction = (tx: LedgerTransactionWithRelations): HoldingPosition => {
    const position = getOrCreatePosition(tx);
    const quantity = decimalToNumber(tx.quantity);

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

      return position;
    }

    const multiplier = getContractMultiplier(tx.asset);

    let txValue = getTransactionValue(
      tx.quantity,
      tx.total_value_in_base,
      tx.unit_price_in_base,
    );

    // Options: valuation fields are per-share while quantity is in contracts.
    // Convert to base-currency notional.
    if (txValue !== null && multiplier !== 1) {
      txValue *= multiplier;
    }

    const qtyBefore = position.quantity;

    if (quantity > 0) {
      if (txValue === null) {
        position.costBasisKnown = false;
        markCostBasisStatus(position, 'UNKNOWN');
        position.quantity += quantity;
        return position;
      }

      // If currently short, a buy is (partially) a buy-to-cover.
      if (qtyBefore < 0 && position.costBasisKnown) {
        const coverQty = Math.min(quantity, Math.abs(qtyBefore));
        const avgCreditPerUnit = qtyBefore === 0 ? 0 : position.costBasis / qtyBefore; // (-basis)/(-qty) => +
        position.costBasis += avgCreditPerUnit * coverQty;
        position.quantity += coverQty;

        const extraQty = quantity - coverQty;
        if (extraQty > 0) {
          const perUnit = txValue / quantity;
          if (!Number.isFinite(perUnit)) {
            position.costBasisKnown = false;
            markCostBasisStatus(position, 'UNKNOWN');
          } else {
            position.costBasis += perUnit * extraQty;
          }
          position.quantity += extraQty;
        }

        return position;
      }

      // Normal long add
      position.costBasis += txValue;
      position.quantity += quantity;
      return position;
    }

    if (quantity < 0) {
      const sellQtyAbs = Math.abs(quantity);

      if (txValue === null) {
        position.costBasisKnown = false;
        markCostBasisStatus(position, 'UNKNOWN');
        position.quantity += quantity;
        return position;
      }

      // If currently long, a sell reduces long basis; if it crosses zero, it also opens a short position.
      if (qtyBefore > 0 && position.costBasisKnown) {
        const sellFromLong = Math.min(sellQtyAbs, qtyBefore);
        const averageCostPerUnit = qtyBefore === 0 ? 0 : position.costBasis / qtyBefore;
        position.costBasis -= averageCostPerUnit * sellFromLong;

        // Apply full quantity change
        position.quantity += quantity;

        // If we crossed from long to short, record credit basis for the short portion.
        const shortOpened = sellQtyAbs - sellFromLong;
        if (shortOpened > 0) {
          const perUnit = txValue / sellQtyAbs;
          if (!Number.isFinite(perUnit)) {
            position.costBasisKnown = false;
            markCostBasisStatus(position, 'UNKNOWN');
          } else {
            position.costBasis -= perUnit * shortOpened;
          }
        }

        return position;
      }

      // Opening/increasing a short position: store credit as negative cost basis.
      position.costBasis -= txValue;
      position.quantity += quantity;
      return position;
    }

    return position;

    return position;
  };

  const hedgeBasePositionKeys = new Set<string>();
  for (const tx of transactions) {
    if (tx.tx_type !== 'HEDGE') {
      continue;
    }

    const reference = (tx.external_reference ?? '').trim();
    const isLegacyHedgeWithoutReference = reference.length === 0 && !isCashLikeAsset(tx.asset);
    const isQuoteLeg = reference.includes(':QUOTE');
    const isBaseLeg =
      isLegacyHedgeWithoutReference ||
      reference.includes(':BASE') ||
      reference.includes(':POSITION:');

    if (!isBaseLeg || isQuoteLeg) {
      continue;
    }

    hedgeBasePositionKeys.add(buildPositionKey(tx.asset_id, tx.account_id));
  }

  const transferGroups = new Map<string, LedgerTransactionWithRelations[]>();
  for (const tx of transactions) {
    if (tx.tx_type !== 'TRANSFER') {
      continue;
    }
    const key = buildTransferKey(tx);
    const group = transferGroups.get(key) ?? [];
    group.push(tx);
    transferGroups.set(key, group);
  }

  const processedTransfers = new Set<string>();

  for (const tx of transactions) {
    if (tx.tx_type === 'COST_BASIS_RESET') {
      const position = getOrCreatePosition(tx);
      const resetValue = decimalToNullableNumber(tx.total_value_in_base);
      if (resetValue === null) {
        position.costBasisKnown = false;
        position.costBasisStatus = 'UNKNOWN';
      } else {
        position.costBasisKnown = true;
        position.costBasisStatus = 'KNOWN';
        position.costBasis = Math.max(Math.abs(resetValue), 0);
      }
      position.transferDiagnosticKey = null;
      position.transferDiagnosticLegIds = null;
      continue;
    }

    if (tx.tx_type === 'RECONCILIATION') {
      const position = getOrCreatePosition(tx);
      const quantity = decimalToNumber(tx.quantity);
      position.quantity += quantity;

      // Clean up dust and ghost basis
      if (Math.abs(position.quantity) <= 1e-12) {
        position.quantity = 0;
        position.costBasis = 0;
      }

      continue;
    }

    if (tx.tx_type !== 'TRANSFER') {
      applyNonTransferTransaction(tx);
      continue;
    }

    const transferKey = buildTransferKey(tx);
    const group = transferGroups.get(transferKey);
    if (!group) {
      applyNonTransferTransaction(tx);
      continue;
    }

    if (processedTransfers.has(transferKey)) {
      continue;
    }

    processedTransfers.add(transferKey);

    const legIds = group.map((leg) => leg.id);

    if (group.length !== 2) {
      const issue = group.length < 2 ? 'TRANSFER_UNMATCHED' : 'TRANSFER_AMBIGUOUS';
      const diagnostic = { key: transferKey, legIds };
      for (const leg of group) {
        const position = applyNonTransferTransaction(leg);
        if (!position.costBasisKnown && Math.abs(position.quantity) > 1e-12) {
          markCostBasisStatus(position, issue, diagnostic);
        }
      }
      continue;
    }

    const [legA, legB] = group;
    const qtyA = decimalToNullableNumber(legA.quantity);
    const qtyB = decimalToNullableNumber(legB.quantity);
    const isManualMatch = (legA.external_reference || '').startsWith('MATCH:');

    const quantitiesValid = qtyA !== null && qtyB !== null;
    const signsDiffer = quantitiesValid && ((qtyA > 0 && qtyB < 0) || (qtyA < 0 && qtyB > 0));

    if (
      !quantitiesValid ||
      qtyA === 0 ||
      qtyB === 0 ||
      legA.asset_id !== legB.asset_id ||
      legA.account_id === legB.account_id ||
      !signsDiffer
    ) {
      const diagnostic = { key: transferKey, legIds };
      for (const leg of group) {
        const position = applyNonTransferTransaction(leg);
        if (!position.costBasisKnown && Math.abs(position.quantity) > 1e-12) {
          markCostBasisStatus(position, 'TRANSFER_INVALID', diagnostic);
        }
      }
      continue;
    }

    const validQtyA = qtyA as number;
    const validQtyB = qtyB as number;
    const sourceLeg = validQtyA < 0 ? legA : legB;
    const destLeg = sourceLeg === legA ? legB : legA;

    const sourceQtyAbs = Math.abs(validQtyA < 0 ? validQtyA : validQtyB);
    const destQtyAbs = Math.abs(validQtyA < 0 ? validQtyB : validQtyA);

    const mismatchInfo = getTransferMismatchInfo(sourceQtyAbs, destQtyAbs);
    const withinTolerance = isManualMatch ? true : mismatchInfo.withinTolerance;
    const feeMismatch = !withinTolerance && destQtyAbs <= sourceQtyAbs;

    if (!withinTolerance && destQtyAbs > sourceQtyAbs) {
      const diagnostic = { key: transferKey, legIds };
      for (const leg of group) {
        const position = applyNonTransferTransaction(leg);
        if (!position.costBasisKnown && Math.abs(position.quantity) > 1e-12) {
          markCostBasisStatus(position, 'TRANSFER_INVALID', diagnostic);
        }
      }
      continue;
    }

    const transferQty = Math.min(sourceQtyAbs, destQtyAbs);

    const sourcePosition = getOrCreatePosition(sourceLeg);
    const destPosition = getOrCreatePosition(destLeg);

    const sourceQtyBefore = sourcePosition.quantity;

    sourcePosition.quantity += decimalToNumber(sourceLeg.quantity);
    destPosition.quantity += decimalToNumber(destLeg.quantity);

    if (!sourcePosition.costBasisKnown || sourceQtyBefore <= 0) {
      sourcePosition.costBasisKnown = sourcePosition.costBasisKnown && sourceQtyBefore > 0;
      if (!sourcePosition.costBasisKnown) {
        markCostBasisStatus(sourcePosition, 'UNKNOWN');
      }
      destPosition.costBasisKnown = false;
      markCostBasisStatus(destPosition, 'UNKNOWN');
      continue;
    }

    const averageCost = sourcePosition.costBasis / sourceQtyBefore;
    const movedBasis = averageCost * transferQty;
    const sourceReduction = averageCost * sourceQtyAbs;

    if (!Number.isFinite(movedBasis) || !Number.isFinite(sourceReduction)) {
      destPosition.costBasisKnown = false;
      markCostBasisStatus(destPosition, 'UNKNOWN');
      continue;
    }

    sourcePosition.costBasis -= sourceReduction;
    if (sourcePosition.costBasis < 0) {
      sourcePosition.costBasis = 0;
    }

    destPosition.costBasis += movedBasis;

    if (feeMismatch) {
      const diagnostic = { key: transferKey, legIds };
      markCostBasisStatus(destPosition, 'TRANSFER_FEE_MISMATCH', diagnostic);
    }
  }

  const rows: HoldingRow[] = [];
  const HOLDING_ZERO_THRESHOLD = 1e-9;

  for (const position of positions.values()) {
    const asset = position.asset;
    const account = position.account;
    const quantity = position.quantity;

    // Suppress dust/fully reconciled ghost rows from historical transactions.
    if (Math.abs(quantity) <= HOLDING_ZERO_THRESHOLD) {
      continue;
    }

    const latestPriceRecord = buildLatestPriceRecord(asset.price_latest ?? null);
    const priceResolution = resolveAssetPrice({
      pricingMode: asset.pricing_mode as 'AUTO' | 'MANUAL',
      manualPrice: asset.manual_price ? decimalToNumber(asset.manual_price) : null,
      latestPrice: latestPriceRecord,
      refreshIntervalMinutes,
    });

    const price = isValidPrice(priceResolution.price) ? priceResolution.price : null;
    const multiplier = getContractMultiplier(asset);

    let marketValue = price !== null ? quantity * price * multiplier : null;

    const positionKey = buildPositionKey(asset.id, account.id);
    const isHedgeBasePosition = hedgeBasePositionKeys.has(positionKey);

    if (isHedgeBasePosition) {
      const accountSnapshot = futuresUnrealizedByAccountAndSymbol.get(account.id);
      const snapshotUnrealized = accountSnapshot?.get(asset.symbol.trim().toUpperCase());
      if (typeof snapshotUnrealized === 'number' && Number.isFinite(snapshotUnrealized)) {
        marketValue = snapshotUnrealized;
      }
    }

    const totalCostBasis = position.costBasisKnown ? position.costBasis : null;
    const costBasisStatus = position.costBasisStatus;

    // Average cost:
    // - Display per-share premium for options (divide by contract multiplier)
    // - Otherwise per-unit
    const averageCost =
      totalCostBasis !== null && quantity !== 0
        ? (totalCostBasis / quantity) / multiplier
        : null;

    const unrealizedPnl =
      marketValue !== null && totalCostBasis !== null
        ? marketValue - totalCostBasis
        : null;

    const pnlPctDenom = totalCostBasis !== null && totalCostBasis !== 0
      ? Math.abs(totalCostBasis)
      : null;

    const unrealizedPnlPct =
      pnlPctDenom !== null && unrealizedPnl !== null
        ? (unrealizedPnl / pnlPctDenom) * 100
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
      costBasisKnown: position.costBasisKnown,
      costBasisStatus,
      transferDiagnosticKey: position.transferDiagnosticKey,
      transferDiagnosticLegIds: position.transferDiagnosticLegIds,
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

    const consolidatedCostBasisKnown = relevantRows.every((row) => row.costBasisKnown);
    const transferIssueRow = relevantRows.find((row) =>
      row.costBasisStatus === 'TRANSFER_UNMATCHED' ||
      row.costBasisStatus === 'TRANSFER_AMBIGUOUS' ||
      row.costBasisStatus === 'TRANSFER_INVALID' ||
      row.costBasisStatus === 'TRANSFER_FEE_MISMATCH',
    );
    const consolidatedCostBasisStatus = transferIssueRow
      ? transferIssueRow.costBasisStatus
      : consolidatedCostBasisKnown
        ? 'KNOWN'
        : 'UNKNOWN';
    const consolidatedTransferKey = transferIssueRow?.transferDiagnosticKey ?? null;
    const consolidatedTransferLegIds = transferIssueRow?.transferDiagnosticLegIds ?? null;

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
      costBasisKnown: consolidatedCostBasisKnown,
      costBasisStatus: consolidatedCostBasisStatus,
      transferDiagnosticKey: consolidatedTransferKey,
      transferDiagnosticLegIds: consolidatedTransferLegIds,
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
