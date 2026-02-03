import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import {
  fetchCryptoPrice,
  fetchEquityPrice,
  fetchBatchCryptoPrices,
  getCoinGeckoRateLimitStats,
  logPricingOperation,
} from '@/lib/pricing';
import { getAppSettings } from '@/lib/settings';
import { createPortfolioSnapshot } from '@/lib/pnlSnapshots';
import { fetchPositions, refreshToken } from '@/lib/tradestation/client';

function isExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() - Date.now() < 30_000;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function POST(request: Request) {
  const startTime = Date.now();
  const isScheduledRun = request.headers.get('X-Refresh-Mode') === 'auto';
  const mode = isScheduledRun ? 'SCHEDULED' : 'MANUAL';

  logPricingOperation('refresh_start', {
    timestamp: new Date().toISOString(),
    mode
  });

  // Load settings
  const settings = await getAppSettings();
  logPricingOperation('settings_loaded', { settings });

  // 1. Concurrency Guard
  // Check for any currently running jobs that haven't timed out (10 min safety)
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const activeRun = await prisma.priceRefreshRun.findFirst({
    where: {
      status: 'RUNNING',
      started_at: { gt: tenMinutesAgo }
    }
  });

  if (activeRun) {
    logPricingOperation('refresh_skipped', {
      reason: 'Another refresh is already in progress',
      activeRunId: activeRun.id,
      startedAt: activeRun.started_at
    });
    return NextResponse.json({
      message: 'A price refresh is already in progress',
      status: 'skipped_concurrency',
      activeRunId: activeRun.id
    }, { status: 409 });
  }

  // 2. Interval Enforcement (for scheduled runs only)
  if (isScheduledRun) {
    // Check if auto refresh is disabled
    if (!settings.priceAutoRefresh) {
      logPricingOperation('refresh_skipped', {
        reason: 'Auto refresh disabled in settings',
      });
      return NextResponse.json({
        message: 'Auto refresh disabled in settings',
        refreshed: [],
        failed: [],
        processed: { crypto: 0, equity: 0, option: 0, total: 0 },
        duration: `${Date.now() - startTime}ms`
      });
    }

    // Check last run time
    const lastRun = await prisma.priceRefreshRun.findFirst({
      where: {
        status: { in: ['SUCCESS', 'PARTIAL', 'FAILED'] }
      },
      orderBy: { started_at: 'desc' }
    });

    if (lastRun) {
      const minutesSinceLastRun = (Date.now() - lastRun.started_at.getTime()) / (1000 * 60);
      if (minutesSinceLastRun < settings.priceAutoRefreshIntervalMinutes) {
        logPricingOperation('refresh_skipped', {
          reason: 'Interval not reached',
          minutesSinceLastRun: minutesSinceLastRun.toFixed(1),
          requiredInterval: settings.priceAutoRefreshIntervalMinutes
        });
        return NextResponse.json({
          message: `Refresh interval (${settings.priceAutoRefreshIntervalMinutes}m) not reached. Last run ${minutesSinceLastRun.toFixed(1)}m ago.`,
          status: 'skipped_interval',
          lastRunId: lastRun.id
        });
      }
    }
  }

  // 3. Create Run Record
  const currentRun = await prisma.priceRefreshRun.create({
    data: {
      mode,
      status: 'RUNNING',
      started_at: new Date()
    }
  });

  try {
    const assets = await prisma.asset.findMany({
      where: { pricing_mode: 'AUTO' },
    });

    if (assets.length === 0) {
      logPricingOperation('refresh_complete', {
        message: 'No assets with AUTO pricing mode found',
        duration: `${Date.now() - startTime}ms`
      });

      await prisma.priceRefreshRun.update({
        where: { id: currentRun.id },
        data: {
          status: 'SUCCESS',
          ended_at: new Date(),
          metadata: JSON.stringify({
            message: 'No assets with AUTO pricing mode found',
            duration: `${Date.now() - startTime}ms`
          })
        }
      });

      return NextResponse.json({
        message: 'No assets with AUTO pricing mode found',
        refreshed: [],
        failed: [],
        processed: { crypto: 0, equity: 0, option: 0, total: 0 },
        duration: `${Date.now() - startTime}ms`
      });
    }

    const refreshed: number[] = [];
    const failed: { id: number; symbol: string; type: string; error: string }[] = [];

    // Separate assets by pricing strategy
    const cryptoAssets = assets.filter(asset => asset.type === 'CRYPTO');
    const equityAssets = assets.filter(asset => asset.type === 'EQUITY');
    const optionAssets = assets.filter(asset => asset.type === 'OPTION');

    logPricingOperation('asset_counts', {
      total: assets.length,
      crypto: cryptoAssets.length,
      equity: equityAssets.length,
      option: optionAssets.length,
    });

    // Batch fetch crypto prices
    if (cryptoAssets.length > 0) {
      const cryptoSymbols = cryptoAssets.map(asset => asset.symbol);
      logPricingOperation('crypto_batch_start', {
        symbolCount: cryptoSymbols.length,
        symbols: cryptoSymbols
      });

      try {
        const batchResults = await fetchBatchCryptoPrices(cryptoSymbols);

        for (const asset of cryptoAssets) {
          const price = batchResults[asset.symbol];

          if (!price) {
            failed.push({
              id: asset.id,
              symbol: asset.symbol,
              type: asset.type,
              error: 'No price data returned from API'
            });
            continue;
          }

          try {
            await prisma.priceLatest.upsert({
              where: { asset_id: asset.id },
              create: {
                asset_id: asset.id,
                price_in_base: price.price,
                source: price.source,
                last_updated: price.updatedAt ?? new Date(),
              },
              update: {
                price_in_base: price.price,
                source: price.source,
                last_updated: price.updatedAt ?? new Date(),
              },
            });

            refreshed.push(asset.id);
            logPricingOperation('asset_refreshed', {
              id: asset.id,
              symbol: asset.symbol,
              type: asset.type,
              price: price.price,
              source: price.source
            });
          } catch (dbError) {
            failed.push({
              id: asset.id,
              symbol: asset.symbol,
              type: asset.type,
              error: `Database error: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
            });
            logPricingOperation('asset_db_error', {
              id: asset.id,
              symbol: asset.symbol,
              error: dbError instanceof Error ? dbError.message : 'Unknown error'
            }, 'error');
          }
        }
      } catch (batchError) {
        logPricingOperation('crypto_batch_failed', {
          error: batchError instanceof Error ? batchError.message : 'Unknown error'
        }, 'error');

        // Mark all crypto assets as failed
        for (const asset of cryptoAssets) {
          failed.push({
            id: asset.id,
            symbol: asset.symbol,
            type: asset.type,
            error: `Batch fetch failed: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`
          });
        }
      }
    }

    // Best-effort pricing for OPTION assets via TradeStation brokerage positions.
    // This only prices contracts that appear in the account's current Positions response.
    if (optionAssets.length > 0) {
      logPricingOperation('option_processing_start', {
        count: optionAssets.length,
      });

      const connection = await prisma.tradeStationConnection.findFirst({
        where: {
          status: 'ACTIVE',
          ts_account_id: { not: null },
        },
      });

      if (!connection?.ts_account_id) {
        for (const asset of optionAssets) {
          failed.push({
            id: asset.id,
            symbol: asset.symbol,
            type: asset.type,
            error: 'No active TradeStation connection available for option pricing.',
          });
        }
      } else {
        let accessToken = connection.access_token;

        if (!accessToken || isExpired(connection.token_expires_at)) {
          const refreshedToken = await refreshToken(connection.refresh_token);
          accessToken = refreshedToken.accessToken;

          await prisma.tradeStationConnection.update({
            where: { account_id: connection.account_id },
            data: {
              access_token: refreshedToken.accessToken,
              refresh_token: refreshedToken.refreshToken,
              token_expires_at: refreshedToken.expiresAt,
              scopes: refreshedToken.scopes?.join(' ') ?? connection.scopes,
              status: 'ACTIVE',
            },
          });
        }

        const positions = await fetchPositions({
          accountId: connection.ts_account_id,
          accessToken: accessToken ?? '',
        });

        const priceBySymbol = new Map<string, number>();

        for (const pos of positions) {
          const symbol = typeof pos.Symbol === 'string' ? pos.Symbol.trim() : '';
          if (!symbol) continue;

          const last = parseNumber((pos as any).Last);
          const bid = parseNumber((pos as any).Bid);
          const ask = parseNumber((pos as any).Ask);
          const mark = parseNumber((pos as any).MarkToMarketPrice);

          let price: number | null = null;

          // Prefer midpoint for options (best effort).
          if (bid !== null && ask !== null && bid > 0 && ask > 0) {
            price = (bid + ask) / 2;
          } else if (last && last > 0) {
            price = last;
          } else if (mark && mark > 0) {
            price = mark;
          }

          if (price && price > 0) {
            priceBySymbol.set(symbol, price);
          }
        }

        for (const asset of optionAssets) {
          const price = priceBySymbol.get(asset.symbol.trim());

          if (!price) {
            failed.push({
              id: asset.id,
              symbol: asset.symbol,
              type: asset.type,
              error: 'No TradeStation position price found for this option symbol.',
            });
            continue;
          }

          await prisma.priceLatest.upsert({
            where: { asset_id: asset.id },
            create: {
              asset_id: asset.id,
              price_in_base: price,
              source: 'TradeStation',
              last_updated: new Date(),
            },
            update: {
              price_in_base: price,
              source: 'TradeStation',
              last_updated: new Date(),
            },
          });

          refreshed.push(asset.id);
        }
      }
    }

    // Process equity assets individually (they use different API)
    if (equityAssets.length > 0) {
      logPricingOperation('equity_processing_start', {
        count: equityAssets.length,
        symbols: equityAssets.map(a => a.symbol)
      });

      for (const asset of equityAssets) {
        try {
          const price = await fetchEquityPrice(asset.symbol);

          if (!price) {
            failed.push({
              id: asset.id,
              symbol: asset.symbol,
              type: asset.type,
              error: 'No price data returned from API'
            });
            continue;
          }

          try {
            await prisma.priceLatest.upsert({
              where: { asset_id: asset.id },
              create: {
                asset_id: asset.id,
                price_in_base: price.price,
                source: price.source,
                last_updated: price.updatedAt ?? new Date(),
              },
              update: {
                price_in_base: price.price,
                source: price.source,
                last_updated: price.updatedAt ?? new Date(),
              },
            });

            refreshed.push(asset.id);
            logPricingOperation('asset_refreshed', {
              id: asset.id,
              symbol: asset.symbol,
              type: asset.type,
              price: price.price,
              source: price.source
            });
          } catch (dbError) {
            failed.push({
              id: asset.id,
              symbol: asset.symbol,
              type: asset.type,
              error: `Database error: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
            });
            logPricingOperation('asset_db_error', {
              id: asset.id,
              symbol: asset.symbol,
              error: dbError instanceof Error ? dbError.message : 'Unknown error'
            }, 'error');
          }
        } catch (error) {
          failed.push({
            id: asset.id,
            symbol: asset.symbol,
            type: asset.type,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          logPricingOperation('equity_fetch_error', {
            id: asset.id,
            symbol: asset.symbol,
            error: error instanceof Error ? error.message : 'Unknown error'
          }, 'error');
        }
      }
    }

    // Get rate limit stats for monitoring
    const rateLimitStats = getCoinGeckoRateLimitStats();
    const duration = Date.now() - startTime;

    const result = {
      refreshed,
      failed,
      rateLimitStats,
      processed: {
        crypto: cryptoAssets.length,
        equity: equityAssets.length,
        option: optionAssets.length,
        total: assets.length
      },
      summary: {
        successCount: refreshed.length,
        failureCount: failed.length,
        successRate: assets.length > 0 ? `${((refreshed.length / assets.length) * 100).toFixed(1)}%` : '0%',
        duration: `${duration}ms`
      }
    };

    logPricingOperation('refresh_complete', {
      ...result.summary,
      rateLimitRemaining: rateLimitStats.remainingCalls
    });

    try {
      const snapshot = await createPortfolioSnapshot();
      if (snapshot) {
        logPricingOperation('snapshot_recorded', {
          snapshotId: snapshot.snapshotId,
          snapshotAt: snapshot.snapshotAt.toISOString(),
          totalValue: snapshot.totalValue,
        });
      }
    } catch (snapshotError) {
      logPricingOperation(
        'snapshot_failed',
        {
          error: snapshotError instanceof Error ? snapshotError.message : 'Unknown error',
        },
        'warn',
      );
    }

    // Return success even if some assets failed, as long as we didn't have a complete failure
    const finalStatus = refreshed.length === assets.length ? 'SUCCESS' : (refreshed.length > 0 ? 'PARTIAL' : 'FAILED');

    await prisma.priceRefreshRun.update({
      where: { id: currentRun.id },
      data: {
        status: finalStatus,
        ended_at: new Date(),
        metadata: JSON.stringify({
          ...result.summary,
          rateLimitRemaining: rateLimitStats.remainingCalls
        })
      }
    });

    const status = refreshed.length > 0 ? 200 : 207; // 207 Multi-Status for partial success
    return NextResponse.json(result, { status });

  } catch (error) {
    const duration = Date.now() - startTime;
    logPricingOperation('refresh_failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: `${duration}ms`
    }, 'error');

    await prisma.priceRefreshRun.update({
      where: { id: currentRun.id },
      data: {
        status: 'FAILED',
        ended_at: new Date(),
        metadata: JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: `${duration}ms`
        })
      }
    }).catch((e: unknown) => console.error('Failed to update PriceRefreshRun with error', e));

    return NextResponse.json(
      {
        error: 'Failed to refresh prices. Please try again later.',
        details: error instanceof Error ? error.message : 'Unknown error',
        duration: `${duration}ms`
      },
      { status: 500 },
    );
  }
}
