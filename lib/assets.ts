import { prisma } from '@/lib/db';

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