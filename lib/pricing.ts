import { resolveCoinGeckoIdFromSymbol } from './coingecko';
import { coingeckoRateLimiter } from './rateLimiter';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const FINNHUB_QUOTE_URL = 'https://finnhub.io/api/v1/quote';

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000; // 1 second
const MAX_RETRY_DELAY_MS = 10000; // 10 seconds

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateRetryDelay(attempt: number): number {
  // Exponential backoff: delay = initialDelay * (2 ^ attempt) + jitter
  const exponentialDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * 1000; // Add up to 1 second of jitter
  return Math.min(exponentialDelay + jitter, MAX_RETRY_DELAY_MS);
}

/**
 * Log pricing operation details for debugging
 */
export function logPricingOperation(operation: string, details: any, level: 'info' | 'warn' | 'error' = 'info') {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    operation,
    details,
    level
  };
  
  console[level](`[PRICING:${operation.toUpperCase()}]`, JSON.stringify(logEntry));
}

export type ProviderPrice = {
  price: number;
  source: string;
  updatedAt: Date;
};

export interface BatchedCryptoPrices {
  [symbol: string]: ProviderPrice | null;
}

export type CryptoPriceLookupInput =
  | string
  | {
      symbol: string;
      coinGeckoId?: string | null;
    };

type ResolvedCryptoLookup = {
  symbol: string;
  coinGeckoId: string;
};

function resolveCryptoLookups(inputs: CryptoPriceLookupInput[]): ResolvedCryptoLookup[] {
  return inputs
    .map((input) => {
      if (typeof input === 'string') {
        const symbol = input.trim().toUpperCase();
        if (!symbol) return null;
        return {
          symbol,
          coinGeckoId: resolveCoinGeckoIdFromSymbol({ symbol }),
        };
      }

      const symbol = input.symbol.trim().toUpperCase();
      if (!symbol) return null;

      return {
        symbol,
        coinGeckoId: resolveCoinGeckoIdFromSymbol({
          symbol,
          coinGeckoIdOverride: input.coinGeckoId,
        }),
      };
    })
    .filter((item): item is ResolvedCryptoLookup => Boolean(item));
}

/**
 * Fetch multiple crypto prices in a single batched API call with retry logic.
 * Inputs can be simple symbols or explicit CoinGecko mapping objects.
 */
