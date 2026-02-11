import { prisma } from '@/lib/db';

function decimalToNumber(value: unknown): number {
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
  if (typeof (value as { toNumber?: () => number }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
}

/**
 * Ensure assets exist in the database by symbol, creating them if necessary.
 * This is a shared utility used by both TradeStation and CCXT sync pipelines.
 *
 * @param inputs - Array of objects with symbol and optional assetType
 * @returns Map of symbol to asset ID
 */
export async function ensureAssetsBySymbol(
  inputs: { symbol: string; assetType?: string }[],
): Promise<Map<string, number>> {
  const uniqueSymbols = Array.from(
    new Set(inputs.map((i) => i.symbol.trim()).filter(Boolean)),
  );
  const typeBySymbol = new Map<string, string | undefined>();
  for (const input of inputs) {
    if (!input.symbol) continue;
    const symbol = input.symbol.trim();
    if (!symbol) continue;
    if (!typeBySymbol.has(symbol)) {
      typeBySymbol.set(symbol, input.assetType);
    }
  }

  const map = new Map<string, number>();

  if (uniqueSymbols.length === 0) {
    return map;
  }

  const existing = await prisma.asset.findMany({
    where: { symbol: { in: uniqueSymbols } },
    select: { id: true, symbol: true },
  });

  for (const asset of existing) {
    map.set(asset.symbol, asset.id);
  }

  const missing = uniqueSymbols.filter((symbol) => !map.has(symbol));

  for (const symbol of missing) {
    const suggestedType = typeBySymbol.get(symbol);
    const type = suggestedType && ['EQUITY', 'OPTION', 'CRYPTO', 'CASH', 'OTHER'].includes(suggestedType)
      ? suggestedType
      : 'EQUITY';

    const created = await prisma.asset.create({
      data: {
        symbol,
        name: symbol,
        type,
        volatility_bucket: 'VOLATILE',
        chain_or_market: 'US',
        pricing_mode: 'AUTO',
        status: 'INACTIVE',
        metadata_json: JSON.stringify({
          source: 'AUTO_CREATED',
          raw_symbol: symbol,
          suggested_type: suggestedType ?? null
        }),
      },
      select: { id: true, symbol: true },
    });

    map.set(created.symbol, created.id);
  }

  return map;
}

export async function updateAssetStatuses(assetIds: number[]): Promise<void> {
  const uniqueIds = Array.from(new Set(assetIds.filter((id) => Number.isFinite(id))));
  if (uniqueIds.length === 0) {
    return;
  }

  const totals = await prisma.ledgerTransaction.groupBy({
    by: ['asset_id'],
    where: { asset_id: { in: uniqueIds } },
    _sum: { quantity: true },
  });

  const totalMap = new Map<number, number>();
  for (const row of totals) {
    totalMap.set(row.asset_id, decimalToNumber(row._sum.quantity));
  }

  const epsilon = 1e-6;
  const activeIds: number[] = [];
  const inactiveIds: number[] = [];

  for (const assetId of uniqueIds) {
    const total = totalMap.get(assetId) ?? 0;
    if (Math.abs(total) > epsilon) {
      activeIds.push(assetId);
    } else {
      inactiveIds.push(assetId);
    }
  }

  if (activeIds.length > 0) {
    await prisma.asset.updateMany({
      where: { id: { in: activeIds } },
      data: { status: 'ACTIVE' },
    });
  }

  if (inactiveIds.length > 0) {
    await prisma.asset.updateMany({
      where: { id: { in: inactiveIds } },
      data: { status: 'INACTIVE' },
    });
  }
}

export async function updateAssetStatusesForAccount(accountId: number): Promise<void> {
  const assetRows = await prisma.ledgerTransaction.findMany({
    where: { account_id: accountId },
    select: { asset_id: true },
    distinct: ['asset_id'],
  });

  await updateAssetStatuses(assetRows.map((row) => row.asset_id));
}