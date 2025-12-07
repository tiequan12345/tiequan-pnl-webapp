import { NextResponse } from 'next/server';

import { serializeCsv } from '@/lib/csv';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const assets = await prisma.asset.findMany();

    const headers = [
      'symbol',
      'name',
      'type',
      'volatility_bucket',
      'chain_or_market',
      'pricing_mode',
      'manual_price',
      'metadata_json',
      'created_at',
      'updated_at',
    ];

    const rows = assets.map((asset) => {
      const metadataValue = asset.metadata_json ?? '';

      return [
        asset.symbol ?? '',
        asset.name ?? '',
        asset.type ?? '',
        asset.volatility_bucket !== null && asset.volatility_bucket !== undefined
          ? String(asset.volatility_bucket)
          : '',
        asset.chain_or_market ?? '',
        asset.pricing_mode ?? '',
        asset.manual_price !== null && asset.manual_price !== undefined
          ? String(asset.manual_price)
          : '',
        metadataValue,
        asset.created_at instanceof Date ? asset.created_at.toISOString() : '',
        asset.updated_at instanceof Date ? asset.updated_at.toISOString() : '',
      ];
    });

    const csv = serializeCsv([headers, ...rows]);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="assets.csv"',
      },
    });
  } catch (error) {
    console.error('Failed to export assets', error);
    return NextResponse.json({ error: 'Failed to export assets' }, { status: 500 });
  }
}