export async function fetchBatchCryptoPrices(
  inputs: CryptoPriceLookupInput[],
): Promise<BatchedCryptoPrices> {
  const lookups = resolveCryptoLookups(inputs);

  logPricingOperation('batch_fetch_start', {
    symbolCount: lookups.length,
    mappings: lookups.map((lookup) => ({ symbol: lookup.symbol, coinGeckoId: lookup.coinGeckoId })),
  });

  const results: BatchedCryptoPrices = {};
  if (lookups.length === 0) {
    return results;
  }

  const symbolsByCoinId = new Map<string, string[]>();
  for (const lookup of lookups) {
    const symbols = symbolsByCoinId.get(lookup.coinGeckoId) ?? [];
    symbols.push(lookup.symbol);
    symbolsByCoinId.set(lookup.coinGeckoId, symbols);
  }

  const coinIds = Array.from(symbolsByCoinId.keys());
  const maxCoinsPerBatch = 10;
  let totalSuccessful = 0;
  let totalFailed = 0;

  for (let i = 0; i < coinIds.length; i += maxCoinsPerBatch) {
    const batchCoinIds = coinIds.slice(i, i + maxCoinsPerBatch);
    const batchNumber = Math.floor(i / maxCoinsPerBatch) + 1;
    const totalBatches = Math.ceil(coinIds.length / maxCoinsPerBatch);
    const coinIdList = batchCoinIds.join(',');

    logPricingOperation('batch_start', {
      batchNumber,
      totalBatches,
      coinIds: batchCoinIds,
      batchSize: batchCoinIds.length,
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        await coingeckoRateLimiter.waitForSlot();

        const apiKey = process.env.COINGECKO_API_KEY;
        const url = new URL(`${COINGECKO_BASE}/simple/price`);
        url.searchParams.set('ids', coinIdList);
        url.searchParams.set('vs_currencies', 'usd');

        if (apiKey) {
          url.searchParams.set('x_cg_demo_api_key', apiKey);
        }

        const response = await fetch(url.toString(), {
          headers: {
            Accept: 'application/json',
            ...(apiKey && { 'x-cg-demo-api-key': apiKey }),
          },
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`CoinGecko API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = (await response.json()) as Record<string, { usd?: number }>;

        let batchSuccessCount = 0;
        let batchFailCount = 0;

        for (const coinId of batchCoinIds) {
          const symbols = symbolsByCoinId.get(coinId) ?? [];
          const quote = data[coinId];

          if (!quote || typeof quote.usd !== 'number') {
            for (const symbol of symbols) {
              results[symbol] = null;
              batchFailCount += 1;
              logPricingOperation(
                'symbol_fetch_failed',
                {
                  symbol,
                  coinId,
                  batchNumber,
                  reason: 'Invalid or missing price data',
                },
                'warn',
              );
            }
            continue;
          }

          for (const symbol of symbols) {
            results[symbol] = {
              price: quote.usd,
              source: 'CoinGecko',
              updatedAt: new Date(),
            };
            batchSuccessCount += 1;
          }
        }

        totalSuccessful += batchSuccessCount;
        totalFailed += batchFailCount;

        logPricingOperation('batch_complete', {
          batchNumber,
          successCount: batchSuccessCount,
          failCount: batchFailCount,
          attempt: attempt + 1,
        });

        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < MAX_RETRIES) {
          const delay = calculateRetryDelay(attempt);
          logPricingOperation(
            'batch_retry',
            {
              batchNumber,
              attempt: attempt + 1,
              maxRetries: MAX_RETRIES + 1,
              delay,
              error: lastError.message,
            },
            'warn',
          );

          await sleep(delay);
        } else {
          logPricingOperation(
            'batch_failed',
            {
              batchNumber,
              coinIds: batchCoinIds,
              error: lastError.message,
              totalAttempts: attempt + 1,
            },
            'error',
          );

          for (const coinId of batchCoinIds) {
            const symbols = symbolsByCoinId.get(coinId) ?? [];
            for (const symbol of symbols) {
              results[symbol] = null;
              totalFailed += 1;
            }
          }
        }
      }
    }
  }

  logPricingOperation('batch_fetch_complete', {
    totalSymbols: lookups.length,
    totalSuccessful,
    totalFailed,
    successRate: lookups.length > 0 ? `${((totalSuccessful / lookups.length) * 100).toFixed(2)}%` : '0%',
  });

  return results;
}

export async function fetchCryptoPrice(
  symbol: string,
  options?: { coinGeckoId?: string | null },
): Promise<ProviderPrice | null> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const batchResults = await fetchBatchCryptoPrices([
    {
      symbol: normalizedSymbol,
      coinGeckoId: options?.coinGeckoId,
    },
  ]);
  return batchResults[normalizedSymbol] || null;
}

/**
 * Get rate limiter statistics for monitoring
 */
export function getCoinGeckoRateLimitStats() {
  return coingeckoRateLimiter.getStats();
}

export async function fetchEquityPrice(symbol: string): Promise<ProviderPrice | null> {
  logPricingOperation('equity_fetch_start', { symbol });
  
  const trimmed = symbol.trim().toUpperCase();
  const apiKey = process.env.FINNHUB_API_KEY;
  
  if (!apiKey) {
    logPricingOperation('equity_fetch_failed', {
      symbol,
      reason: 'FINNHUB_API_KEY is not set'
    }, 'error');
    return null;
  }

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const url = `${FINNHUB_QUOTE_URL}?symbol=${encodeURIComponent(trimmed)}&token=${encodeURIComponent(apiKey)}`;
      
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Finnhub API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const payload = (await response.json()) as {
        c?: number; // current price
        t?: number; // timestamp (seconds)
      };

      if (typeof payload.c !== 'number') {
        throw new Error('Invalid price data received from Finnhub');
      }

      const result = {
        price: payload.c,
        source: 'Finnhub',
        updatedAt: payload.t ? new Date(payload.t * 1000) : new Date(),
      };
      
      logPricingOperation('equity_fetch_success', {
        symbol,
        price: payload.c,
        attempt: attempt + 1
      });
      
      return result;
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < MAX_RETRIES) {
        const delay = calculateRetryDelay(attempt);
        logPricingOperation('equity_fetch_retry', {
          symbol,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES + 1,
          delay,
          error: lastError.message
        }, 'warn');
        
        await sleep(delay);
      } else {
        logPricingOperation('equity_fetch_failed', {
          symbol,
          error: lastError.message,
          totalAttempts: attempt + 1
        }, 'error');
      }
    }
  }
  
  return null;
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
