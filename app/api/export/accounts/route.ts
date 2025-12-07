import { NextResponse } from 'next/server';

import { serializeCsv } from '@/lib/csv';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const accounts = await prisma.account.findMany();

    const headers = [
      'name',
      'platform',
      'account_type',
      'chain_or_market',
      'status',
      'notes',
      'created_at',
      'updated_at',
    ];

    const rows = accounts.map((account) => [
      account.name ?? '',
      account.platform ?? '',
      account.account_type ?? '',
      account.chain_or_market ?? '',
      account.status ?? '',
      account.notes ?? '',
      account.created_at instanceof Date ? account.created_at.toISOString() : '',
      account.updated_at instanceof Date ? account.updated_at.toISOString() : '',
    ]);

    const csv = serializeCsv([headers, ...rows]);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="accounts.csv"',
      },
    });
  } catch (error) {
    console.error('Failed to export accounts', error);
    return NextResponse.json({ error: 'Failed to export accounts' }, { status: 500 });
  }
}