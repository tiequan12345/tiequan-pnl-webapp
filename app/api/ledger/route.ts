import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const ALLOWED_DIRECTIONS = ['IN', 'OUT'] as const;

const ALLOWED_TX_TYPES = [
  'DEPOSIT',
  'WITHDRAWAL',
  'TRADE_BUY',
  'TRADE_SELL',
  'YIELD',
  'FEE',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'NFT_PURCHASE',
  'NFT_SALE',
  'OFFLINE_IN',
  'OFFLINE_OUT',
  'OTHER',
] as const;

type LedgerPayload = {
  date_time?: string;
  account_id?: number | string;
  asset_id?: number | string;
  quantity?: string | number | null;
  direction?: string | null;
  base_price?: string | number | null;
  tx_type?: string;
  fee_asset_id?: number | string | null;
  fee_quantity?: string | number | null;
  external_reference?: string | null;
  notes?: string | null;
};

type LedgerListItem = {
  id: number;
  date_time: string;
  account_id: number;
  asset_id: number;
  quantity: string;
  direction: string | null;
  base_price: string;
  base_value: string;
  tx_type: string;
  fee_asset_id: number | null;
  fee_quantity: string | null;
  external_reference: string | null;
  notes: string | null;
  account: {
    id: number;
    name: string;
  };
  asset: {
    id: number;
    symbol: string;
    name: string;
  };
  fee_asset: {
    id: number;
    symbol: string;
  } | null;
};

type LedgerListResponse = {
  items: LedgerListItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
};

function isInAllowedList(value: string | undefined, list: readonly string[]): boolean {
  if (!value) {
    return false;
  }
  return list.includes(value);
}

function parseDecimal(
  input: string | number | null | undefined,
): string | null | undefined {
  if (input === null || input === undefined) {
    return undefined;
  }

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      return null;
    }
    return input.toString();
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }

  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return trimmed;
}

