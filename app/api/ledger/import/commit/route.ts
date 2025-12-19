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
  account_name?: string;
  asset_id?: number | string;
  asset_symbol?: string;
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
  if (typeof value === 'string') {
    if (!value.trim()) {
      return null;
    }
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
    const accountNamesToCheck = new Set<string>();
    const assetSymbolsToCheck = new Set<string>();

    rows.forEach((row, index) => {
      const dateTime = parseLedgerDateTime((row.date_time ?? '').toString());
      if (!dateTime) {
        errors.push({ index, message: 'Invalid date_time.' });
      }

      const accountId = toNumber(row.account_id as number | string | undefined);
      const accountNameRaw = (row.account_name ?? '').toString().trim();
      const accountName = accountNameRaw.toLowerCase();
      if (accountId === null && !accountName) {
        errors.push({ index, message: 'Provide account_id or account_name.' });
      }

      const assetId = toNumber(row.asset_id as number | string | undefined);
      const assetSymbolRaw = (row.asset_symbol ?? '').toString().trim();
      const assetSymbol = assetSymbolRaw.toLowerCase();
      if (assetId === null && !assetSymbol) {
        errors.push({ index, message: 'Provide asset_id or asset_symbol.' });
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
        quantityParsed !== null &&
        quantityParsed !== undefined &&
        unitPriceParsed !== null &&
        unitPriceParsed !== undefined &&
        totalValueParsed !== null &&
        totalValueParsed !== undefined &&
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
        quantityParsed !== null &&
        quantityParsed !== undefined &&
        isAllowedTxType(txTypeRaw) &&
        unitPriceParsed !== null &&
        totalValueParsed !== null &&
        feeParsed !== null &&
        (accountId !== null || accountName) &&
        (assetId !== null || assetSymbol) &&
        (unitPriceParsed === undefined ||
          unitPriceParsed === null ||
          totalValueParsed === undefined ||
          totalValueParsed === null ||
          isLedgerValuationConsistent(
            decimalValueToNumber(quantityParsed)!,
            unitPriceParsed,
            totalValueParsed,
          ))
      ) {
        if (accountId !== null) {
          accountIdsToCheck.add(accountId);
        } else if (accountName) {
          accountNamesToCheck.add(accountName);
        }

        if (assetId !== null) {
          assetIdsToCheck.add(assetId);
        } else if (assetSymbol) {
          assetSymbolsToCheck.add(assetSymbol);
        }

        candidateRows.push({
          index,
          dateTime,
          accountId: accountId ?? -1,
          assetId: assetId ?? -1,
          quantity: quantityParsed,
          txType: txTypeRaw as (typeof ALLOWED_TX_TYPES)[number],
          externalReference,
          notes,
          unitPriceInBase: unitPriceParsed,
          totalValueInBase: totalValueParsed,
          feeInBase: feeParsed,
        });
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
      where: {
        OR: [
          { id: { in: Array.from(accountIdsToCheck) } },
          { name: { in: Array.from(accountNamesToCheck) } },
        ],
      },
      select: { id: true, name: true },
    });
    const assets = await prisma.asset.findMany({
      where: {
        OR: [
          { id: { in: Array.from(assetIdsToCheck) } },
          { symbol: { in: Array.from(assetSymbolsToCheck) } },
        ],
      },
      select: { id: true, symbol: true },
    });

    const accountExists = new Set(accounts.map((a) => a.id));
    const assetExists = new Set(assets.map((a) => a.id));
    const accountByName = new Map(
      accounts.map((a) => [a.name.toLowerCase(), a.id]),
    );
    const assetBySymbol = new Map(
      assets.map((a) => [a.symbol.toLowerCase(), a.id]),
    );

    const validRows = candidateRows.filter((row) => {
      let ok = true;
      if (!accountExists.has(row.accountId)) {
        if (row.accountId === -1) {
          const fallbackAccountId = accountByName.get(
            rows[row.index]?.account_name?.toString().trim().toLowerCase() ?? '',
          );
          if (fallbackAccountId) {
            row.accountId = fallbackAccountId;
          } else {
            errors.push({
              index: row.index,
              message: 'Account does not exist.',
            });
            ok = false;
          }
        } else {
          errors.push({
            index: row.index,
            message: 'Account does not exist.',
          });
          ok = false;
        }
      }
      if (!assetExists.has(row.assetId)) {
        if (row.assetId === -1) {
          const fallbackAssetId = assetBySymbol.get(
            rows[row.index]?.asset_symbol?.toString().trim().toLowerCase() ?? '',
          );
          if (fallbackAssetId) {
            row.assetId = fallbackAssetId;
          } else {
            errors.push({
              index: row.index,
              message: 'Asset does not exist.',
            });
            ok = false;
          }
        } else {
          errors.push({
            index: row.index,
            message: 'Asset does not exist.',
          });
          ok = false;
        }
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