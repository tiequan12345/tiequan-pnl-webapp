import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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

    return NextResponse.json(
      { error: 'Asset status updates are not supported.' },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { error: 'Failed to update asset statuses.' },
      { status: 500 },
    );
  }
}
