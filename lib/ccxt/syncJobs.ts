import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/db';
import { syncCcxtAccount, type CcxtSyncMode } from '@/lib/ccxt/sync';

export type CcxtSyncJobStatus = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
export type CcxtSyncJobRequestedBy = 'MANUAL' | 'CRON';

type QueueInput = {
  accountId: number;
  exchangeId: 'binance' | 'bybit';
  mode: CcxtSyncMode;
  since?: Date;
  requestedBy: CcxtSyncJobRequestedBy;
};

function getRunningTimeoutMinutes(): number {
  const raw = Number(process.env.CCXT_SYNC_JOB_RUNNING_TIMEOUT_MINUTES ?? '30');
  if (!Number.isFinite(raw) || raw <= 0) {
    return 30;
  }
  return Math.trunc(raw);
}

export async function markStaleRunningCcxtJobsAsFailed(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - getRunningTimeoutMinutes() * 60 * 1000);

  const result = await prisma.ccxtSyncJob.updateMany({
    where: {
      status: 'RUNNING',
      started_at: { lt: cutoff },
    },
    data: {
      status: 'FAILED',
      finished_at: now,
      error_message: 'Job timed out while RUNNING.',
      claim_token: null,
    },
  });

  return result.count;
}

export async function enqueueCcxtSyncJob(input: QueueInput): Promise<{
  jobId: number;
  status: CcxtSyncJobStatus;
  deduped: boolean;
}> {
  const existing = await prisma.ccxtSyncJob.findFirst({
    where: {
      account_id: input.accountId,
      exchange_id: input.exchangeId,
      status: { in: ['QUEUED', 'RUNNING'] },
    },
    orderBy: { created_at: 'asc' },
    select: {
      id: true,
      status: true,
    },
  });

  if (existing) {
    return {
      jobId: existing.id,
      status: existing.status as CcxtSyncJobStatus,
      deduped: true,
    };
  }

  const created = await prisma.ccxtSyncJob.create({
    data: {
      account_id: input.accountId,
      exchange_id: input.exchangeId,
      mode: input.mode,
      since: input.since,
      requested_by: input.requestedBy,
      status: 'QUEUED',
    },
    select: {
      id: true,
      status: true,
    },
  });

  return {
    jobId: created.id,
    status: created.status as CcxtSyncJobStatus,
    deduped: false,
  };
}

export async function claimNextCcxtSyncJob(): Promise<{
  id: number;
  account_id: number;
  exchange_id: string;
  mode: string;
  since: Date | null;
} | null> {
  await markStaleRunningCcxtJobsAsFailed();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = await prisma.ccxtSyncJob.findFirst({
      where: { status: 'QUEUED' },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        account_id: true,
        exchange_id: true,
        mode: true,
        since: true,
      },
    });

    if (!candidate) {
      return null;
    }

    const claimToken = randomUUID();

    const claimResult = await prisma.ccxtSyncJob.updateMany({
      where: {
        id: candidate.id,
        status: 'QUEUED',
      },
      data: {
        status: 'RUNNING',
        started_at: new Date(),
        finished_at: null,
        error_message: null,
        result_json: null,
        claim_token: claimToken,
        attempts: { increment: 1 },
      },
    });

    if (claimResult.count === 1) {
      return candidate;
    }
  }

  return null;
}

export async function runClaimedCcxtSyncJob(job: {
  id: number;
  account_id: number;
  exchange_id: string;
  mode: string;
  since: Date | null;
}): Promise<{
  jobId: number;
  status: CcxtSyncJobStatus;
  result?: {
    created: number;
    updated: number;
    reconciled: number;
    lastSyncAt: string;
  };
  error?: string;
}> {
  const modeRaw = (job.mode ?? 'trades').trim().toLowerCase();
  const mode: CcxtSyncMode =
    modeRaw === 'balances' || modeRaw === 'full' || modeRaw === 'trades' ? modeRaw : 'trades';

  try {
    const result = await syncCcxtAccount({
      accountId: job.account_id,
      mode,
      since: job.since ?? undefined,
    });

    await prisma.ccxtSyncJob.update({
      where: { id: job.id },
      data: {
        status: 'SUCCESS',
        finished_at: new Date(),
        error_message: null,
        result_json: JSON.stringify({
          created: result.created,
          updated: result.updated,
          reconciled: result.reconciled,
          lastSyncAt: result.lastSyncAt.toISOString(),
        }),
        claim_token: null,
      },
    });

    return {
      jobId: job.id,
      status: 'SUCCESS',
      result: {
        created: result.created,
        updated: result.updated,
        reconciled: result.reconciled,
        lastSyncAt: result.lastSyncAt.toISOString(),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sync error.';

    await prisma.ccxtSyncJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        finished_at: new Date(),
        error_message: message,
        claim_token: null,
      },
    });

    return {
      jobId: job.id,
      status: 'FAILED',
      error: message,
    };
  }
}

export async function processNextCcxtSyncJob(): Promise<{
  processed: boolean;
  jobId?: number;
  status?: CcxtSyncJobStatus;
  error?: string;
}> {
  const claimed = await claimNextCcxtSyncJob();
  if (!claimed) {
    return { processed: false };
  }

  const outcome = await runClaimedCcxtSyncJob(claimed);
  return {
    processed: true,
    jobId: outcome.jobId,
    status: outcome.status,
    ...(outcome.error ? { error: outcome.error } : {}),
  };
}
