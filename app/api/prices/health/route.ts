import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCoinGeckoRateLimitStats } from '@/lib/pricing';
import { getAppSettings } from '@/lib/settings';

export async function GET() {
  try {
    const startTime = Date.now();
    
    // Load settings to ensure they're accessible
    const settings = await getAppSettings();
    
    // Get rate limit stats
    const rateLimitStats = getCoinGeckoRateLimitStats();
    
    // Check if we have any assets with AUTO pricing mode
    const autoAssetsCount = await prisma.asset.count({
      where: { pricing_mode: 'AUTO' }
    });
    
    // Get recent price updates (last 2 hours)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const recentUpdates = await prisma.priceLatest.count({
      where: {
        last_updated: {
          gte: twoHoursAgo
        }
      }
    });
    
    // Get total assets with prices
    const totalAssetsWithPrices = await prisma.priceLatest.count();
    
    // Calculate health metrics
    const responseTime = Date.now() - startTime;
    const isHealthy = responseTime < 5000; // Consider healthy if response time is under 5 seconds
    const rateLimitHealthy = rateLimitStats.remainingCalls > 5; // Consider healthy if we have more than 5 calls remaining
    
    const healthStatus = {
      status: isHealthy && rateLimitHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      metrics: {
        autoAssetsCount,
        totalAssetsWithPrices,
        recentUpdatesInLast2Hours: recentUpdates,
        priceUpdateCoverage: totalAssetsWithPrices > 0 
          ? `${((recentUpdates / totalAssetsWithPrices) * 100).toFixed(1)}%`
          : 'N/A'
      },
      rateLimit: {
        ...rateLimitStats,
        status: rateLimitHealthy ? 'healthy' : 'critical'
      },
      settings: {
        priceAutoRefresh: settings.priceAutoRefresh,
        priceAutoRefreshIntervalMinutes: settings.priceAutoRefreshIntervalMinutes,
        priceRefreshEndpoint: settings.priceRefreshEndpoint
      },
      checks: {
        database: 'connected',
        apiKeys: {
          coingecko: !!process.env.COINGECKO_API_KEY,
          finnhub: !!process.env.FINNHUB_API_KEY
        },
        responseTime: isHealthy ? 'pass' : 'fail',
        rateLimit: rateLimitHealthy ? 'pass' : 'fail'
      }
    };
    
    return NextResponse.json(healthStatus, {
      status: isHealthy ? 200 : 503
    });
    
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 503 });
  }
}