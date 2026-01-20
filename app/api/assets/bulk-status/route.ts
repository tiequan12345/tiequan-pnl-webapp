import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const ALLOWED_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

type BulkStatusPayload = {
  assetIds?: number[];
  status?: string;
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

    if (!body.status || !ALLOWED_STATUSES.includes(body.status as (typeof ALLOWED_STATUSES)[number])) {
      return NextResponse.json(
        { error: 'Invalid status value.' },
        { status: 400 },
      );
    }

    const assetIds = body.assetIds
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));

    if (assetIds.length === 0) {
      return NextResponse.json(
        { error: 'No valid asset ids provided.' },
        { status: 400 },
      );
    }

    const result = await prisma.asset.updateMany({
      where: { id: { in: assetIds } },
      data: { status: body.status },
    });

    return NextResponse.json({ updated: result.count });
  } catch {
    return NextResponse.json(
      { error: 'Failed to update asset statuses.' },
      { status: 500 },
    );
  }
}
