import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  ALLOWED_TX_TYPES,
  isAllowedTxType,
  parseLedgerDateTime,
  parseLedgerDecimal,
  decimalValueToNumber,
  isLedgerValuationConsistent,
  deriveLedgerValuationFields,
} from '@/lib/ledger';

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
  legs?: LedgerLeg[];
};

type LedgerLeg = {
  asset_id: number | string;
  quantity: string | number;
  unit_price_in_base?: string | number | null;
  total_value_in_base?: string | number | null;
  fee_in_base?: string | number | null;
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
  unit_price_in_base: string | null;
  total_value_in_base: string | null;
  fee_in_base: string | null;
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

function parseDateParam(input: string | undefined): Date | null {
  return parseLedgerDateTime(input);
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

    const dateFrom = parseDateParam(dateFromRaw);
    const dateTo = parseDateParam(dateToRaw);

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

    const txTypes = txTypesRaw.filter(
      (value): value is (typeof ALLOWED_TX_TYPES)[number] => isAllowedTxType(value),
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
      unit_price_in_base: tx.unit_price_in_base?.toString() ?? null,
      total_value_in_base: tx.total_value_in_base?.toString() ?? null,
      fee_in_base: tx.fee_in_base?.toString() ?? null,
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
    const txTypeRaw = (body.tx_type ?? '').trim().toUpperCase();

    if (!dateTimeStr || accountIdRaw === undefined || !txTypeRaw) {
      return NextResponse.json(
        {
          error:
            'date_time, account_id, and tx_type are required.',
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

    // Check if this is a multi-leg trade
    const legs = body.legs;
    if (legs && Array.isArray(legs)) {
      // Multi-leg trade support
      const TRADE_TYPES: (typeof ALLOWED_TX_TYPES)[number][] = ['TRADE', 'NFT_TRADE', 'OFFLINE_TRADE', 'HEDGE'];
      if (!TRADE_TYPES.includes(txType)) {
        return NextResponse.json(
          { error: 'legs can only be used with trade transaction types.' },
          { status: 400 },
        );
      }

      if (legs.length < 2) {
        return NextResponse.json(
          { error: 'At least 2 legs are required for trades.' },
          { status: 400 },
        );
      }

      const assetIdsToCheck = new Set<number>();
      const validLegs: {
        assetId: number;
        quantityParsed: string;
        unitPriceParsed: string | null | undefined;
        totalValueParsed: string | null | undefined;
        feeParsed: string | null | undefined;
      }[] = [];

      // Validate all legs
      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        const assetIdRaw = leg.asset_id;
        const quantityInput = leg.quantity;

        if (assetIdRaw === undefined || quantityInput === null || quantityInput === undefined) {
          return NextResponse.json(
            { error: `Leg ${i + 1}: asset_id and quantity are required.` },
            { status: 400 },
          );
        }

        const assetId = Number(assetIdRaw);
        if (!Number.isFinite(assetId)) {
          return NextResponse.json(
            { error: `Leg ${i + 1}: Invalid asset_id.` },
            { status: 400 },
          );
        }

        const quantityParsed = parseLedgerDecimal(quantityInput);
        if (quantityParsed === null || quantityParsed === undefined) {
          return NextResponse.json(
            { error: `Leg ${i + 1}: quantity must be a valid number.` },
            { status: 400 },
          );
        }

        const unitPriceParsed = parseLedgerDecimal(leg.unit_price_in_base);
        const totalValueParsed = parseLedgerDecimal(leg.total_value_in_base);
        const feeParsed = parseLedgerDecimal(leg.fee_in_base);

        if (unitPriceParsed === null) {
          return NextResponse.json(
            { error: `Leg ${i + 1}: unit_price_in_base must be a valid number.` },
            { status: 400 },
          );
        }
        if (totalValueParsed === null) {
          return NextResponse.json(
            { error: `Leg ${i + 1}: total_value_in_base must be a valid number.` },
            { status: 400 },
          );
        }
        if (feeParsed === null) {
          return NextResponse.json(
            { error: `Leg ${i + 1}: fee_in_base must be a valid number.` },
            { status: 400 },
          );
        }

        const derived = deriveLedgerValuationFields({
          quantity: quantityParsed,
          unitPriceInBase: unitPriceParsed,
          totalValueInBase: totalValueParsed,
        });

        const unitPriceFinal =
          derived.unit_price_in_base !== undefined
            ? derived.unit_price_in_base
            : unitPriceParsed;
        const totalValueFinal =
          derived.total_value_in_base !== undefined
            ? derived.total_value_in_base
            : totalValueParsed;

        if (!isLedgerValuationConsistent(
          decimalValueToNumber(quantityParsed)!,
          unitPriceFinal,
          totalValueFinal
        )) {
          return NextResponse.json(
            { error: `Leg ${i + 1}: Valuation mismatch (Quantity * Unit Price != Total Value).` },
            { status: 400 },
          );
        }

        assetIdsToCheck.add(assetId);
        validLegs.push({
          assetId,
          quantityParsed,
          unitPriceParsed: unitPriceFinal,
          totalValueParsed: totalValueFinal,
          feeParsed,
        });
      }

      // Verify all assets exist
      const assets = await prisma.asset.findMany({
        where: { id: { in: Array.from(assetIdsToCheck) } },
        select: { id: true, type: true, symbol: true, volatility_bucket: true },
      });

      const assetExists = new Set(assets.map((a) => a.id));
      for (let i = 0; i < validLegs.length; i++) {
        const leg = validLegs[i];
        if (!assetExists.has(leg.assetId)) {
          return NextResponse.json(
            { error: `Leg ${i + 1}: Asset ${leg.assetId} does not exist.` },
            { status: 400 },
          );
        }
      }

      // If the user didn't provide valuations, infer them from a CASH leg (base currency)
      // Example: +2 BTC and -200000 USD => BTC total_value_in_base=200000, unit_price_in_base=100000
      if (validLegs.length === 2) {
        const assetById = new Map(assets.map((asset) => [asset.id, asset]));
        const leg0Asset = assetById.get(validLegs[0].assetId);
        const leg1Asset = assetById.get(validLegs[1].assetId);

        const isCashLike = (asset: (typeof assets)[number] | undefined) => {
          const type = asset?.type?.toUpperCase?.() ?? '';
          const symbol = asset?.symbol?.toUpperCase?.() ?? '';
          const bucket = asset?.volatility_bucket?.toUpperCase?.() ?? '';

          if (type === 'CASH' || type === 'STABLE') {
            return true;
          }
          if (bucket === 'CASH_LIKE') {
            return true;
          }
          if (symbol === 'USD' || symbol === 'USDT' || symbol === 'USDC') {
            return true;
          }
          return false;
        };

        const isCash0 = isCashLike(leg0Asset);
        const isCash1 = isCashLike(leg1Asset);

        if (isCash0 !== isCash1) {
          const cashLegIndex = isCash0 ? 0 : 1;
          const otherLegIndex = cashLegIndex === 0 ? 1 : 0;

          const cashLeg = validLegs[cashLegIndex];
          const otherLeg = validLegs[otherLegIndex];

          const cashQty = decimalValueToNumber(cashLeg.quantityParsed);
          const otherQty = decimalValueToNumber(otherLeg.quantityParsed);

          if (
            cashQty !== null &&
            otherQty !== null &&
            Number.isFinite(cashQty) &&
            Number.isFinite(otherQty) &&
            cashQty !== 0 &&
            otherQty !== 0
          ) {
            const cashHasValuation =
              cashLeg.unitPriceParsed !== undefined || cashLeg.totalValueParsed !== undefined;
            if (!cashHasValuation) {
              cashLeg.unitPriceParsed = '1';
              cashLeg.totalValueParsed = cashQty.toString();
            } else {
              if (cashLeg.unitPriceParsed === undefined) {
                cashLeg.unitPriceParsed = '1';
              }
              if (cashLeg.totalValueParsed === undefined) {
                cashLeg.totalValueParsed = cashQty.toString();
              }
            }

            const inferredOtherTotal = (-cashQty).toString();
            const otherHasValuation =
              otherLeg.unitPriceParsed !== undefined || otherLeg.totalValueParsed !== undefined;

            if (!otherHasValuation) {
              otherLeg.totalValueParsed = inferredOtherTotal;
              otherLeg.unitPriceParsed = (-cashQty / otherQty).toString();
            } else {
              if (otherLeg.totalValueParsed === undefined) {
                otherLeg.totalValueParsed = inferredOtherTotal;
              }
              if (otherLeg.unitPriceParsed === undefined) {
                const totalNumber = decimalValueToNumber(otherLeg.totalValueParsed);
                if (
                  totalNumber !== null &&
                  Number.isFinite(totalNumber) &&
                  otherQty !== 0
                ) {
                  otherLeg.unitPriceParsed = (totalNumber / otherQty).toString();
                }
              }
            }
          }
        }
      }

      for (let i = 0; i < validLegs.length; i++) {
        const leg = validLegs[i];
        if (
          !isLedgerValuationConsistent(
            decimalValueToNumber(leg.quantityParsed)!,
            leg.unitPriceParsed,
            leg.totalValueParsed,
          )
        ) {
          return NextResponse.json(
            { error: `Leg ${i + 1}: Valuation mismatch (Quantity * Unit Price != Total Value).` },
            { status: 400 },
          );
        }
      }

      // Create all legs atomically using a transaction
      const createdTransactions = await prisma.$transaction(
        validLegs.map((leg) =>
          prisma.ledgerTransaction.create({
            data: {
              date_time: dateTime,
              account_id: accountId,
              asset_id: leg.assetId,
              quantity: leg.quantityParsed,
              tx_type: txType,
              external_reference: externalReference,
              notes,
              unit_price_in_base: leg.unitPriceParsed,
              total_value_in_base: leg.totalValueParsed,
              fee_in_base: leg.feeParsed,
            },
          }),
        ),
      );

      return NextResponse.json({
        ids: createdTransactions.map((t) => t.id),
        date_time: createdTransactions[0].date_time.toISOString(),
        legs: createdTransactions.length,
      });
    }

    // Legacy single-transaction support
    const assetIdRaw = body.asset_id;
    const quantityInput = body.quantity ?? null;

    if (assetIdRaw === undefined || quantityInput === null) {
      return NextResponse.json(
        {
          error: 'asset_id and quantity are required for single transactions.',
        },
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

    const unitPriceParsed = parseLedgerDecimal(body.unit_price_in_base);
    const totalValueParsed = parseLedgerDecimal(body.total_value_in_base);
    const feeParsed = parseLedgerDecimal(body.fee_in_base);

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
    if (feeParsed === null) {
      return NextResponse.json(
        { error: 'fee_in_base must be a valid number.' },
        { status: 400 },
      );
    }

    const derived = deriveLedgerValuationFields({
      quantity: quantityParsed,
      unitPriceInBase: unitPriceParsed,
      totalValueInBase: totalValueParsed,
    });

    const unitPriceFinal =
      derived.unit_price_in_base !== undefined
        ? derived.unit_price_in_base
        : unitPriceParsed;
    const totalValueFinal =
      derived.total_value_in_base !== undefined
        ? derived.total_value_in_base
        : totalValueParsed;

    if (!isLedgerValuationConsistent(
      decimalValueToNumber(quantityParsed)!,
      unitPriceFinal,
      totalValueFinal
    )) {
      return NextResponse.json(
        { error: 'Valuation mismatch: Quantity * Unit Price must match Total Value (within 0.25%).' },
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
        unit_price_in_base: unitPriceFinal,
        total_value_in_base: totalValueFinal,
        fee_in_base: feeParsed,
      },
    });

    return NextResponse.json({
      id: created.id,
      date_time: created.date_time.toISOString(),
      unit_price_in_base: created.unit_price_in_base?.toString() ?? null,
      total_value_in_base: created.total_value_in_base?.toString() ?? null,
      fee_in_base: created.fee_in_base?.toString() ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to create ledger transaction.' },
      { status: 500 },
    );
  }
}
