import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import {
  ALLOWED_TX_TYPES,
  isAllowedTxType,
  parseLedgerDateTime,
  parseLedgerDecimal,
  decimalValueToNumber,
  isLedgerValuationConsistent,
  deriveLedgerValuationFields,
} from '@/lib/ledger';

type RouteContext = {
  params: {
    id: string;
  };
};

type LedgerPayload = {
  date_time?: string;
  account_id?: number | string;
  asset_id?: number | string;
  quantity?: string | number | null;
  tx_type?: string;
  external_reference?: string | null;
  notes?: string | null;
  unit_price_in_base?: string | number | null;
  total_value_in_base?: string | number | null;
  fee_in_base?: string | number | null;
};

type ValuationFieldKey =
  | 'unit_price_in_base'
  | 'total_value_in_base'
  | 'fee_in_base';

export async function PUT(request: Request, context: RouteContext) {
  const id = Number(context.params.id);

  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { error: 'Invalid ledger transaction id.' },
      { status: 400 },
    );
  }

  try {
    const existing = await prisma.ledgerTransaction.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Ledger transaction not found.' },
        { status: 404 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | LedgerPayload
      | null;

    if (!body) {
      return NextResponse.json(
        { error: 'Invalid JSON payload.' },
        { status: 400 },
      );
    }

    const dateTimeStr = (body.date_time ?? '').trim();
    const accountIdRaw = body.account_id;
    const assetIdRaw = body.asset_id;
    const quantityInput = body.quantity ?? null;
    const txTypeRaw = (body.tx_type ?? '').trim().toUpperCase();

    if (
      !dateTimeStr ||
      accountIdRaw === undefined ||
      assetIdRaw === undefined ||
      quantityInput === null ||
      !txTypeRaw
    ) {
      return NextResponse.json(
        {
          error:
            'date_time, account_id, asset_id, quantity, and tx_type are required.',
        },
        { status: 400 },
      );
    }

    const dateTime = parseLedgerDateTime(dateTimeStr);
    if (!dateTime) {
      return NextResponse.json(
        { error: 'Invalid date_time.' },
        { status: 400 },
      );
    }

    const accountId = Number(accountIdRaw);
    if (!Number.isFinite(accountId)) {
      return NextResponse.json(
        { error: 'Invalid account_id.' },
        { status: 400 },
      );
    }

    const assetId = Number(assetIdRaw);
    if (!Number.isFinite(assetId)) {
      return NextResponse.json(
        { error: 'Invalid asset_id.' },
        { status: 400 },
      );
    }

    const quantityParsed = parseLedgerDecimal(quantityInput);
    if (quantityParsed === null) {
      return NextResponse.json(
        { error: 'quantity must be a valid number.' },
        { status: 400 },
      );
    }
    if (quantityParsed === undefined) {
      return NextResponse.json(
        { error: 'quantity is required.' },
        { status: 400 },
      );
    }

    if (!isAllowedTxType(txTypeRaw)) {
      return NextResponse.json(
        { error: 'Invalid tx_type.' },
        { status: 400 },
      );
    }
    const txType: (typeof ALLOWED_TX_TYPES)[number] = txTypeRaw;

    const externalReferenceRaw = body.external_reference ?? null;
    const externalReference =
      externalReferenceRaw === null
        ? null
        : externalReferenceRaw.toString().trim() || null;

    const notesRaw = body.notes ?? null;
    const notes = notesRaw === null ? null : notesRaw.toString();

    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found.' },
        { status: 400 },
      );
    }

    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
    });

    if (!asset) {
      return NextResponse.json(
        { error: 'Asset not found.' },
        { status: 400 },
      );
    }

    const valuationFieldKeys: ValuationFieldKey[] = [
      'unit_price_in_base',
      'total_value_in_base',
      'fee_in_base',
    ];

    const parsedValuations: Partial<Record<ValuationFieldKey, string | null>> = {};

    for (const key of valuationFieldKeys) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        const parsed = parseLedgerDecimal(body[key]);
        if (parsed === null) {
          return NextResponse.json(
            { error: `${key} must be a valid number.` },
            { status: 400 },
          );
        }
        parsedValuations[key] = parsed === undefined ? null : parsed;
      }
    }

    const derivedValuations = deriveLedgerValuationFields({
      quantity: quantityParsed,
      unitPriceInBase:
        parsedValuations.unit_price_in_base !== undefined
          ? parsedValuations.unit_price_in_base
          : existing.unit_price_in_base?.toString() ?? null,
      totalValueInBase:
        parsedValuations.total_value_in_base !== undefined
          ? parsedValuations.total_value_in_base
          : existing.total_value_in_base?.toString() ?? null,
    });

    const updateData: Prisma.LedgerTransactionUncheckedUpdateInput = {
      date_time: dateTime,
      account_id: accountId,
      asset_id: assetId,
      quantity: quantityParsed,
      tx_type: txType,
      external_reference: externalReference,
      notes,
    };

    const unitPriceFinal =
      derivedValuations.unit_price_in_base !== undefined
        ? derivedValuations.unit_price_in_base
        : parsedValuations.unit_price_in_base;
    const totalValueFinal =
      derivedValuations.total_value_in_base !== undefined
        ? derivedValuations.total_value_in_base
        : parsedValuations.total_value_in_base;

    if (unitPriceFinal !== undefined) {
      updateData.unit_price_in_base = unitPriceFinal;
    }
    if (totalValueFinal !== undefined) {
      updateData.total_value_in_base = totalValueFinal;
    }
    if (parsedValuations.fee_in_base !== undefined) {
      updateData.fee_in_base = parsedValuations.fee_in_base;
    }

    if (
      !isLedgerValuationConsistent(
        decimalValueToNumber(quantityParsed)!,
        unitPriceFinal !== undefined
          ? unitPriceFinal
          : existing.unit_price_in_base?.toString() ?? null,
        totalValueFinal !== undefined
          ? totalValueFinal
          : existing.total_value_in_base?.toString() ?? null,
      )
    ) {
      return NextResponse.json(
        {
          error:
            'Valuation mismatch: Quantity * Unit Price must match Total Value (within 0.25%).',
        },
        { status: 400 },
      );
    }

    const updated = await prisma.ledgerTransaction.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      id: updated.id,
      date_time: updated.date_time.toISOString(),
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to update ledger transaction.' },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const id = Number(context.params.id);

  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { error: 'Invalid ledger transaction id.' },
      { status: 400 },
    );
  }

  try {
    const existing = await prisma.ledgerTransaction.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Ledger transaction not found.' },
        { status: 404 },
      );
    }

    await prisma.ledgerTransaction.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Failed to delete ledger transaction.' },
      { status: 500 },
    );
  }
}
