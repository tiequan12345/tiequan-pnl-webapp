import { prisma } from '@/lib/db';
import {
  fetchBrokerageAccounts,
  fetchHistoricalOrders,
  fetchOrdersToday,
  fetchPositions,
  refreshToken,
} from '@/lib/tradestation/client';

type SyncMode = 'orders' | 'positions' | 'full';

function isExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) {
    return false;
  }
  // Refresh a bit early to avoid clock skew.
  return expiresAt.getTime() - Date.now() < 30_000;
}

async function getValidAccessToken(accountId: number): Promise<string> {
  const connection = await prisma.tradeStationConnection.findUnique({
    where: { account_id: accountId },
  });

  if (!connection) {
    throw new Error('TradeStation connection not found for account.');
  }

  if (connection.status !== 'ACTIVE') {
    throw new Error(`TradeStation connection is not active (status=${connection.status}).`);
  }

  if (connection.access_token && !isExpired(connection.token_expires_at)) {
    return connection.access_token;
  }

  const refreshed = await refreshToken(connection.refresh_token);

  await prisma.tradeStationConnection.update({
    where: { account_id: accountId },
    data: {
      access_token: refreshed.accessToken,
      refresh_token: refreshed.refreshToken,
      token_expires_at: refreshed.expiresAt,
      scopes: refreshed.scopes?.join(' ') ?? connection.scopes,
      status: 'ACTIVE',
    },
  });

  return refreshed.accessToken;
}

type NormalizedTrade = {
  externalRef: string;
  symbol: string;
  assetType?: string;
  dateTime: Date;
  quantity: string;
  unitPriceInBase?: string;
  feeInBase?: string;
  notes?: string;
};

function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function parseTsDate(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    // Heuristic: seconds vs ms
    const ms = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const match = trimmed.match(/\/Date\((\d+)\)\//);
    if (match?.[1]) {
      const date = new Date(Number(match[1]));
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function getFirstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function getFirstNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) continue;
      const n = Number(trimmed);
      if (Number.isFinite(n)) {
        return n;
      }
    }
  }
  return null;
}

function mapTsAssetType(value: unknown): string | undefined {
  const raw = typeof value === 'string' ? value.toUpperCase() : '';
  if (!raw) return undefined;

  if (raw.includes('OPTION')) return 'OPTION';
  if (raw.includes('FUTURE')) return 'FUTURE';
  if (raw.includes('STOCK') || raw.includes('EQUITY')) return 'EQUITY';

  return 'OTHER';
}

