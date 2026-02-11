export const COINGECKO_SYMBOL_OVERRIDES: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  BNB: 'binancecoin',
  USDT: 'tether',
  USDC: 'usd-coin',
  DOT: 'polkadot',
  MATIC: 'matic-network',
};

export function normalizeCoinGeckoId(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

export function resolveCoinGeckoIdFromSymbol(params: {
  symbol: string;
  coinGeckoIdOverride?: string | null;
}): string {
  const override = normalizeCoinGeckoId(params.coinGeckoIdOverride);
  if (override) {
    return override;
  }

  const normalizedSymbol = params.symbol.trim().toUpperCase();
  return COINGECKO_SYMBOL_OVERRIDES[normalizedSymbol] ?? normalizedSymbol.toLowerCase();
}
