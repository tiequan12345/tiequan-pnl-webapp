import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { fetchCryptoPrice, fetchEquityPrice } from '@/lib/pricing';

export async function POST(
  _request: Request,
  props: { params: Promise<{ assetId: string }> },
) {
  const { assetId: assetIdParam } = await props.params;
  const assetId = Number(assetIdParam);
  if (!Number.isFinite(assetId)) {
    return NextResponse.json(
      { error: 'Invalid asset identifier.' },
      { status: 400 },
    );
  }

  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
  });

  if (!asset) {
    return NextResponse.json({ error: 'Asset not found.' }, { status: 404 });
  }

  const fetcher = asset.type === 'EQUITY' ? fetchEquityPrice : fetchCryptoPrice;
  const price = await fetcher(asset.symbol);

  if (!price) {
    return NextResponse.json(
      { error: 'Unable to fetch price for this asset.' },
      { status: 500 },
    );
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

    return NextResponse.json({ assetId: asset.id, refreshed: true });
  } catch (error) {
    console.error('Asset refresh failed', error);
    return NextResponse.json(
      { error: 'Failed to refresh asset price.' },
      { status: 500 },
    );
  }
}