function normalizeTradesFromOrder(order: Record<string, unknown>): NormalizedTrade[] {
  const orderId = getFirstString(order, ['OrderID', 'OrderId', 'OrderIDString', 'ID', 'Id']);
  if (!orderId) {
    return [];
  }

  const statusRaw = getFirstString(order, ['Status', 'OrderStatus', 'State']);

  const dateTime =
    parseTsDate(order.ClosedDateTime) ??
    parseTsDate(order.FilledDateTime) ??
    parseTsDate(order.ExecutionTime) ??
    parseTsDate(order.TimeStamp) ??
    parseTsDate(order.OpenedDateTime) ??
    parseTsDate(order.OpenDateTime) ??
    new Date();

  const legsRaw = Array.isArray(order.Legs) ? order.Legs : [];
  const statusUpper = statusRaw ? statusRaw.toUpperCase() : '';

  const legEntries = legsRaw
    .map((leg, index) => ({ leg, index }))
    .filter(({ leg }) => leg && typeof leg === 'object')
    .map(({ leg, index }) => ({ leg: leg as Record<string, unknown>, index }));

  // Determine filled quantity per leg.
  // For options, TradeStation provides ExecQuantity.
  // For some equity orders, ExecQuantity may be missing; infer fills when QuantityRemaining=0 and status is Filled.
  const filledLegs = legEntries
    .map(({ leg, index }) => {
      let execQty = getFirstNumber(leg, ['ExecQuantity', 'FilledQuantity', 'FilledQty']);

      if (execQty === null) {
        const remaining = getFirstNumber(leg, ['QuantityRemaining']);
        const ordered = getFirstNumber(leg, ['QuantityOrdered', 'Quantity', 'Qty']);
        const isFilledStatus = statusUpper.includes('FLL') || statusUpper.includes('FILLED');
        if (isFilledStatus && remaining !== null && ordered !== null && remaining === 0 && ordered > 0) {
          execQty = ordered;
        }
      }

      return { leg, index, execQty };
    })
    .filter(
      (entry): entry is { leg: Record<string, unknown>; index: number; execQty: number } =>
        entry.execQty !== null && Number.isFinite(entry.execQty) && entry.execQty > 0,
    );

  const orderCommission = getFirstNumber(order, ['CommissionFee', 'Commission', 'Fees', 'Fee']);

  // If there are no filled legs, attempt a single-leg fallback from order-level fields.
  if (filledLegs.length === 0) {
    const symbol = getFirstString(order, ['Symbol', 'UnderlyingSymbol', 'Ticker']);
    const sideRaw = getFirstString(order, ['BuyOrSell', 'Side', 'Action', 'TradeAction']);
    const side = sideRaw ? sideRaw.toUpperCase() : '';

    const filledQty = getFirstNumber(order, ['FilledQuantity', 'FilledQty', 'Filled', 'ExecQuantity', 'Quantity']);

    let sign = 0;
    if (side.includes('BUY')) sign = 1;
    if (side.includes('SELL')) sign = -1;

    if (!symbol || !filledQty || sign === 0) {
      return [];
    }

    const filledPrice = getFirstNumber(order, ['FilledPrice', 'AveragePrice', 'AvgPrice', 'FillPrice', 'ExecutionPrice', 'LimitPrice']);

    return [
      {
        externalRef: `TS:${orderId}:0`,
        symbol,
        assetType: mapTsAssetType((order as Record<string, unknown>).AssetType),
        dateTime,
        quantity: (sign * filledQty).toString(),
        unitPriceInBase:
          filledPrice !== null && Number.isFinite(filledPrice)
            ? Math.abs(filledPrice).toString()
            : undefined,
        feeInBase:
          orderCommission !== null && Number.isFinite(orderCommission)
            ? orderCommission.toString()
            : undefined,
        notes: `TradeStation import: orderId=${orderId}${statusRaw ? ` status=${statusRaw}` : ''}`,
      },
    ];
  }

  const orderLevelFillPrice = getFirstNumber(order, ['FilledPrice', 'AveragePrice', 'AvgPrice', 'FillPrice', 'ExecutionPrice', 'LimitPrice']);

  return filledLegs.map(({ leg, index, execQty }, filledIndex) => {
    const symbol = getFirstString(leg, ['Symbol', 'UnderlyingSymbol', 'Ticker']) ?? 'UNKNOWN';

    const sideRaw = getFirstString(leg, ['BuyOrSell', 'Side', 'Action']);
    const side = sideRaw ? sideRaw.toUpperCase() : '';

    let sign = 0;
    if (side.includes('BUY')) {
      sign = 1;
    } else if (side.includes('SELL')) {
      sign = -1;
    }

    const quantity = sign === 0 ? execQty : sign * execQty;

    let executionPrice = getFirstNumber(leg, ['ExecutionPrice', 'FilledPrice', 'FillPrice', 'AveragePrice']);
    if ((executionPrice === null || !Number.isFinite(executionPrice)) && filledLegs.length === 1) {
      executionPrice = orderLevelFillPrice;
    }

    // Put the full commission on the first created leg to avoid double counting.
    const feeInBase =
      filledIndex === 0 && orderCommission !== null && Number.isFinite(orderCommission)
        ? orderCommission.toString()
        : undefined;

    const notes = `TradeStation import: orderId=${orderId}${statusRaw ? ` status=${statusRaw}` : ''} leg=${index}`;

    return {
      externalRef: `TS:${orderId}:${index}`,
      symbol,
      assetType: mapTsAssetType(leg.AssetType),
      dateTime,
      quantity: quantity.toString(),
      unitPriceInBase:
        executionPrice !== null && Number.isFinite(executionPrice)
          ? executionPrice.toString()
          : undefined,
      feeInBase,
      notes,
    };
  });
}

