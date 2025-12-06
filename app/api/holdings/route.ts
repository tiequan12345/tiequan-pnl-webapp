import { NextResponse } from 'next/server';
import { getHoldings } from '@/lib/holdings';
import { getAppSettings } from '@/lib/settings';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const accountIdsParam = searchParams.get('accountIds') || '';
    const assetTypesParam = searchParams.get('assetTypes') || '';

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

    const settings = await getAppSettings();

    const { rows, summary } = await getHoldings({
      accountIds: accountIds.length > 0 ? accountIds : undefined,
      assetTypes: assetTypes.length > 0 ? assetTypes : undefined,
    });

    return NextResponse.json({
      rows,
      summary,
      baseCurrency: settings.baseCurrency,
      refreshIntervalMinutes: settings.priceAutoRefreshIntervalMinutes,
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch holdings.' },
      { status: 500 },
    );
  }
}