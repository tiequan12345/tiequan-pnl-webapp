import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const jobId = Number(id);

  if (!Number.isFinite(jobId) || jobId <= 0) {
    return NextResponse.json({ error: 'Invalid job id.' }, { status: 400 });
  }

  const job = await prisma.ccxtSyncJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      account_id: true,
      exchange_id: true,
      mode: true,
      since: true,
      requested_by: true,
      status: true,
      attempts: true,
      error_message: true,
      result_json: true,
      progress_json: true,
      created_at: true,
      started_at: true,
      heartbeat_at: true,
      finished_at: true,
      next_run_at: true,
      updated_at: true,
    },
  });

  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  const parsedResult = (() => {
    if (!job.result_json) {
      return null;
    }

    try {
      return JSON.parse(job.result_json);
    } catch {
      return { raw: job.result_json };
    }
  })();

  const parsedProgress = (() => {
    if (!job.progress_json) {
      return null;
    }

    try {
      return JSON.parse(job.progress_json);
    } catch {
      return { raw: job.progress_json };
    }
  })();

  return NextResponse.json({
    ...job,
    result: parsedResult,
    progress: parsedProgress,
  });
}