async function ensureAssetsBySymbol(
  inputs: { symbol: string; assetType?: string }[],
): Promise<Map<string, number>> {
  const uniqueSymbols = Array.from(
    new Set(inputs.map((i) => i.symbol.trim()).filter(Boolean)),
  );
  const typeBySymbol = new Map<string, string | undefined>();
  for (const input of inputs) {
    if (!input.symbol) continue;
    const symbol = input.symbol.trim();
    if (!symbol) continue;
    if (!typeBySymbol.has(symbol)) {
      typeBySymbol.set(symbol, input.assetType);
    }
  }

  const map = new Map<string, number>();

  if (uniqueSymbols.length === 0) {
    return map;
  }

  const existing = await prisma.asset.findMany({
    where: { symbol: { in: uniqueSymbols } },
    select: { id: true, symbol: true },
  });

  for (const asset of existing) {
    map.set(asset.symbol, asset.id);
  }

  const missing = uniqueSymbols.filter((symbol) => !map.has(symbol));

  for (const symbol of missing) {
    const suggestedType = typeBySymbol.get(symbol);
    const type = suggestedType && ['EQUITY', 'OPTION', 'CRYPTO', 'CASH', 'OTHER'].includes(suggestedType)
      ? suggestedType
      : 'EQUITY';

    const created = await prisma.asset.create({
      data: {
        symbol,
        name: symbol,
        type,
        volatility_bucket: 'VOLATILE',
        chain_or_market: 'US',
        pricing_mode: 'AUTO',
        status: 'INACTIVE',
        metadata_json: JSON.stringify({ source: 'TRADESTATION', raw_symbol: symbol, ts_asset_type: suggestedType ?? null }),
      },
      select: { id: true, symbol: true },
    });

    map.set(created.symbol, created.id);
  }

  return map;
}

