import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { parseLedgerDateTime, parseLedgerDecimal } from '@/lib/ledger';
import { Prisma } from '@prisma/client';

type ReconcileTarget = {
    account_id: number | string;
    asset_id: number | string;
    target_quantity: string | number;
    notes?: string | null;
};

type ReconcilePayload = {
    as_of: string;
    targets: ReconcileTarget[];
    epsilon?: number;
    external_reference?: string | null;
    notes?: string | null;
    mode?: 'PREVIEW' | 'COMMIT';
    replace_existing?: boolean;
};

type ReconcilePreviewRow = {
    account_id: number;
    asset_id: number;
    current_quantity: string;
    target_quantity: string;
    delta_quantity: string;
    will_create: boolean;
};

export async function POST(req: NextRequest) {
    try {
        const payload = (await req.json()) as ReconcilePayload;

        // Validation
        const asOf = parseLedgerDateTime(payload.as_of);
        if (!asOf || isNaN(asOf.getTime())) {
            return Response.json({ error: 'Invalid as_of timestamp' }, { status: 400 });
        }

        const targets = payload.targets;
        if (!targets || targets.length === 0) {
            return Response.json({ error: 'targets must not be empty' }, { status: 400 });
        }

        const accountIds = [...new Set(targets.map(t => Number(t.account_id)))];
        const assetIds = [...new Set(targets.map(t => Number(t.asset_id)))];

        const existingAccounts = await prisma.account.findMany({
            where: { id: { in: accountIds } },
            select: { id: true }
        });

        const existingAssets = await prisma.asset.findMany({
            where: { id: { in: assetIds } },
            select: { id: true }
        });

        const missingAccounts = accountIds.filter(id => !existingAccounts.find(a => a.id === id));
        if (missingAccounts.length > 0) {
            return Response.json({ error: `Accounts not found: ${missingAccounts.join(', ')}` }, { status: 400 });
        }

        const missingAssets = assetIds.filter(id => !existingAssets.find(a => a.id === id));
        if (missingAssets.length > 0) {
            return Response.json({ error: `Assets not found: ${missingAssets.join(', ')}` }, { status: 400 });
        }

        // Step 2: Compute Current Quantities
        const { replace_existing, external_reference } = payload;
        const mode = payload.mode || 'PREVIEW';
        const epsilon = payload.epsilon ?? 1e-9;

        // We need to exclude existing RECONCILIATION if replacing
        const whereClause: Prisma.LedgerTransactionWhereInput = {
            date_time: { lte: asOf },
            account_id: { in: accountIds },
            asset_id: { in: assetIds },
        };

        if (replace_existing && external_reference) {
            // Exclude the ones we are about to replace so we compare against "clean" state
            whereClause.NOT = {
                tx_type: 'RECONCILIATION',
                external_reference: external_reference,
                date_time: asOf,
            };
        }

        const grouped = await prisma.ledgerTransaction.groupBy({
            by: ['account_id', 'asset_id'],
            where: whereClause,
            _sum: { quantity: true },
        });

        const currentQuantities: Record<string, number> = {};
        for (const g of grouped) {
            const key = `${g.account_id}-${g.asset_id}`;
            // prisma decimal to number
            const qty = g._sum.quantity ? Number(g._sum.quantity) : 0;
            currentQuantities[key] = qty;
        }

        // Step 3: Compute Deltas
        const rows: ReconcilePreviewRow[] = [];

        for (const target of targets) {
            const accId = Number(target.account_id);
            const assId = Number(target.asset_id);
            const key = `${accId}-${assId}`;
            const current = currentQuantities[key] ?? 0;

            // Use parseLedgerDecimal to handle string inputs safely, then to number
            const targetQtyStr = parseLedgerDecimal(target.target_quantity) ?? "0";
            const targetQty = Number(targetQtyStr);

            const delta = targetQty - current;
            const willCreate = Math.abs(delta) > epsilon;

            rows.push({
                account_id: accId,
                asset_id: assId,
                current_quantity: current.toString(),
                target_quantity: targetQty.toString(),
                delta_quantity: delta.toFixed(8).replace(/\.?0+$/, ''),
                will_create: willCreate,
            });
        }

        const baseResponse = {
            as_of: asOf.toISOString(),
            external_reference: payload.external_reference,
            epsilon,
            replace_existing: replace_existing ?? true,
            rows,
        };

        if (mode === 'PREVIEW') {
            return Response.json({
                ...baseResponse,
                mode: 'PREVIEW'
            });
        }

        if (mode === 'COMMIT') {
            // Idempotency: Delete existing reconciliation for this batch
            if (replace_existing && external_reference) {
                await prisma.ledgerTransaction.deleteMany({
                    where: {
                        tx_type: 'RECONCILIATION',
                        external_reference: external_reference,
                        date_time: asOf,
                    }
                });
            }

            const toCreate = rows.filter(r => r.will_create).map(row => ({
                date_time: asOf,
                account_id: row.account_id,
                asset_id: row.asset_id,
                quantity: row.delta_quantity,
                tx_type: 'RECONCILIATION',
                external_reference: payload.external_reference,
                notes: payload.notes ?? null,
                // Valuation fields intentionally null
                unit_price_in_base: null,
                total_value_in_base: null,
                fee_in_base: null,
            }));

            let createdCount = 0;
            if (toCreate.length > 0) {
                const result = await prisma.ledgerTransaction.createMany({
                    data: toCreate
                });
                createdCount = result.count;
            }

            return Response.json({
                ...baseResponse,
                mode: 'COMMIT',
                created: createdCount
            });
        }

        return Response.json({ error: 'Invalid mode' }, { status: 400 });

    } catch (e: any) {
        console.error(e);
        return Response.json({ error: e.message || 'Internal Server Error' }, { status: 500 });
    }
}