function parseDateTime(input: string | undefined): Date | null {
  if (!input) {
    return null;
  }
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const pageParam = searchParams.get('page');
    const pageSizeParam = searchParams.get('pageSize');

    let page = Number(pageParam);
    if (!Number.isFinite(page) || page < 1) {
      page = 1;
    }

    let pageSize = Number(pageSizeParam);
    if (!Number.isFinite(pageSize) || pageSize < 1) {
      pageSize = 50;
    }
    if (pageSize > 100) {
      pageSize = 100;
    }

    const dateFromRaw = searchParams.get('dateFrom') || undefined;
    const dateToRaw = searchParams.get('dateTo') || undefined;

    const dateFrom = parseDateTime(dateFromRaw);
    const dateTo = parseDateTime(dateToRaw);

    if (dateFromRaw && !dateFrom) {
      return NextResponse.json(
        { error: 'Invalid dateFrom.' },
        { status: 400 },
      );
    }

    if (dateToRaw && !dateTo) {
      return NextResponse.json(
        { error: 'Invalid dateTo.' },
        { status: 400 },
      );
    }

    const accountIdsParam = searchParams.get('accountIds') || '';
    const assetIdsParam = searchParams.get('assetIds') || '';
    const txTypesParam = searchParams.get('txTypes') || '';

    const accountIds = accountIdsParam
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));

    const assetIds = assetIdsParam
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));

    const txTypesRaw = txTypesParam
      .split(',')
      .map((value) => value.trim().toUpperCase())
      .filter((value) => Boolean(value));

    const txTypes = txTypesRaw.filter((value) =>
      isInAllowedList(value, ALLOWED_TX_TYPES),
    );

    const where: Record<string, unknown> = {};

    if (dateFrom || dateTo) {
      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (dateFrom) {
        dateFilter.gte = dateFrom;
      }
      if (dateTo) {
        dateFilter.lte = dateTo;
      }
      where.date_time = dateFilter;
    }

    if (accountIds.length > 0) {
      where.account_id = { in: accountIds };
    }

    if (assetIds.length > 0) {
      where.asset_id = { in: assetIds };
    }

    if (txTypes.length > 0) {
      where.tx_type = { in: txTypes };
    }

    const totalItems = await prisma.ledgerTransaction.count({
      where,
    });

    const transactions = await prisma.ledgerTransaction.findMany({
      where,
      orderBy: { date_time: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        account: {
          select: {
            id: true,
            name: true,
          },
        },
        asset: {
          select: {
            id: true,
            symbol: true,
            name: true,
          },
        },
        fee_asset: {
          select: {
            id: true,
            symbol: true,
          },
        },
      },
    });

    const items: LedgerListItem[] = transactions.map((tx) => ({
      id: tx.id,
      date_time: tx.date_time.toISOString(),
      account_id: tx.account_id,
      asset_id: tx.asset_id,
      quantity: tx.quantity.toString(),
      direction: tx.direction,
      base_price: tx.base_price.toString(),
      base_value: tx.base_value.toString(),
      tx_type: tx.tx_type,
      fee_asset_id: tx.fee_asset_id ?? null,
      fee_quantity: tx.fee_quantity ? tx.fee_quantity.toString() : null,
      external_reference: tx.external_reference ?? null,
      notes: tx.notes ?? null,
      account: {
        id: tx.account.id,
        name: tx.account.name,
      },
      asset: {
        id: tx.asset.id,
        symbol: tx.asset.symbol,
        name: tx.asset.name,
      },
      fee_asset: tx.fee_asset
        ? {
            id: tx.fee_asset.id,
            symbol: tx.fee_asset.symbol,
          }
        : null,
    }));

    const totalPages =
      totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
    const hasNextPage = page < totalPages;

    const responseBody: LedgerListResponse = {
      items,
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage,
    };

    return NextResponse.json(responseBody);
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch ledger transactions.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
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
    const basePriceInput = body.base_price ?? null;
    const txTypeRaw = (body.tx_type ?? '').trim().toUpperCase();

    if (
      !dateTimeStr ||
      accountIdRaw === undefined ||
      assetIdRaw === undefined ||
      quantityInput === null ||
      basePriceInput === null ||
      !txTypeRaw
    ) {
      return NextResponse.json(
        {
          error:
            'date_time, account_id, asset_id, quantity, base_price, and tx_type are required.',
        },
        { status: 400 },
      );
    }

    const dateTime = parseDateTime(dateTimeStr);
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

    const quantityParsed = parseDecimal(quantityInput);
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

    const basePriceParsed = parseDecimal(basePriceInput);
    if (basePriceParsed === null) {
      return NextResponse.json(
        { error: 'base_price must be a valid number.' },
        { status: 400 },
      );
    }
    if (basePriceParsed === undefined) {
      return NextResponse.json(
        { error: 'base_price is required.' },
        { status: 400 },
      );
    }

    const txType = txTypeRaw;
    if (!isInAllowedList(txType, ALLOWED_TX_TYPES)) {
      return NextResponse.json(
        { error: 'Invalid tx_type.' },
        { status: 400 },
      );
    }

    const directionRaw = body.direction
      ? body.direction.toString().trim().toUpperCase()
      : null;

    if (
      directionRaw &&
      !isInAllowedList(directionRaw, ALLOWED_DIRECTIONS)
    ) {
      return NextResponse.json(
        { error: 'Invalid direction.' },
        { status: 400 },
      );
    }

    const feeAssetIdRaw = body.fee_asset_id;
    let feeAssetId: number | null = null;
    if (feeAssetIdRaw !== null && feeAssetIdRaw !== undefined) {
      feeAssetId = Number(feeAssetIdRaw);
      if (!Number.isFinite(feeAssetId)) {
        return NextResponse.json(
          { error: 'Invalid fee_asset_id.' },
          { status: 400 },
        );
      }
    }

    const feeQuantityParsed = parseDecimal(body.fee_quantity ?? null);
    if (feeQuantityParsed === null) {
      return NextResponse.json(
        {
          error:
            'fee_quantity must be a valid number if provided.',
        },
        { status: 400 },
      );
    }

    const externalReferenceRaw = body.external_reference ?? null;
    const externalReference =
      externalReferenceRaw === null
        ? null
        : externalReferenceRaw.toString().trim() || null;

    const notesRaw = body.notes ?? null;
    const notes = notesRaw === null ? null : notesRaw.toString();

    const quantityNumber = Number(quantityParsed);
    const basePriceNumber = Number(basePriceParsed);

    if (
      !Number.isFinite(quantityNumber) ||
      !Number.isFinite(basePriceNumber)
    ) {
      return NextResponse.json(
        { error: 'Failed to compute base_value.' },
        { status: 400 },
      );
    }

    const baseValueNumber = quantityNumber * basePriceNumber;
    if (!Number.isFinite(baseValueNumber)) {
      return NextResponse.json(
        { error: 'Failed to compute base_value.' },
        { status: 400 },
      );
    }

    const baseValueParsed = baseValueNumber.toString();

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

    if (feeAssetId !== null) {
      const feeAsset = await prisma.asset.findUnique({
        where: { id: feeAssetId },
      });

      if (!feeAsset) {
        return NextResponse.json(
          { error: 'Fee asset not found.' },
          { status: 400 },
        );
      }
    }

    const created = await prisma.ledgerTransaction.create({
      data: {
        date_time: dateTime,
        account_id: accountId,
        asset_id: assetId,
        quantity: quantityParsed,
        direction: directionRaw,
        base_price: basePriceParsed,
        base_value: baseValueParsed,
        tx_type: txType,
        fee_asset_id: feeAssetId,
        fee_quantity:
          feeQuantityParsed === undefined ? undefined : feeQuantityParsed,
        external_reference: externalReference,
        notes,
      },
    });

    return NextResponse.json({
      id: created.id,
      date_time: created.date_time.toISOString(),
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to create ledger transaction.' },
      { status: 500 },
    );
  }
}