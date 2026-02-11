import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { type CcxtSyncMode } from '@/lib/ccxt/sync';
import { enqueueCcxtSyncJob } from '@/lib/ccxt/syncJobs';
import { isMissingSyncSinceColumnError, parseIsoInstant } from '@/lib/datetime';

export const runtime = 'nodejs';

type CronSyncPayload = {
  accountId?: number;
  exchange?: 'binance' | 'bybit';
  mode?: CcxtSyncMode;
  since?: string;
};

function isSupportedExchange(value: string): value is 'binance' | 'bybit' {
  return value === 'binance' || value === 'bybit';
}

function expectedAccountType(exchange: 'binance' | 'bybit'): 'BINANCE' | 'BYBIT' {
  return exchange === 'binance' ? 'BINANCE' : 'BYBIT';
}

function isSupportedMode(value: string): value is CcxtSyncMode {
  return value === 'trades' || value === 'balances' || value === 'full';
}

function requireCronAuth(request: NextRequest): NextResponse | null {
  const configuredToken = process.env.CCXT_CRON_SYNC_TOKEN?.trim();
  if (!configuredToken) {
    return NextResponse.json({ error: 'CCXT_CRON_SYNC_TOKEN is not configured.' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization')?.trim();
  if (authHeader !== `Bearer ${configuredToken}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const unauthorized = requireCronAuth(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = (await request.json().catch(() => null)) as CronSyncPayload | null;

    const accountId = body?.accountId;
    if (!accountId || !Number.isFinite(accountId) || accountId <= 0) {
      return NextResponse.json({ error: 'accountId is required.' }, { status: 400 });
    }

    const exchangeRaw = (body?.exchange ?? '').trim().toLowerCase();
    if (!isSupportedExchange(exchangeRaw)) {
      return NextResponse.json({ error: "exchange must be 'binance' or 'bybit'." }, { status: 400 });
    }

    const modeRaw = (body?.mode ?? 'trades').trim().toLowerCase();
    if (!isSupportedMode(modeRaw)) {
      return NextResponse.json({ error: "mode must be one of 'trades', 'balances', or 'full'." }, { status: 400 });
    }

    const since = body?.since ? (parseIsoInstant(body.since) ?? undefined) : undefined;
    if (body?.since && !since) {
      return NextResponse.json(
        { error: 'Invalid since date. Use ISO 8601 with timezone (UTC recommended).' },
        { status: 400 },
      );
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, account_type: true },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    const expectedType = expectedAccountType(exchangeRaw);
    if (account.account_type !== expectedType) {
      return NextResponse.json(
        { error: `Account type mismatch. Exchange '${exchangeRaw}' requires account_type='${expectedType}'.` },
        { status: 400 },
      );
    }

    const connection = await prisma.ccxtConnection.findUnique({
      where: { account_id: accountId },
      select: { exchange_id: true },
    });

    if (!connection || connection.exchange_id !== exchangeRaw) {
      return NextResponse.json(
        { error: `No ${exchangeRaw.toUpperCase()} CCXT connection configured for this account.` },
        { status: 404 },
      );
    }

    const queued = await enqueueCcxtSyncJob({
      accountId,
      exchangeId: exchangeRaw,
      mode: modeRaw,
      since,
      requestedBy: 'CRON',
    });

    return NextResponse.json({
      ok: true,
      queued: true,
      deduped: queued.deduped,
      jobId: queued.jobId,
      status: queued.status,
      accountId,
      exchange: exchangeRaw,
      mode: modeRaw,
      usedSinceOverride: Boolean(since),
    }, { status: 202 });
  } catch (error) {
    if (isMissingSyncSinceColumnError(error)) {
      return NextResponse.json(
        { error: 'Database migration required: run Prisma migrations before using sync_since fields.' },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run CCXT cron sync.' },
      { status: 500 },
    );
  }
}
