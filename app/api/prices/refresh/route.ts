import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { fetchCryptoPrice, fetchEquityPrice, fetchBatchCryptoPrices, getCoinGeckoRateLimitStats } from '@/lib/pricing';
import { getAppSettings } from '@/lib/settings';

export async function POST() {
  // Load settings so future refresh interval / provider config can be honored
  await getAppSettings();

  try {
    const assets = await prisma.asset.findMany({
      where: { pricing_mode: 'AUTO' },
    });

    const refreshed: number[] = [];
    const failed: number[] = [];

    // Separate crypto and equity assets
    const cryptoAssets = assets.filter(asset => asset.type === 'CRYPTO');
    const equityAssets = assets.filter(asset => asset.type === 'EQUITY');

    // Batch fetch crypto prices
    if (cryptoAssets.length > 0) {
      const cryptoSymbols = cryptoAssets.map(asset => asset.symbol);
      console.log(`Fetching batch crypto prices for ${cryptoSymbols.length} assets:`, cryptoSymbols);
      
      const batchResults = await fetchBatchCryptoPrices(cryptoSymbols);
      
      for (const asset of cryptoAssets) {
        const price = batchResults[asset.symbol];
        
        if (!price) {
          failed.push(asset.id);
          console.warn(`Failed to fetch price for crypto asset: ${asset.symbol}`);
          continue;
        }

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
      }
    }

    // Process equity assets individually (they use different API)
    for (const asset of equityAssets) {
      try {
        const price = await fetchEquityPrice(asset.symbol);

        if (!price) {
          failed.push(asset.id);
          console.warn(`Failed to fetch price for equity asset: ${asset.symbol}`);
          continue;
        }

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
      } catch (error) {
        failed.push(asset.id);
        console.error(`Error fetching equity price for ${asset.symbol}:`, error);
      }
    }

    // Get rate limit stats for monitoring
    const rateLimitStats = getCoinGeckoRateLimitStats();
    
    return NextResponse.json({ 
      refreshed, 
      failed,
      rateLimitStats,
      processed: {
        crypto: cryptoAssets.length,
        equity: equityAssets.length,
        total: assets.length
      }
    });
  } catch (error) {
    console.error('Pricing refresh failed', error);
    return NextResponse.json(
      { error: 'Failed to refresh prices. Please try again later.' },
      { status: 500 },
    );
  }
}
