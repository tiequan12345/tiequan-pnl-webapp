import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

function isSupportedExchange(value: string): value is 'binance' | 'bybit' {
  return value === 'binance' || value === 'bybit';
}

type RouteContext = {
  params: Promise<{ exchange: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { exchange } = await context.params;

    if (!isSupportedExchange(exchange)) {
      return NextResponse.json({ error: 'Unsupported exchange.' }, { status: 400 });
    }

    const accountIdRaw = new URL(request.url).searchParams.get('accountId');
    const accountId = Number(accountIdRaw);

    if (!Number.isFinite(accountId) || accountId <= 0) {
      return NextResponse.json({ error: 'accountId is required.' }, { status: 400 });
    }

    const connection = await prisma.ccxtConnection.findUnique({
      where: { account_id: accountId },
      select: {
        account_id: true,
        exchange_id: true,
        status: true,
        options_json: true,
        sandbox: true,
        last_sync_at: true,
        last_trade_sync_at: true,
        last_trade_cursor: true,
        metadata_json: true,
        created_at: true,
        updated_at: true,
      },
    });

    const matching = connection && connection.exchange_id === exchange ? connection : null;

    return NextResponse.json({
      connected: Boolean(matching),
      connection: matching,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch CCXT status.' }, { status: 500 });
  }
}
