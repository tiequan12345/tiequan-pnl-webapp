import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { syncCcxtAccount, type CcxtSyncMode } from '@/lib/ccxt/sync';

export type CcxtSyncJobStatus = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
export type CcxtSyncJobRequestedBy = 'MANUAL' | 'CRON';
export type CcxtSupportedExchange = 'binance' | 'bybit';

type QueueInput = {
  accountId: number;
  exchangeId: 'binance' | 'bybit';
  mode: CcxtSyncMode;
  since?: Date;
  requestedBy: CcxtSyncJobRequestedBy;
  force?: boolean;
};

type ClaimedCcxtSyncJob = {
  id: number;
  account_id: number;
  exchange_id: string;
  mode: string;
  since: Date | null;
  attempts: number;
  claim_token: string;
};

type SyncJobProgress = {
  stage: string;
  message?: string;
  [key: string]: unknown;
};

function normalizeCcxtExchange(value?: string | null): CcxtSupportedExchange | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'binance' || normalized === 'bybit') {
    return normalized;
  }

  return undefined;
}

function readPositiveIntFromEnv(key: string, fallback: number): number {
  const raw = Number(process.env[key] ?? String(fallback));
  if (!Number.isFinite(raw) || raw <= 0) {
    return fallback;
  }
  return Math.trunc(raw);
}

function getRunningTimeoutMinutes(): number {
  return readPositiveIntFromEnv('CCXT_SYNC_JOB_RUNNING_TIMEOUT_MINUTES', 30);
}

function getMaxRetryAttempts(): number {
  return readPositiveIntFromEnv('CCXT_SYNC_JOB_MAX_RETRY_ATTEMPTS', 3);
}

function getRetryBaseSeconds(): number {
  return readPositiveIntFromEnv('CCXT_SYNC_JOB_RETRY_BASE_SECONDS', 30);
}

function getRetryMaxSeconds(): number {
  return readPositiveIntFromEnv('CCXT_SYNC_JOB_RETRY_MAX_SECONDS', 900);
}

function getHeartbeatSeconds(): number {
  return readPositiveIntFromEnv('CCXT_SYNC_JOB_HEARTBEAT_SECONDS', 10);
}

function computeRetryDelaySeconds(attempt: number): number {
  const base = getRetryBaseSeconds();
  const cap = getRetryMaxSeconds();
  const exponent = Math.max(0, attempt - 1);
  const delay = base * 2 ** exponent;
  return Math.max(base, Math.min(delay, cap));
}

function isRetryableSyncError(message: string): boolean {
  const normalized = message.toLowerCase();
  return [
    'network',
    'timeout',
    'timed out',
    'econnreset',
    'socket hang up',
    'rate limit',
    'too many requests',
    'temporarily unavailable',
    'service unavailable',
  ].some((needle) => normalized.includes(needle));
}

async function updateRunningJobProgress(params: {
  jobId: number;
  claimToken: string;
  progress: SyncJobProgress;
  now?: Date;
}): Promise<void> {
  const now = params.now ?? new Date();
  await prisma.ccxtSyncJob.updateMany({
    where: {
      id: params.jobId,
      status: 'RUNNING',
      claim_token: params.claimToken,
    },
    data: {
      heartbeat_at: now,
      progress_json: JSON.stringify({
        ...params.progress,
        updatedAt: now.toISOString(),
      }),
    },
  });
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
      heartbeat_at: now,
      error_message: 'Job timed out while RUNNING.',
      claim_token: null,
      progress_json: JSON.stringify({
        stage: 'failed.timeout',
        message: 'Job timed out while RUNNING.',
        updatedAt: now.toISOString(),
      }),
    },
  });

  return result.count;
}

