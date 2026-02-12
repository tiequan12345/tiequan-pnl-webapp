import { NextRequest, NextResponse } from 'next/server';

import { processNextCcxtSyncJob, type CcxtSupportedExchange } from '@/lib/ccxt/syncJobs';

export const runtime = 'nodejs';
export const maxDuration = 1800;

type WorkerPayload = {
  maxJobs?: number;
  exchange?: CcxtSupportedExchange;
};

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

function getMaxJobsOverride(payload: WorkerPayload | null): number {
  const fromPayload = Number(payload?.maxJobs ?? NaN);
  if (Number.isFinite(fromPayload) && fromPayload > 0) {
    return Math.min(Math.trunc(fromPayload), 10);
  }

  const fromEnv = Number(process.env.CCXT_SYNC_JOB_MAX_PER_RUN ?? '1');
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.min(Math.trunc(fromEnv), 10);
  }

  return 1;
}

function parseExchangeOverride(payload: WorkerPayload | null): CcxtSupportedExchange | null | undefined {
  const exchangeRaw = (payload?.exchange ?? '').trim().toLowerCase();
  if (!exchangeRaw) {
    return undefined;
  }

  if (exchangeRaw === 'binance' || exchangeRaw === 'bybit') {
    return exchangeRaw;
  }

  return null;
}

export async function POST(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = (await request.json().catch(() => null)) as WorkerPayload | null;
  const maxJobs = getMaxJobsOverride(payload);
  const exchange = parseExchangeOverride(payload);

  if (exchange === null) {
    return NextResponse.json({ error: "exchange must be 'binance' or 'bybit' when provided." }, { status: 400 });
  }

  const results: Array<{ jobId?: number; status?: string; error?: string; retryScheduledFor?: string }> = [];

  for (let i = 0; i < maxJobs; i += 1) {
    const outcome = await processNextCcxtSyncJob(exchange);
    if (!outcome.processed) {
      break;
    }

    results.push({
      jobId: outcome.jobId,
      status: outcome.status,
      ...(outcome.error ? { error: outcome.error } : {}),
      ...(outcome.retryScheduledFor ? { retryScheduledFor: outcome.retryScheduledFor } : {}),
    });
  }

  return NextResponse.json({
    ok: true,
    exchange: exchange ?? 'any',
    processedCount: results.length,
    maxJobs,
    results,
  });
}
