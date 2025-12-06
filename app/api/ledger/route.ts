import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const ALLOWED_TX_TYPES = [
  'DEPOSIT',
  'WITHDRAWAL',
  'TRADE',
  'YIELD',
  'NFT_TRADE',
  'OFFLINE_TRADE',
  'OTHER',
] as const;

type LedgerPayload = {
  date_time?: string;
  account_id?: number | string;
  asset_id?: number | string;
  quantity?: string | number | null;
  tx_type?: string;
  external_reference?: string | null;
  notes?: string | null;
};

type LedgerListItem = {
  id: number;
  date_time: string;
  account_id: number;
  asset_id: number;
  quantity: string;
  tx_type: string;
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
      },
    });

    const items: LedgerListItem[] = transactions.map((tx) => ({
      id: tx.id,
      date_time: tx.date_time.toISOString(),
      account_id: tx.account_id,
      asset_id: tx.asset_id,
      quantity: tx.quantity.toString(),
      tx_type: tx.tx_type,
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

    const txType = txTypeRaw;
    if (!isInAllowedList(txType, ALLOWED_TX_TYPES)) {
      return NextResponse.json(
        { error: 'Invalid tx_type.' },
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

    const created = await prisma.ledgerTransaction.create({
      data: {
        date_time: dateTime,
        account_id: accountId,
        asset_id: assetId,
        quantity: quantityParsed,
        tx_type: txType,
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