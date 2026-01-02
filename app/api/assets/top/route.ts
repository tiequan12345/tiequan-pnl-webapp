import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
    try {
        const topAssets = await prisma.asset.findMany({
            select: {
                id: true,
                symbol: true,
                name: true,
            },
            orderBy: {
                ledger_transactions: {
                    _count: 'desc',
                },
            },
            take: 5,
        });

        return NextResponse.json(topAssets);
    } catch (error) {
        console.error('Failed to fetch top assets:', error);
        return NextResponse.json(
            { error: 'Failed to fetch top assets.' },
            { status: 500 },
        );
    }
}
