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

            // Use match_reference for transfer pairing (Phase 1+)
            const matchRef = `MATCH:${crypto.randomUUID()}`;

            await prisma.ledgerTransaction.updateMany({
                where: { id: { in: legIds } },
                data: {
                    date_time: maxDate,
                    // Set only the dedicated pairing key; preserve source identity in external_reference
                    match_reference: matchRef,
                },
            });

            return NextResponse.json({ success: true, message: 'Matched transactions to ' + maxDate.toISOString() });
        } else if (action === 'SEPARATE') {
            // Logic: Change types to DEPOSIT / WITHDRAWAL
            // Also clear the grouping key (match_reference and legacy MATCH:* in external_reference)
            const updates = transactions.map((tx) => {
                const qty = Number(tx.quantity);
                const newType = qty >= 0 ? 'DEPOSIT' : 'WITHDRAWAL';
                
                // Build update data - clear both match_reference and legacy MATCH:* external_reference
                const updateData: { tx_type: string; match_reference: null; external_reference?: string | null } = {
                    tx_type: newType,
                    // Clear match_reference (Phase 1+)
                    match_reference: null,
                };
                
                // Clear external_reference if it starts with 'MATCH:' (legacy grouping key)
                const externalRef = tx.external_reference;
                if (externalRef && externalRef.startsWith('MATCH:')) {
                    updateData.external_reference = null;
                }
                
                return prisma.ledgerTransaction.update({
                    where: { id: tx.id },
                    data: updateData,
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
