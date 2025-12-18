import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parseLedgerDateTime, parseLedgerDecimal, decimalValueToNumber } from '@/lib/ledger';

type BulkCostBasisResetPayload = {
  date_time?: string;
  asset_id?: number | string;
  unit_price_in_base?: string | number | null;
  total_value_in_base?: string | number | null;
  external_reference?: string | null;
  notes?: string | null;
};

function allocateByQuantity(options: {
  accountQuantities: { accountId: number; quantity: number }[];
  totalCostBasis: number;
}): { accountId: number; allocatedCostBasis: number }[] {
  const SCALE = 1_000_000; // micro-units of base currency
  const totalScaled = Math.round(options.totalCostBasis * SCALE);

  const positive = options.accountQuantities
    .map((row) => ({ ...row, quantity: Math.abs(row.quantity) }))
    .filter((row) => Number.isFinite(row.quantity) && row.quantity > 0);

  const totalQty = positive.reduce((sum, row) => sum + row.quantity, 0);
  if (totalQty <= 0 || !Number.isFinite(totalQty)) {
    return [];
  }

  const allocations: { accountId: number; allocatedScaled: number }[] = [];
  let remaining = totalScaled;

  for (let i = 0; i < positive.length; i++) {
    const row = positive[i];
    if (i === positive.length - 1) {
      allocations.push({ accountId: row.accountId, allocatedScaled: remaining });
      break;
    }

    const share = row.quantity / totalQty;
    const scaled = Math.round(totalScaled * share);
    allocations.push({ accountId: row.accountId, allocatedScaled: scaled });
    remaining -= scaled;
  }

  return allocations.map((row) => ({
    accountId: row.accountId,
    allocatedCostBasis: row.allocatedScaled / SCALE,
  }));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | BulkCostBasisResetPayload
      | null;

    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
    }

    const dateTimeStr = (body.date_time ?? '').trim();
    const assetIdRaw = body.asset_id;
    const unitPriceParsed = parseLedgerDecimal(body.unit_price_in_base);
    const totalValueParsed = parseLedgerDecimal(body.total_value_in_base);

    if (!dateTimeStr || assetIdRaw === undefined) {
      return NextResponse.json(
        { error: 'date_time and asset_id are required.' },
        { status: 400 },
      );
    }

    const dateTime = parseLedgerDateTime(dateTimeStr);
    if (!dateTime) {
      return NextResponse.json({ error: 'Invalid date_time.' }, { status: 400 });
    }

    const assetId = Number(assetIdRaw);
    if (!Number.isFinite(assetId)) {
      return NextResponse.json({ error: 'Invalid asset_id.' }, { status: 400 });
    }

    if (unitPriceParsed === null) {
      return NextResponse.json(
        { error: 'unit_price_in_base must be a valid number.' },
        { status: 400 },
      );
    }
    if (totalValueParsed === null) {
      return NextResponse.json(
        { error: 'total_value_in_base must be a valid number.' },
        { status: 400 },
      );
    }

    if (
      (unitPriceParsed === undefined || unitPriceParsed === null) &&
      (totalValueParsed === undefined || totalValueParsed === null)
    ) {
      return NextResponse.json(
        { error: 'Provide either unit_price_in_base or total_value_in_base.' },
        { status: 400 },
      );
    }

    const unitPriceNumber =
      unitPriceParsed === undefined || unitPriceParsed === null
        ? null
        : decimalValueToNumber(unitPriceParsed);
    if (unitPriceNumber !== null && (!Number.isFinite(unitPriceNumber) || unitPriceNumber < 0)) {
      return NextResponse.json(
        { error: 'unit_price_in_base must be a non-negative number.' },
        { status: 400 },
      );
    }

    const totalCostBasisNumber =
      totalValueParsed === undefined || totalValueParsed === null
        ? null
        : decimalValueToNumber(totalValueParsed);
    if (
      totalCostBasisNumber !== null &&
      (!Number.isFinite(totalCostBasisNumber) || totalCostBasisNumber < 0)
    ) {
      return NextResponse.json(
        { error: 'total_value_in_base must be a non-negative number.' },
        { status: 400 },
      );
    }

    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) {
      return NextResponse.json({ error: 'Asset not found.' }, { status: 400 });
    }

    const externalReferenceRaw = body.external_reference ?? null;
    const externalReference =
      externalReferenceRaw === null ? null : externalReferenceRaw.toString().trim() || null;
    const notesRaw = body.notes ?? null;
    const notes = notesRaw === null ? null : notesRaw.toString();

    const transactions = await prisma.ledgerTransaction.findMany({
      where: {
        asset_id: assetId,
        date_time: { lte: dateTime },
      },
      orderBy: { date_time: 'asc' },
      select: { account_id: true, quantity: true, tx_type: true, total_value_in_base: true },
    });

    const quantitiesByAccount = new Map<number, number>();
    for (const tx of transactions) {
      const current = quantitiesByAccount.get(tx.account_id) ?? 0;
      const qty = decimalValueToNumber(tx.quantity.toString());
      quantitiesByAccount.set(tx.account_id, current + (qty ?? 0));
    }

    const accountQuantities = Array.from(quantitiesByAccount.entries()).map(
      ([accountId, quantity]) => ({ accountId, quantity }),
    );

    let allocations: { accountId: number; allocatedCostBasis: number }[];
    if (unitPriceNumber !== null) {
      allocations = accountQuantities
        .map((row) => ({
          accountId: row.accountId,
          allocatedCostBasis: Math.abs(row.quantity) * unitPriceNumber,
        }))
        .filter((row) => Number.isFinite(row.allocatedCostBasis) && row.allocatedCostBasis >= 0);
    } else if (totalCostBasisNumber !== null) {
      allocations = allocateByQuantity({ accountQuantities, totalCostBasis: totalCostBasisNumber });
    } else {
      allocations = [];
    }
    if (allocations.length === 0) {
      return NextResponse.json(
        { error: 'No accounts hold this asset at or before the provided timestamp.' },
        { status: 400 },
      );
    }

    const created = await prisma.$transaction(
      allocations.map((row) =>
        prisma.ledgerTransaction.create({
          data: {
            date_time: dateTime,
            account_id: row.accountId,
            asset_id: assetId,
            quantity: '0',
            tx_type: 'COST_BASIS_RESET',
            external_reference: externalReference,
            notes,
            unit_price_in_base: null,
            total_value_in_base: row.allocatedCostBasis.toString(),
            fee_in_base: null,
          },
        }),
      ),
    );

    return NextResponse.json({
      asset_id: assetId,
      date_time: dateTime.toISOString(),
      created: created.length,
      ids: created.map((row) => row.id),
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to create bulk cost basis reset.' },
      { status: 500 },
    );
  }
}
