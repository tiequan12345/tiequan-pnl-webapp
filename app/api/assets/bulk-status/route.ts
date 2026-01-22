import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const ALLOWED_ASSET_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

type AssetStatus = (typeof ALLOWED_ASSET_STATUSES)[number];

type BulkStatusPayload = {
  assetIds?: number[];
  status?: AssetStatus;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as BulkStatusPayload | null;

    if (!body || !Array.isArray(body.assetIds) || body.assetIds.length === 0) {
      return NextResponse.json(
        { error: 'assetIds must be a non-empty array.' },
        { status: 400 },
      );
    }

    if (!body.status || !ALLOWED_ASSET_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: 'Invalid asset status.' },
        { status: 400 },
      );
    }

    const parsedIds = body.assetIds
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));

    if (parsedIds.length !== body.assetIds.length) {
      return NextResponse.json(
        { error: 'assetIds must be numeric.' },
        { status: 400 },
      );
    }

    const uniqueIds = Array.from(new Set(parsedIds));

    const updated = await prisma.asset.updateMany({
      where: { id: { in: uniqueIds } },
      data: { status: body.status },
    });

    return NextResponse.json({ updated: updated.count });
  } catch {
    return NextResponse.json(
      { error: 'Failed to update asset statuses.' },
      { status: 500 },
    );
  }
}
