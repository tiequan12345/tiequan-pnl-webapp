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

import { coingeckoRateLimiter } from './rateLimiter';

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
  [coinId: string]: ProviderPrice | null;
}

/**
 * Fetch multiple crypto prices in a single batched API call with retry logic
 * @param symbols Array of crypto symbols to fetch prices for
 * @returns Object mapping symbol to price data
 */
export async function fetchBatchCryptoPrices(symbols: string[]): Promise<BatchedCryptoPrices> {
  logPricingOperation('batch_fetch_start', { symbolCount: symbols.length });
  
  // Normalize symbols to coin IDs
  const coinIds = symbols.map(symbol => {
    const normalized = symbol.trim().toUpperCase();
    return COINGECKO_OVERRIDES[normalized] ?? normalized.toLowerCase();
  });

  // Create comma-separated list of coin IDs (limit to avoid URL too long)
  const maxCoinsPerBatch = 10; // As specified in requirements
  const results: BatchedCryptoPrices = {};
  let totalSuccessful = 0;
  let totalFailed = 0;

  // Process in batches of maxCoinsPerBatch
  for (let i = 0; i < coinIds.length; i += maxCoinsPerBatch) {
    const batch = coinIds.slice(i, i + maxCoinsPerBatch);
    const batchNumber = Math.floor(i / maxCoinsPerBatch) + 1;
    const totalBatches = Math.ceil(coinIds.length / maxCoinsPerBatch);
    const coinIdList = batch.join(',');
    
    logPricingOperation('batch_start', {
      batchNumber,
      totalBatches,
      coinIds: batch,
      batchSize: batch.length
    });

    // Retry logic for each batch
    let batchSuccessful = false;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Wait for rate limit slot
        await coingeckoRateLimiter.waitForSlot();

        // Build API URL with optional API key
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
          // Add timeout to prevent hanging
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`CoinGecko API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json() as Record<string, { usd?: number }>;
        
        // Process results for this batch
        let batchSuccessCount = 0;
        for (const coinId of batch) {
          const quote = data[coinId];
          const symbolIndex = coinIds.indexOf(coinId);
          const originalSymbol = symbols[symbolIndex];

          if (!quote || typeof quote.usd !== 'number') {
            results[originalSymbol] = null;
            logPricingOperation('symbol_fetch_failed', {
              symbol: originalSymbol,
              coinId,
              batchNumber,
              reason: 'Invalid or missing price data'
            }, 'warn');
          } else {
            results[originalSymbol] = {
              price: quote.usd,
              source: 'CoinGecko',
              updatedAt: new Date(),
            };
            batchSuccessCount++;
          }
        }

        batchSuccessful = true;
        totalSuccessful += batchSuccessCount;
        totalFailed += batch.length - batchSuccessCount;
        
        logPricingOperation('batch_complete', {
          batchNumber,
          successCount: batchSuccessCount,
          failCount: batch.length - batchSuccessCount,
          attempt: attempt + 1
        });
        
        break; // Success, exit retry loop
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < MAX_RETRIES) {
          const delay = calculateRetryDelay(attempt);
          logPricingOperation('batch_retry', {
            batchNumber,
            attempt: attempt + 1,
            maxRetries: MAX_RETRIES + 1,
            delay,
            error: lastError.message
          }, 'warn');
          
          await sleep(delay);
        } else {
          logPricingOperation('batch_failed', {
            batchNumber,
            coinIds: batch,
            error: lastError.message,
            totalAttempts: attempt + 1
          }, 'error');
          
          // Mark all symbols in this batch as failed
          const batchStartIndex = i;
          const batchEndIndex = Math.min(i + maxCoinsPerBatch, symbols.length);
          for (let j = batchStartIndex; j < batchEndIndex; j++) {
            results[symbols[j]] = null;
          }
          totalFailed += batch.length;
        }
      }
    }
  }

  logPricingOperation('batch_fetch_complete', {
    totalSymbols: symbols.length,
    totalSuccessful,
    totalFailed,
    successRate: ((totalSuccessful / symbols.length) * 100).toFixed(2) + '%'
  });

  return results;
}

/**
 * Legacy single crypto price fetch function for backward compatibility
 * @param symbol Single crypto symbol
 * @returns Price data or null
 */
export async function fetchCryptoPrice(symbol: string): Promise<ProviderPrice | null> {
  const batchResults = await fetchBatchCryptoPrices([symbol]);
  return batchResults[symbol] || null;
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