export async function syncTradeStationAccount(params: {
  accountId: number;
  mode?: SyncMode;
  since?: Date;
}): Promise<{
  created: number;
  updated: number;
  reconciled: number;
  lastSyncAt: Date;
}> {
  const mode: SyncMode = params.mode ?? 'orders';

  let connection = await prisma.tradeStationConnection.findUnique({
    where: { account_id: params.accountId },
  });

  if (!connection) {
    throw new Error('TradeStation connection not found for account.');
  }

  const accessToken = await getValidAccessToken(params.accountId);

  // Best-effort: hydrate ts_account_id if not set and only one brokerage account is available.
  if (!connection.ts_account_id) {
    try {
      const accounts = await fetchBrokerageAccounts(accessToken);
      if (accounts.length === 1 && accounts[0]?.AccountID) {
        connection = await prisma.tradeStationConnection.update({
          where: { account_id: params.accountId },
          data: { ts_account_id: accounts[0].AccountID },
        });
      }
    } catch {
      // ignore
    }
  }

  if (!connection.ts_account_id) {
    throw new Error('TradeStation ts_account_id is not set.');
  }

  const now = new Date();

  // Positions (currently read-only; later can be used for reconciliation)
  if (mode === 'positions' || mode === 'full') {
    await fetchPositions({
      accountId: connection.ts_account_id,
      accessToken,
    });
  }

  let created = 0;

  if (mode === 'orders' || mode === 'full') {
    const ninetyDaysAgo = subtractDays(now, 90);
    // TradeStation Historical Orders endpoint has a hard max lookback of 90 calendar days.
    // Always clamp to that window to avoid "Date is out of range".
    const requestedSince = params.since ?? ninetyDaysAgo;
    const since = requestedSince < ninetyDaysAgo ? ninetyDaysAgo : requestedSince;

    const aggregatedOrders: Record<string, unknown>[] = [];

    let nextToken = connection.last_order_next_token ?? undefined;

    // Pull historical orders (last 90 days, closed orders)
    for (let page = 0; page < 50; page += 1) {
      const pageResult = await fetchHistoricalOrders({
        accountId: connection.ts_account_id,
        accessToken,
        since: since.toISOString(),
        pageSize: 600,
        nextToken,
      });

      aggregatedOrders.push(
        ...pageResult.orders.filter((order): order is Record<string, unknown> =>
          Boolean(order && typeof order === 'object'),
        ),
      );

      nextToken = pageResult.nextToken;
      if (!nextToken) {
        break;
      }
    }

    // Also pull today's + open orders (TradeStation /orders endpoint)
    let nextTokenToday: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const pageResult = await fetchOrdersToday({
        accountId: connection.ts_account_id,
        accessToken,
        pageSize: 600,
        nextToken: nextTokenToday,
      });

      aggregatedOrders.push(
        ...pageResult.orders.filter((order): order is Record<string, unknown> =>
          Boolean(order && typeof order === 'object'),
        ),
      );

      nextTokenToday = pageResult.nextToken;
      if (!nextTokenToday) {
        break;
      }
    }

    const normalizedRaw = aggregatedOrders.flatMap((order) =>
      normalizeTradesFromOrder(order),
    );

    const normalizedMap = new Map<string, NormalizedTrade>();
    for (const trade of normalizedRaw) {
      if (!normalizedMap.has(trade.externalRef)) {
        normalizedMap.set(trade.externalRef, trade);
      }
    }

    const normalized = Array.from(normalizedMap.values());

    if (normalized.length > 0) {
      const assetMap = await ensureAssetsBySymbol(
        normalized.map((t) => ({ symbol: t.symbol, assetType: t.assetType })),
      );

      const externalRefs = normalized.map((t) => t.externalRef);

      const existing = await prisma.ledgerTransaction.findMany({
        where: {
          account_id: params.accountId,
          external_reference: { in: externalRefs },
        },
        select: { external_reference: true },
      });

      const existingSet = new Set(existing.map((row) => row.external_reference).filter((v): v is string => Boolean(v)));

      const rowsToCreate = normalized
        .filter((t) => !existingSet.has(t.externalRef))
        .map((t) => {
          const assetId = assetMap.get(t.symbol);
          if (!assetId) {
            return null;
          }

          const unitPrice = t.unitPriceInBase;
          let totalValue: string | undefined;
          if (unitPrice !== undefined) {
            const qtyNumber = Number(t.quantity);
            const priceNumber = Number(unitPrice);
            if (Number.isFinite(qtyNumber) && Number.isFinite(priceNumber)) {
              totalValue = (qtyNumber * priceNumber).toString();
            }
          }

          return {
            date_time: t.dateTime,
            account_id: params.accountId,
            asset_id: assetId,
            quantity: t.quantity,
            tx_type: 'TRADE',
            external_reference: t.externalRef,
            notes: t.notes,
            unit_price_in_base: unitPrice,
            total_value_in_base: totalValue,
            fee_in_base: t.feeInBase,
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));

      if (rowsToCreate.length > 0) {
        const result = await prisma.ledgerTransaction.createMany({
          data: rowsToCreate,
        });
        created += result.count;
      }
    }

    await prisma.tradeStationConnection.update({
      where: { account_id: params.accountId },
      data: {
        last_order_sync_at: now,
        // We only persist a nextToken when the API gives us one and we intentionally stop mid-page.
        // For the current implementation we drain pages in one run, so typically this ends null.
        last_order_next_token: nextToken ?? null,
      },
    });
  }

  await prisma.tradeStationConnection.update({
    where: { account_id: params.accountId },
    data: {
      last_sync_at: now,
      status: 'ACTIVE',
    },
  });

  return {
    created,
    updated: 0,
    reconciled: 0,
    lastSyncAt: now,
  };
}
