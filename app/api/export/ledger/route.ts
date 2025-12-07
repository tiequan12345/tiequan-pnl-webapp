import { NextResponse } from 'next/server';

import { serializeCsv } from '@/lib/csv';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
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

    const headers = [
      'date_time',
      'account_name',
      'asset_symbol',
      'quantity',
      'tx_type',
      'notes',
      'external_reference',
      'account_id',
      'asset_id',
    ];

    const rows = ledgerRows.map((row) => [
      row.date_time instanceof Date ? row.date_time.toISOString() : '',
      row.account?.name ?? '',
      row.asset?.symbol ?? '',
      row.quantity !== null && row.quantity !== undefined ? String(row.quantity) : '',
      row.tx_type ?? '',
      row.notes ?? '',
      row.external_reference ?? '',
      row.account_id ?? '',
      row.asset_id ?? '',
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