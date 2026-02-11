import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isMissingSyncSinceColumnError } from '@/lib/datetime';

export const runtime = 'nodejs';

function isSupportedExchange(value: string): value is 'binance' | 'bybit' {
  return value === 'binance' || value === 'bybit';
}

function expectedAccountType(exchange: 'binance' | 'bybit'): 'BINANCE' | 'BYBIT' {
  return exchange === 'binance' ? 'BINANCE' : 'BYBIT';
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

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, account_type: true },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    const expectedType = expectedAccountType(exchange);
    if (account.account_type !== expectedType) {
      return NextResponse.json(
        { error: `Account type mismatch. Route '${exchange}' requires account_type='${expectedType}'.` },
        { status: 400 },
      );
    }

    const connection = await prisma.ccxtConnection.findUnique({
      where: { account_id: accountId },
      select: {
        account_id: true,
        exchange_id: true,
        status: true,
        options_json: true,
        sandbox: true,
        sync_since: true,
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
  } catch (error) {
    if (isMissingSyncSinceColumnError(error)) {
      return NextResponse.json(
        { error: 'Database migration required: run Prisma migrations before using sync_since fields.' },
        { status: 503 },
      );
    }

    return NextResponse.json({ error: 'Failed to fetch CCXT status.' }, { status: 500 });
  }
}
