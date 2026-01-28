import { NextResponse } from 'next/server';

import { serializeCsv } from '@/lib/csv';
import { consolidateHoldingsByAsset, getHoldings } from '@/lib/holdings';
import { getAppSettings } from '@/lib/settings';

const formatNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '';
  }
  return String(value);
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const viewParam = searchParams.get('view');
    const useConsolidated = viewParam === 'consolidated';

    const [settings, holdings] = await Promise.all([
      getAppSettings(),
      getHoldings(),
    ]);

    const rows = useConsolidated
      ? consolidateHoldingsByAsset(holdings.rows)
      : holdings.rows;

    const headers = [
      'base_currency',
      'view',
      'account_id',
      'account_name',
      'asset_id',
      'asset_symbol',
      'asset_name',
      'asset_type',
      'volatility_bucket',
      'pricing_mode',
      'manual_price',
      'quantity',
      'price',
      'price_source',
      'last_updated',
      'is_manual',
      'is_stale',
      'market_value',
      'average_cost',
      'total_cost_basis',
      'cost_basis_status',
      'unrealized_pnl',
      'unrealized_pnl_pct',
      'transfer_diagnostic_key',
      'transfer_diagnostic_leg_ids',
    ];

    const exportRows = rows.map((row) => [
      settings.baseCurrency,
      useConsolidated ? 'consolidated' : 'per-account',
      String(row.accountId),
      row.accountName ?? '',
      String(row.assetId),
      row.assetSymbol ?? '',
      row.assetName ?? '',
      row.assetType ?? '',
      row.volatilityBucket ?? '',
      row.pricingMode ?? '',
      formatNumber(row.manualPrice),
      formatNumber(row.quantity),
      formatNumber(row.price),
      row.priceSource ?? '',
      row.lastUpdated instanceof Date ? row.lastUpdated.toISOString() : '',
      row.isManual ? 'true' : 'false',
      row.isStale ? 'true' : 'false',
      formatNumber(row.marketValue),
      formatNumber(row.averageCost),
      formatNumber(row.totalCostBasis),
      row.costBasisStatus ?? '',
      formatNumber(row.unrealizedPnl),
      formatNumber(row.unrealizedPnlPct),
      row.transferDiagnosticKey ?? '',
      row.transferDiagnosticLegIds ? JSON.stringify(row.transferDiagnosticLegIds) : '',
    ]);

    const csv = serializeCsv([headers, ...exportRows]);
    const filename = `holdings_${useConsolidated ? 'consolidated' : 'per_account'}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Failed to export holdings', error);
    return NextResponse.json({ error: 'Failed to export holdings' }, { status: 500 });
  }
}
