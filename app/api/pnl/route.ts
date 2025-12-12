import { NextResponse } from 'next/server';
import { fetchSnapshots, type PnlFilters } from '@/lib/pnlSnapshots';
import { getAppSettings } from '@/lib/settings';

function parseNumberList(value: string | null): number[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((value) => Number.isFinite(value));
}

function parseStringList(value: string | null): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseDateParam(value: string | null): Date | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const accountIds = parseNumberList(url.searchParams.get('accountIds'));
  const assetTypes = parseStringList(url.searchParams.get('assetTypes'));
  const volatilityBuckets = parseStringList(
    url.searchParams.get('volatilityBuckets'),
  );
  const from = parseDateParam(url.searchParams.get('from'));
  const to = parseDateParam(url.searchParams.get('to'));
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;

  const filters: PnlFilters = {
    accountIds: accountIds.length > 0 ? accountIds : undefined,
    assetTypes: assetTypes.length > 0 ? assetTypes : undefined,
    volatilityBuckets:
      volatilityBuckets.length > 0 ? volatilityBuckets : undefined,
    from,
    to,
    limit,
  };

  const snapshots = await fetchSnapshots(filters);
  const settings = await getAppSettings();

  return NextResponse.json({
    baseCurrency: snapshots.baseCurrency,
    timezone: settings.timezone ?? 'UTC',
    points: snapshots.points.map((point) => ({
      ...point,
      snapshotAt: point.snapshotAt.toISOString(),
    })),
  });
}