export async function enqueueCcxtSyncJob(input: QueueInput): Promise<{
  jobId: number;
  status: CcxtSyncJobStatus;
  deduped: boolean;
}> {
  if (!input.force) {
    const existing = await prisma.ccxtSyncJob.findFirst({
      where: {
        account_id: input.accountId,
        exchange_id: input.exchangeId,
        mode: input.mode,
        since: input.since ?? null,
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
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
  }

  const created = await prisma.ccxtSyncJob.create({
    data: {
      account_id: input.accountId,
      exchange_id: input.exchangeId,
      mode: input.mode,
      since: input.since,
      requested_by: input.requestedBy,
      status: 'QUEUED',
      next_run_at: null,
      progress_json: JSON.stringify({
        stage: 'queued',
        message: 'Job queued.',
        updatedAt: new Date().toISOString(),
      }),
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

export async function claimNextCcxtSyncJob(
  exchangeId?: CcxtSupportedExchange,
): Promise<ClaimedCcxtSyncJob | null> {
  await markStaleRunningCcxtJobsAsFailed();

  const normalizedExchange = normalizeCcxtExchange(exchangeId);

  // When no exchange is specified, find which exchanges already have RUNNING jobs
  // so we can avoid claiming more jobs for those exchanges (allow parallel execution across exchanges)
  let excludedExchanges: CcxtSupportedExchange[] = [];
  if (!normalizedExchange) {
    const runningJobs = await prisma.ccxtSyncJob.findMany({
      where: {
        status: 'RUNNING',
      },
      select: {
        exchange_id: true,
      },
      distinct: ['exchange_id'],
    });

    excludedExchanges = runningJobs
      .map((j) => normalizeCcxtExchange(j.exchange_id))
      .filter((e): e is CcxtSupportedExchange => e !== undefined);
  }


  for (let attempt = 0; attempt < 5; attempt += 1) {
    const now = new Date();
    const queueWhere: Prisma.CcxtSyncJobWhereInput = {
      status: 'QUEUED',
      OR: [
        { next_run_at: null },
        { next_run_at: { lte: now } },
      ],
      ...(normalizedExchange ? { exchange_id: normalizedExchange } : { exchange_id: { notIn: excludedExchanges } }),
    };

    const candidate = await prisma.ccxtSyncJob.findFirst({
      where: queueWhere,
      orderBy: [{ next_run_at: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        account_id: true,
        exchange_id: true,
        mode: true,
        since: true,
        attempts: true,
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
        started_at: now,
        heartbeat_at: now,
        finished_at: null,
        error_message: null,
        result_json: null,
        next_run_at: null,
        claim_token: claimToken,
        attempts: { increment: 1 },
        progress_json: JSON.stringify({
          stage: 'claimed',
          message: 'Job claimed by worker.',
          updatedAt: now.toISOString(),
          attempt: candidate.attempts + 1,
        }),
      },
    });

    if (claimResult.count === 1) {
      return {
        ...candidate,
        attempts: candidate.attempts + 1,
        claim_token: claimToken,
      };
    }
  }

  return null;
}

export async function runClaimedCcxtSyncJob(job: ClaimedCcxtSyncJob): Promise<{
  jobId: number;
  status: CcxtSyncJobStatus;
  result?: {
    created: number;
    updated: number;
    reconciled: number;
    reconciledPositions?: number;
    reconciledBalances?: number;
    lastSyncAt: string;
  };
  error?: string;
  retryScheduledFor?: string;
}> {
  const modeRaw = (job.mode ?? 'trades').trim().toLowerCase();
  const mode: CcxtSyncMode =
    modeRaw === 'balances' || modeRaw === 'full' || modeRaw === 'trades' ? modeRaw : 'trades';

  let latestProgress: SyncJobProgress = {
    stage: 'running',
    message: 'Sync started.',
    mode,
    attempt: job.attempts,
  };

  const heartbeatMs = getHeartbeatSeconds() * 1000;
  const heartbeatTimer = setInterval(() => {
    void updateRunningJobProgress({
      jobId: job.id,
      claimToken: job.claim_token,
      progress: latestProgress,
    });
  }, heartbeatMs);

  try {
    await updateRunningJobProgress({
      jobId: job.id,
      claimToken: job.claim_token,
      progress: latestProgress,
    });

    const result = await syncCcxtAccount({
      accountId: job.account_id,
      mode,
      since: job.since ?? undefined,
      onProgress: async (progress) => {
        latestProgress = {
          ...latestProgress,
          ...progress,
          mode,
          attempt: job.attempts,
        };

        await updateRunningJobProgress({
          jobId: job.id,
          claimToken: job.claim_token,
          progress: latestProgress,
        });
      },
    });

    clearInterval(heartbeatTimer);

    const finishedAt = new Date();
    await prisma.ccxtSyncJob.updateMany({
      where: {
        id: job.id,
        status: 'RUNNING',
        claim_token: job.claim_token,
      },
      data: {
        status: 'SUCCESS',
        finished_at: finishedAt,
        heartbeat_at: finishedAt,
        error_message: null,
        result_json: JSON.stringify({
          created: result.created,
          updated: result.updated,
          reconciled: result.reconciled,
          reconciledPositions: result.reconciledPositions,
          reconciledBalances: result.reconciledBalances,
          lastSyncAt: result.lastSyncAt.toISOString(),
        }),
        progress_json: JSON.stringify({
          stage: 'success',
          message: 'Sync completed successfully.',
          updatedAt: finishedAt.toISOString(),
          created: result.created,
          reconciled: result.reconciled,
          reconciledPositions: result.reconciledPositions,
          reconciledBalances: result.reconciledBalances,
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
        reconciledPositions: result.reconciledPositions,
        reconciledBalances: result.reconciledBalances,
        lastSyncAt: result.lastSyncAt.toISOString(),
      },
    };
  } catch (error) {
    clearInterval(heartbeatTimer);

    const message = error instanceof Error ? error.message : 'Unknown sync error.';
    const retryable = isRetryableSyncError(message);
    const retryDelaySeconds = computeRetryDelaySeconds(job.attempts);
    const maxRetryAttempts = getMaxRetryAttempts();

    if (retryable && job.attempts < maxRetryAttempts) {
      const nextRunAt = new Date(Date.now() + retryDelaySeconds * 1000);
      const now = new Date();

      await prisma.ccxtSyncJob.updateMany({
        where: {
          id: job.id,
          status: 'RUNNING',
          claim_token: job.claim_token,
        },
        data: {
          status: 'QUEUED',
          finished_at: now,
          heartbeat_at: now,
          error_message: message,
          claim_token: null,
          next_run_at: nextRunAt,
          progress_json: JSON.stringify({
            stage: 'retry.scheduled',
            message: `Retrying after transient failure: ${message}`,
            updatedAt: now.toISOString(),
            nextRunAt: nextRunAt.toISOString(),
            attempt: job.attempts,
            maxRetryAttempts,
          }),
        },
      });

      return {
        jobId: job.id,
        status: 'QUEUED',
        error: message,
        retryScheduledFor: nextRunAt.toISOString(),
      };
    }

    const now = new Date();
    await prisma.ccxtSyncJob.updateMany({
      where: {
        id: job.id,
        status: 'RUNNING',
        claim_token: job.claim_token,
      },
      data: {
        status: 'FAILED',
        finished_at: now,
        heartbeat_at: now,
        error_message: message,
        next_run_at: null,
        claim_token: null,
        progress_json: JSON.stringify({
          stage: 'failed',
          message,
          updatedAt: now.toISOString(),
          attempt: job.attempts,
          maxRetryAttempts,
        }),
      },
    });

    return {
      jobId: job.id,
      status: 'FAILED',
      error: message,
    };
  }
}

export async function processNextCcxtSyncJob(exchangeId?: CcxtSupportedExchange): Promise<{
  processed: boolean;
  jobId?: number;
  status?: CcxtSyncJobStatus;
  error?: string;
  retryScheduledFor?: string;
}> {
  const claimed = await claimNextCcxtSyncJob(exchangeId);
  if (!claimed) {
    return { processed: false };
  }

  const outcome = await runClaimedCcxtSyncJob(claimed);
  return {
    processed: true,
    jobId: outcome.jobId,
    status: outcome.status,
    ...(outcome.error ? { error: outcome.error } : {}),
    ...(outcome.retryScheduledFor ? { retryScheduledFor: outcome.retryScheduledFor } : {}),
  };
}
