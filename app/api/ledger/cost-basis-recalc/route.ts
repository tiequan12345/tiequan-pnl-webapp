import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parseLedgerDateTime } from '@/lib/ledger';
import { recalcCostBasis, type RecalcMode } from '@/lib/costBasisRecalc';

type RecalcPayload = {
  as_of?: string;
  mode?: RecalcMode;
  external_reference?: string | null;
  notes?: string | null;
};

const RECALC_REFERENCE_PREFIX = 'RECALC:';

function normalizeExternalReference(input: string | null | undefined, asOfIso: string): string {
  const trimmed = (input ?? '').trim();
  if (!trimmed) {
    return `${RECALC_REFERENCE_PREFIX}${asOfIso}`;
  }
  if (trimmed.startsWith(RECALC_REFERENCE_PREFIX)) {
    return trimmed;
  }
  return `${RECALC_REFERENCE_PREFIX}${trimmed}`;
}

function isRecalcReset(tx: { tx_type: string; external_reference: string | null }): boolean {
  return (
    tx.tx_type === 'COST_BASIS_RESET' &&
    (tx.external_reference ?? '').startsWith(RECALC_REFERENCE_PREFIX)
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as RecalcPayload | null;
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
    }

    const asOfInput = (body.as_of ?? '').trim();
    const asOf = asOfInput ? parseLedgerDateTime(asOfInput) : new Date();
    if (asOfInput && !asOf) {
      return NextResponse.json({ error: 'Invalid as_of.' }, { status: 400 });
    }

    const mode = body.mode ?? 'PURE';
    if (mode !== 'PURE' && mode !== 'HONOR_RESETS') {
      return NextResponse.json({ error: 'Invalid mode.' }, { status: 400 });
    }

    const asOfIso = asOf.toISOString();
    const externalReference = normalizeExternalReference(body.external_reference, asOfIso);
    const notes = body.notes ?? `Recalc (${mode}) as of ${asOfIso}`;

    const transactions = await prisma.ledgerTransaction.findMany({
      where: {
        date_time: { lte: asOf },
      },
      orderBy: [{ date_time: 'asc' }, { id: 'asc' }],
      include: {
        asset: {
          select: {
            type: true,
            volatility_bucket: true,
            symbol: true,
          },
        },
      },
    });

    const filtered = transactions.filter((tx) => !isRecalcReset(tx));

    const { positions, diagnostics } = recalcCostBasis(filtered, { mode });

    if (diagnostics.length > 0) {
      console.warn('[cost-basis-recalc] transfer diagnostics', diagnostics);
    }

    const rowsToCreate: {
      date_time: Date;
      account_id: number;
      asset_id: number;
      quantity: string;
      tx_type: 'COST_BASIS_RESET';
      external_reference: string;
      notes: string | null;
      unit_price_in_base: null;
      total_value_in_base: string;
      fee_in_base: null;
    }[] = [];

    let skippedUnknown = 0;
    let skippedZeroQuantity = 0;

    for (const position of positions.values()) {
      if (!position.costBasisKnown) {
        skippedUnknown += 1;
        continue;
      }
      if (!Number.isFinite(position.quantity) || Math.abs(position.quantity) <= 1e-12) {
        skippedZeroQuantity += 1;
        continue;
      }

      const costBasis = Math.max(position.costBasis, 0);
      rowsToCreate.push({
        date_time: asOf,
        account_id: position.accountId,
        asset_id: position.assetId,
        quantity: '0',
        tx_type: 'COST_BASIS_RESET',
        external_reference: externalReference,
        notes,
        unit_price_in_base: null,
        total_value_in_base: costBasis.toString(),
        fee_in_base: null,
      });
    }

    let createdCount = 0;
    if (rowsToCreate.length > 0) {
      const results = await prisma.$transaction([
        prisma.ledgerTransaction.deleteMany({
          where: {
            tx_type: 'COST_BASIS_RESET',
            external_reference: { startsWith: RECALC_REFERENCE_PREFIX },
          },
        }),
        prisma.ledgerTransaction.createMany({ data: rowsToCreate }),
      ]);
      createdCount = results[1].count ?? 0;
    } else {
      await prisma.ledgerTransaction.deleteMany({
        where: {
          tx_type: 'COST_BASIS_RESET',
          external_reference: { startsWith: RECALC_REFERENCE_PREFIX },
        },
      });
    }

    if (skippedUnknown > 0 || skippedZeroQuantity > 0) {
      console.warn('[cost-basis-recalc] skipped positions', {
        skippedUnknown,
        skippedZeroQuantity,
        asOf: asOfIso,
        mode,
      });
    }
    console.info('[cost-basis-recalc] created resets', {
      created: createdCount,
      asOf: asOfIso,
      mode,
      external_reference: externalReference,
    });

    return NextResponse.json({
      as_of: asOfIso,
      mode,
      created: createdCount,
      skippedUnknown,
      skippedZeroQuantity,
      external_reference: externalReference,
      diagnostics,
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to recalculate cost basis.' },
      { status: 500 },
    );
  }
}