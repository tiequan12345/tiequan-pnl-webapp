import { NextResponse } from 'next/server';

import { serializeCsv } from '@/lib/csv';
import { prisma } from '@/lib/db';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const isTemplate = searchParams.get('template') === '1';

    const headers = [
      'date_time',
      'account_id',
      'account_name',
      'asset_id',
      'asset_symbol',
      'quantity',
      'tx_type',
      'unit_price_in_base',
      'total_value_in_base',
      'fee_in_base',
      'notes',
      'external_reference',
    ];

    if (isTemplate) {
      const templateRows = [
        headers,
        [
          '2025-12-18T02:52:00.000Z',
          '8',
          'EVM HW Wallet',
          '12',
          'ETH',
          '-5',
          'TRADE',
          '2837.672',
          '-14188.36',
          '',
          'Example Trade',
          '',
        ],
        [
          '2025-12-18T02:52:00.000Z',
          '8',
          'EVM HW Wallet',
          '10',
          'USDC',
          '14188.36',
          'TRADE',
          '1',
          '14188.36',
          '',
          'Example Trade',
          '',
        ],
      ];
      const csv = serializeCsv(templateRows);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="ledger-template.csv"',
        },
      });
    }

    const ledgerRows = await prisma.ledgerTransaction.findMany({
      include: {
        account: {
          select: { name: true },
        },
        asset: {
          select: { symbol: true },
        },
      },
      orderBy: {
        date_time: 'desc',
      },
    });

    const rows = ledgerRows.map((row) => [
      row.date_time instanceof Date ? row.date_time.toISOString() : '',
      row.account_id !== null && row.account_id !== undefined ? String(row.account_id) : '',
      row.account?.name ?? '',
      row.asset_id !== null && row.asset_id !== undefined ? String(row.asset_id) : '',
      row.asset?.symbol ?? '',
      row.quantity !== null && row.quantity !== undefined ? String(row.quantity) : '',
      row.tx_type ?? '',
      row.unit_price_in_base !== null && row.unit_price_in_base !== undefined
        ? String(row.unit_price_in_base)
        : '',
      row.total_value_in_base !== null && row.total_value_in_base !== undefined
        ? String(row.total_value_in_base)
        : '',
      row.fee_in_base !== null && row.fee_in_base !== undefined ? String(row.fee_in_base) : '',
      row.notes ?? '',
      row.external_reference ?? '',
    ]);

    const csv = serializeCsv([headers, ...rows]);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ledger.csv"',
      },
    });
  } catch (error) {
    console.error('Failed to export ledger', error);
    return NextResponse.json({ error: 'Failed to export ledger' }, { status: 500 });
  }
}