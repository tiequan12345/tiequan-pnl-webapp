import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { fetchCryptoPrice, fetchEquityPrice } from '@/lib/pricing';
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

    for (const asset of assets) {
      const fetcher = asset.type === 'EQUITY' ? fetchEquityPrice : fetchCryptoPrice;
      const price = await fetcher(asset.symbol);

      if (!price) {
        failed.push(asset.id);
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

    return NextResponse.json({ refreshed, failed });
  } catch (error) {
    console.error('Pricing refresh failed', error);
    return NextResponse.json(
      { error: 'Failed to refresh prices. Please try again later.' },
      { status: 500 },
    );
  }
}
