import { NextResponse } from 'next/server';
import {
  consolidateHoldingsByAsset,
  getHoldings,
} from '@/lib/holdings';
import { getAppSettings } from '@/lib/settings';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const accountIdsParam = searchParams.get('accountIds') || '';
    const assetTypesParam = searchParams.get('assetTypes') || '';
    const volatilityBucketsParam = searchParams.get('volatilityBuckets') || '';
    const viewParam = searchParams.get('view');

    const accountIds = accountIdsParam
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));

    const assetTypes = assetTypesParam
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    const volatilityBuckets = volatilityBucketsParam
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    const settings = await getAppSettings();

    const { rows: fetchedRows, summary } = await getHoldings({
      accountIds: accountIds.length > 0 ? accountIds : undefined,
      assetTypes: assetTypes.length > 0 ? assetTypes : undefined,
      volatilityBuckets: volatilityBuckets.length > 0 ? volatilityBuckets : undefined,
    });
    const useConsolidated = viewParam === 'consolidated';
    const rows = useConsolidated
      ? consolidateHoldingsByAsset(fetchedRows)
      : fetchedRows;

    return NextResponse.json({
      rows,
      summary,
      baseCurrency: settings.baseCurrency,
      refreshIntervalMinutes: settings.priceAutoRefreshIntervalMinutes,
      timezone: settings.timezone ?? 'UTC',
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch holdings.' },
      { status: 500 },
    );
  }
}
