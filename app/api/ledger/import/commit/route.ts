import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  ALLOWED_TX_TYPES,
  decimalValueToNumber,
  isAllowedTxType,
  isLedgerValuationConsistent,
  parseLedgerDateTime,
  parseLedgerDecimal,
} from '@/lib/ledger';

type NormalizedLedgerRow = {
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

type RowError = {
  index: number;
  message: string;
};

type CommitResponse = {
  created: number;
  skipped: number;
  errors: RowError[];
};

function toNumber(value: number | string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { rows?: NormalizedLedgerRow[] }
      | null;

    if (!body || !Array.isArray(body.rows)) {
      return NextResponse.json(
        { error: 'Invalid payload. Expected { rows: [...] }.' },
        { status: 400 },
      );
    }

    const rows = body.rows;
    const errors: RowError[] = [];
    const candidateRows: {
      index: number;
      dateTime: Date;
      accountId: number;
      assetId: number;
      quantity: string;
      txType: (typeof ALLOWED_TX_TYPES)[number];
      externalReference: string | null;
      notes: string | null;
      unitPriceInBase?: string | null;
      totalValueInBase?: string | null;
      feeInBase?: string | null;
    }[] = [];

    const accountIdsToCheck = new Set<number>();
    const assetIdsToCheck = new Set<number>();

    rows.forEach((row, index) => {
      const dateTime = parseLedgerDateTime((row.date_time ?? '').toString());
      if (!dateTime) {
        errors.push({ index, message: 'Invalid date_time.' });
      }

      const accountId = toNumber(row.account_id as number | string | undefined);
      if (accountId === null) {
        errors.push({ index, message: 'Invalid account_id.' });
      }

      const assetId = toNumber(row.asset_id as number | string | undefined);
      if (assetId === null) {
        errors.push({ index, message: 'Invalid asset_id.' });
      }

      const quantityParsed = parseLedgerDecimal(row.quantity ?? null);
      if (quantityParsed === null || quantityParsed === undefined) {
        errors.push({
          index,
          message: 'quantity is required and must be a valid number.',
        });
      }

      const txTypeRaw = (row.tx_type ?? '').toString().trim().toUpperCase();
      if (!isAllowedTxType(txTypeRaw)) {
        errors.push({ index, message: 'Invalid tx_type.' });
      }

      const externalReferenceRaw = row.external_reference ?? null;
      const externalReference =
        externalReferenceRaw === null
          ? null
          : externalReferenceRaw.toString().trim() || null;

      const notesRaw = row.notes ?? null;
      const notes = notesRaw === null ? null : notesRaw.toString();

      const unitPriceParsed = parseLedgerDecimal(row.unit_price_in_base);
      if (unitPriceParsed === null) {
        errors.push({
          index,
          message: 'unit_price_in_base must be a valid number.',
        });
      }

      const totalValueParsed = parseLedgerDecimal(row.total_value_in_base);
      if (totalValueParsed === null) {
        errors.push({
          index,
          message: 'total_value_in_base must be a valid number.',
        });
      }

      const feeParsed = parseLedgerDecimal(row.fee_in_base);
      if (feeParsed === null) {
        errors.push({
          index,
          message: 'fee_in_base must be a valid number.',
        });
      }

      if (
        quantityParsed &&
        unitPriceParsed &&
        totalValueParsed &&
        !isLedgerValuationConsistent(
          decimalValueToNumber(quantityParsed)!,
          unitPriceParsed,
          totalValueParsed,
        )
      ) {
        errors.push({
          index,
          message:
            'Valuation mismatch: Quantity * Unit Price must match Total Value (within 0.25%).',
        });
      }

      if (
        dateTime &&
        accountId !== null &&
        assetId !== null &&
        quantityParsed !== null &&
        quantityParsed !== undefined &&
        isAllowedTxType(txTypeRaw) &&
        unitPriceParsed !== null &&
        totalValueParsed !== null &&
        feeParsed !== null &&
        // If all validations passed (consistency checked above if applicable)
        (unitPriceParsed === undefined || unitPriceParsed === null || totalValueParsed === undefined || totalValueParsed === null || isLedgerValuationConsistent(
          decimalValueToNumber(quantityParsed)!,
          unitPriceParsed,
          totalValueParsed
        ))
      ) {
        candidateRows.push({
          index,
          dateTime,
          accountId,
          assetId,
          quantity: quantityParsed,
          txType: txTypeRaw as (typeof ALLOWED_TX_TYPES)[number],
          externalReference,
          notes,
          unitPriceInBase: unitPriceParsed,
          totalValueInBase: totalValueParsed,
          feeInBase: feeParsed,
        });
        accountIdsToCheck.add(accountId);
        assetIdsToCheck.add(assetId);
      }
    });

    if (candidateRows.length === 0) {
      return NextResponse.json(
        {
          error: 'No valid rows to import.',
          errors,
        },
        { status: 400 },
      );
    }

    const accounts = await prisma.account.findMany({
      where: { id: { in: Array.from(accountIdsToCheck) } },
      select: { id: true },
    });
    const assets = await prisma.asset.findMany({
      where: { id: { in: Array.from(assetIdsToCheck) } },
      select: { id: true },
    });

    const accountExists = new Set(accounts.map((a) => a.id));
    const assetExists = new Set(assets.map((a) => a.id));

    const validRows = candidateRows.filter((row) => {
      let ok = true;
      if (!accountExists.has(row.accountId)) {
        errors.push({
          index: row.index,
          message: `Account ${row.accountId} does not exist.`,
        });
        ok = false;
      }
      if (!assetExists.has(row.assetId)) {
        errors.push({
          index: row.index,
          message: `Asset ${row.assetId} does not exist.`,
        });
        ok = false;
      }
      return ok;
    });

    if (validRows.length === 0) {
      return NextResponse.json(
        {
          error: 'No valid rows to import after validation.',
          errors,
        },
        { status: 400 },
      );
    }

    const created = await prisma.ledgerTransaction.createMany({
      data: validRows.map((row) => ({
        date_time: row.dateTime,
        account_id: row.accountId,
        asset_id: row.assetId,
        quantity: row.quantity,
        tx_type: row.txType,
        external_reference: row.externalReference,
        notes: row.notes,
        unit_price_in_base: row.unitPriceInBase,
        total_value_in_base: row.totalValueInBase,
        fee_in_base: row.feeInBase,
      })),
    });

    const responseBody: CommitResponse = {
      created: created.count,
      skipped: rows.length - created.count,
      errors,
    };

    return NextResponse.json(responseBody);
  } catch {
    return NextResponse.json(
      { error: 'Failed to import ledger rows.' },
      { status: 500 },
    );
  }
}