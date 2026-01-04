import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

type ResolvePayload = {
    legIds: number[];
    action: 'MATCH' | 'SEPARATE';
};

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => null)) as ResolvePayload | null;
        if (!body || !Array.isArray(body.legIds) || body.legIds.length === 0) {
            return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
        }

        const { legIds, action } = body;

        const transactions = await prisma.ledgerTransaction.findMany({
            where: { id: { in: legIds } },
        });

        if (transactions.length !== legIds.length) {
            return NextResponse.json(
                { error: 'Some transactions not found.' },
                { status: 404 }
            );
        }

        if (action === 'MATCH') {
            // Logic: Find the latest timestamp and sync all to it
            let maxDate = transactions[0].date_time;
            for (const tx of transactions) {
                if (tx.date_time > maxDate) {
                    maxDate = tx.date_time;
                }
            }

            const matchRef = `MATCH:${crypto.randomUUID()}`;

            await prisma.ledgerTransaction.updateMany({
                where: { id: { in: legIds } },
                data: {
                    date_time: maxDate,
                    external_reference: matchRef,
                },
            });

            return NextResponse.json({ success: true, message: 'Matched transactions to ' + maxDate.toISOString() });
        } else if (action === 'SEPARATE') {
            // Logic: Change types to DEPOSIT / WITHDRAWAL
            const updates = transactions.map((tx) => {
                const qty = Number(tx.quantity);
                const newType = qty >= 0 ? 'DEPOSIT' : 'WITHDRAWAL';
                return prisma.ledgerTransaction.update({
                    where: { id: tx.id },
                    data: { tx_type: newType },
                });
            });

            await prisma.$transaction(updates);

            return NextResponse.json({ success: true, message: 'Separated transactions into DEPOSIT/WITHDRAWAL' });
        } else {
            return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
        }
    } catch (err) {
        console.error(err);
        return NextResponse.json(
            { error: 'Failed to resolve transactions.' },
            { status: 500 }
        );
    }
}
