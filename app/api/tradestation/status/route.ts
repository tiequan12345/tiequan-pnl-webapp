import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const accountIdRaw = url.searchParams.get('accountId');

    const accountId = Number(accountIdRaw);
    if (!Number.isFinite(accountId) || accountId <= 0) {
      return NextResponse.json({ error: 'accountId is required.' }, { status: 400 });
    }

    const connection = await prisma.tradeStationConnection.findUnique({
      where: { account_id: accountId },
      select: {
        account_id: true,
        ts_account_id: true,
        status: true,
        scopes: true,
        token_expires_at: true,
        last_sync_at: true,
        last_order_sync_at: true,
        created_at: true,
        updated_at: true,
      },
    });

    return NextResponse.json({
      connected: Boolean(connection),
      connection,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch TradeStation status.' }, { status: 500 });
  }
}
