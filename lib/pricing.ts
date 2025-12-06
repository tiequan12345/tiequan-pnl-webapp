const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const FINNHUB_QUOTE_URL = 'https://finnhub.io/api/v1/quote';

const COINGECKO_OVERRIDES: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  BNB: 'binancecoin',
  USDT: 'tether',
  USDC: 'usd-coin',
};

export type ProviderPrice = {
  price: number;
  source: string;
  updatedAt: Date;
};

export async function fetchCryptoPrice(symbol: string): Promise<ProviderPrice | null> {
  try {
    const normalized = symbol.trim().toUpperCase();
    const coinId = COINGECKO_OVERRIDES[normalized] ?? normalized.toLowerCase();

    const response = await fetch(
      `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(
        coinId,
      )}&vs_currencies=usd`,
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as Record<string, { usd?: number }>;

    const quote = data[coinId];
    if (!quote || typeof quote.usd !== 'number') {
      return null;
    }

    return {
      price: quote.usd,
      source: 'CoinGecko',
      updatedAt: new Date(),
    };
  } catch {
    return null;
  }
}

export async function fetchEquityPrice(symbol: string): Promise<ProviderPrice | null> {
  try {
    const trimmed = symbol.trim().toUpperCase();
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      console.error('FINNHUB_API_KEY is not set');
      return null;
    }

    const url = `${FINNHUB_QUOTE_URL}?symbol=${encodeURIComponent(trimmed)}&token=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      c?: number; // current price
      t?: number; // timestamp (seconds)
    };

    if (typeof payload.c !== 'number') {
      return null;
    }

    return {
      price: payload.c,
      source: 'Finnhub',
      updatedAt: payload.t ? new Date(payload.t * 1000) : new Date(),
    };
  } catch (err) {
    console.error('Failed to fetch equity price from Finnhub', err);
    return null;
  }
}

export interface LatestPriceRecord {
  priceInBase: number;
  lastUpdated: Date;
}

export interface PriceResolutionResult {
  price: number | null;
  source: string | null;
  lastUpdated: Date | null;
  isManual: boolean;
  isStale: boolean;
}

export function isPriceStale(
  lastUpdated: Date | null | undefined,
  refreshIntervalMinutes: number,
  multiplier = 3,
): boolean {
  if (!lastUpdated) {
    return true;
  }

  const thresholdMs = refreshIntervalMinutes * multiplier * 60 * 1000;
  return Date.now() - lastUpdated.getTime() > thresholdMs;
}

export function resolveAssetPrice({
  pricingMode,
  manualPrice,
  latestPrice,
  refreshIntervalMinutes,
}: {
  pricingMode: 'AUTO' | 'MANUAL';
  manualPrice?: number | null;
  latestPrice?: LatestPriceRecord | null;
  refreshIntervalMinutes: number;
}): PriceResolutionResult {
  if (pricingMode === 'MANUAL' && manualPrice !== undefined && manualPrice !== null) {
    return {
      price: manualPrice,
      source: 'Manual Entry',
      lastUpdated: latestPrice?.lastUpdated ?? null,
      isManual: true,
      isStale: manualPrice === null,
    };
  }

  if (latestPrice) {
    const stale = isPriceStale(latestPrice.lastUpdated, refreshIntervalMinutes);
    return {
      price: latestPrice.priceInBase,
      source: 'Auto Price',
      lastUpdated: latestPrice.lastUpdated,
      isManual: false,
      isStale: stale,
    };
  }

  return {
    price: manualPrice ?? null,
    source: manualPrice ? 'Manual Entry' : null,
    lastUpdated: null,
    isManual: Boolean(manualPrice),
    isStale: true,
  };
}
