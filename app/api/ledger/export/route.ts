import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { serializeCsv } from '@/lib/csv';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);

    const dateFromRaw = searchParams.get('dateFrom');
    const dateToRaw = searchParams.get('dateTo');
    const accountIdsParam = searchParams.get('accountIds') ?? '';
    const assetIdsParam = searchParams.get('assetIds') ?? '';
    const txTypesParam = searchParams.get('txTypes') ?? '';

    const where: Record<string, any> = {};

    if (dateFromRaw || dateToRaw) {
        const dateFilter: { gte?: Date; lte?: Date } = {};
        if (dateFromRaw) {
            const d = new Date(dateFromRaw);
            if (!Number.isNaN(d.getTime())) dateFilter.gte = d;
        }
        if (dateToRaw) {
            const d = new Date(dateToRaw);
            if (!Number.isNaN(d.getTime())) dateFilter.lte = d;
        }
        if (Object.keys(dateFilter).length > 0) {
            where.date_time = dateFilter;
        }
    }

    if (accountIdsParam) {
        const accountIds = accountIdsParam
            .split(',')
            .map((id) => Number(id.trim()))
            .filter((id) => !Number.isNaN(id));
        if (accountIds.length > 0) {
            where.account_id = { in: accountIds };
        }
    }

    if (assetIdsParam) {
        const assetIds = assetIdsParam
            .split(',')
            .map((id) => Number(id.trim()))
            .filter((id) => !Number.isNaN(id));
        if (assetIds.length > 0) {
            where.asset_id = { in: assetIds };
        }
    }

    if (txTypesParam) {
        const txTypes = txTypesParam
            .split(',')
            .map((t) => t.trim().toUpperCase())
            .filter(Boolean);
        if (txTypes.length > 0) {
            where.tx_type = { in: txTypes };
        }
    }

    const transactions = await prisma.ledgerTransaction.findMany({
        where,
        orderBy: { date_time: 'desc' },
        include: {
            account: { select: { name: true } },
            asset: { select: { symbol: true, name: true } },
        },
    });

    const headers = [
        'Date/Time',
        'Account',
        'Asset Symbol',
        'Asset Name',
        'Type',
        'Quantity',
        'Notes',
    ];

    const csvRows = [
        headers,
        ...transactions.map((tx) => [
            tx.date_time.toISOString(),
            tx.account.name,
            tx.asset.symbol,
            tx.asset.name,
            tx.tx_type,
            tx.quantity.toString(),
            tx.notes ?? '',
        ]),
    ];

    const csvContent = serializeCsv(csvRows);
    const filename = `ledger_export_${new Date().toISOString().split('T')[0]}.csv`;

    return new NextResponse(csvContent, {
        headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="${filename}"`,
        },
    });
}
