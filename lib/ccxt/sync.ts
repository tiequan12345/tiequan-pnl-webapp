import { prisma } from '@/lib/db';
import {
  buildCcxtExchange,
  initializeCcxtExchange,
  parseOptionsJson,
  type CcxtExchangeId,
} from '@/lib/ccxt/client';
import { ensureAssetsBySymbol } from '@/lib/assets';

export type CcxtSyncMode = 'trades' | 'balances' | 'full';

type NormalizedCcxtTrade = {
  exchangeId: CcxtExchangeId;
  tradeId: string;
  symbol: string;
  base: string;
  quote: string;
  side: 'buy' | 'sell';
  amount: number;
  price?: number;
  cost?: number;
  feeCurrency?: string;
  feeCost?: number;
  timestamp: Date;
  raw?: unknown;
};

type NormalizedCcxtMovement = {
  exchangeId: CcxtExchangeId;
  movementType: 'DEPOSIT' | 'WITHDRAWAL';
  movementId: string;
  currency: string;
  amount: number;
  timestamp: Date;
  feeCost?: number;
  feeCurrency?: string;
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getDefaultSince(since?: Date): Date {
  if (since) {
    return since;
  }

  const lookbackDaysRaw = Number(process.env.CCXT_SYNC_LOOKBACK_DAYS ?? '90');
  const lookbackDays = Number.isFinite(lookbackDaysRaw) && lookbackDaysRaw > 0 ? lookbackDaysRaw : 90;
  return new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isSupportedExchangeId(value: string): value is CcxtExchangeId {
  return value === 'binance' || value === 'bybit';
}

function parseTrade(trade: any, exchangeId: CcxtExchangeId): NormalizedCcxtTrade | null {
  const tradeId = trade.id?.toString().trim();
  const symbol = trade.symbol?.trim();
  const timestampMs = trade.timestamp;
  const side = trade.side;
  const amount = trade.amount;

  if (!tradeId || !symbol || !timestampMs || (side !== 'buy' && side !== 'sell')) {
    return null;
  }

  const [baseRaw, quoteRaw] = symbol.split('/');
  const base = baseRaw?.split(':')[0]?.trim();
  const quote = quoteRaw?.split(':')[0]?.trim();

  if (!base || !quote || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const price = typeof trade.price === 'number' && Number.isFinite(trade.price) ? trade.price : undefined;
  const cost = typeof trade.cost === 'number' && Number.isFinite(trade.cost) ? trade.cost : undefined;
  const feeCurrency = trade.fee?.currency?.trim();
  const feeCost =
    typeof trade.fee?.cost === 'number' && Number.isFinite(trade.fee.cost) ? trade.fee.cost : undefined;

  return {
    exchangeId,
    tradeId,
    symbol,
    base,
    quote,
    side,
    amount,
    price,
    cost,
    feeCurrency,
    feeCost,
    timestamp: new Date(timestampMs),
    raw: trade.info,
  };
}

function parseMovement(params: {
  movement: any;
  exchangeId: CcxtExchangeId;
  movementType: 'DEPOSIT' | 'WITHDRAWAL';
}): NormalizedCcxtMovement | null {
  const { movement, exchangeId, movementType } = params;
  const currency = movement.currency?.toString().trim().toUpperCase();
  const amount = toFiniteNumber(movement.amount);
  const timestampMs = toFiniteNumber(movement.timestamp);

  if (!currency || amount === null || amount <= 0 || timestampMs === null || timestampMs <= 0) {
    return null;
  }

  const idCandidates = [movement.id, movement.txid, movement.transactionId, movement.info?.id]
    .map((value: unknown) => (value === null || value === undefined ? '' : String(value).trim()))
    .filter((value: string) => value.length > 0);

  const movementId =
    idCandidates[0] ??
    `${movementType}:${currency}:${Math.trunc(timestampMs)}:${amount}`;

  const feeCost = toFiniteNumber(movement.fee?.cost);
  const feeCurrency = movement.fee?.currency?.toString().trim().toUpperCase();

  return {
    exchangeId,
    movementType,
    movementId,
    currency,
    amount,
    timestamp: new Date(timestampMs),
    feeCost: feeCost !== null && feeCost > 0 ? feeCost : undefined,
    feeCurrency: feeCurrency || undefined,
  };
}

function toLedgerRows(params: {
  accountId: number;
  assetMap: Map<string, number>;
  trade: NormalizedCcxtTrade;
}): Array<{
  date_time: Date;
  account_id: number;
  asset_id: number;
  quantity: string;
  tx_type: string;
  external_reference: string;
  notes?: string;
  unit_price_in_base?: string;
  total_value_in_base?: string;
}> {
  const { accountId, assetMap, trade } = params;
  const rows: Array<{
    date_time: Date;
    account_id: number;
    asset_id: number;
    quantity: string;
    tx_type: string;
    external_reference: string;
    notes?: string;
    unit_price_in_base?: string;
    total_value_in_base?: string;
  }> = [];

  const baseAssetId = assetMap.get(trade.base);
  const quoteAssetId = assetMap.get(trade.quote);

  if (!baseAssetId || !quoteAssetId) {
    return rows;
  }

  const baseQty = trade.side === 'buy' ? trade.amount : -trade.amount;
  const quoteCost =
    typeof trade.cost === 'number' && Number.isFinite(trade.cost)
      ? trade.cost
      : typeof trade.price === 'number' && Number.isFinite(trade.price)
        ? trade.amount * trade.price
        : null;

  if (!Number.isFinite(baseQty) || !quoteCost || !Number.isFinite(quoteCost)) {
    return rows;
  }

  rows.push({
    date_time: trade.timestamp,
    account_id: accountId,
    asset_id: baseAssetId,
    quantity: String(baseQty),
    tx_type: 'TRADE',
    external_reference: `CCXT:${trade.exchangeId}:${trade.tradeId}:BASE`,
    notes: `CCXT ${trade.exchangeId} ${trade.symbol} ${trade.side}`,
    ...(typeof trade.price === 'number' ? { unit_price_in_base: String(trade.price) } : {}),
    total_value_in_base: String(Math.abs(quoteCost)),
  });

  const quoteQty = trade.side === 'buy' ? -quoteCost : quoteCost;

  rows.push({
    date_time: trade.timestamp,
    account_id: accountId,
    asset_id: quoteAssetId,
    quantity: String(quoteQty),
    tx_type: 'TRADE',
    external_reference: `CCXT:${trade.exchangeId}:${trade.tradeId}:QUOTE`,
    notes: `CCXT ${trade.exchangeId} ${trade.symbol} ${trade.side} quote leg`,
    total_value_in_base: String(Math.abs(quoteCost)),
  });

  if (trade.feeCurrency && typeof trade.feeCost === 'number' && trade.feeCost > 0) {
    const feeAssetId = assetMap.get(trade.feeCurrency);

    if (feeAssetId) {
      rows.push({
        date_time: trade.timestamp,
        account_id: accountId,
        asset_id: feeAssetId,
        quantity: String(-trade.feeCost),
        tx_type: 'TRADE_FEE',
        external_reference: `CCXT:${trade.exchangeId}:${trade.tradeId}:FEE`,
        notes: `CCXT ${trade.exchangeId} ${trade.symbol} fee ${trade.feeCurrency}`,
      });
    }
  }

  return rows;
}

function toMovementLedgerRows(params: {
  accountId: number;
  assetMap: Map<string, number>;
  movement: NormalizedCcxtMovement;
}): Array<{
  date_time: Date;
  account_id: number;
  asset_id: number;
  quantity: string;
  tx_type: string;
  external_reference: string;
  notes?: string;
}> {
  const { accountId, assetMap, movement } = params;
  const assetId = assetMap.get(movement.currency);
  if (!assetId) {
    return [];
  }

  const quantity = movement.movementType === 'DEPOSIT' ? movement.amount : -movement.amount;

  return [{
    date_time: movement.timestamp,
    account_id: accountId,
    asset_id: assetId,
    quantity: String(quantity),
    tx_type: movement.movementType,
    external_reference: `CCXT:${movement.exchangeId}:${movement.movementType}:${movement.movementId}`,
    notes: `CCXT ${movement.exchangeId} ${movement.movementType.toLowerCase()} ${movement.currency}`,
  }];
}

async function fetchTradesForSync(params: {
  exchange: any;
  since?: Date;
}): Promise<any[]> {
  const { exchange, since } = params;
  const sinceTs = getDefaultSince(since).getTime();

  const trades: any[] = [];

  const defaultQuote = (process.env.CCXT_DEFAULT_QUOTE ?? 'USDT').trim().toUpperCase();
  const symbols = Object.keys(exchange.markets ?? {}).filter((symbol) => symbol.endsWith(`/${defaultQuote}`));

  const targets = symbols.slice(0, 300);

  if (targets.length === 0) {
    const unscoped = await exchange.fetchMyTrades(undefined, sinceTs, 200);
    trades.push(...unscoped);
    return trades;
  }

  for (const symbol of targets) {
    try {
      const result = await exchange.fetchMyTrades(symbol, sinceTs, 200);
      trades.push(...result);
    } catch {
      // Best effort per symbol.
    }
  }

  return trades;
}

async function fetchMovementsForSync(params: {
  exchange: any;
  exchangeId: CcxtExchangeId;
  since?: Date;
}): Promise<NormalizedCcxtMovement[]> {
  const { exchange, exchangeId, since } = params;
  const sinceTs = getDefaultSince(since).getTime();
  const results: NormalizedCcxtMovement[] = [];

  if (exchange.has?.fetchDeposits) {
    try {
      const deposits = await exchange.fetchDeposits(undefined, sinceTs, 1000);
      for (const deposit of deposits ?? []) {
        const parsed = parseMovement({ movement: deposit, exchangeId, movementType: 'DEPOSIT' });
        if (parsed) results.push(parsed);
      }
    } catch {
      // Best effort.
    }
  }

  if (exchange.has?.fetchWithdrawals) {
    try {
      const withdrawals = await exchange.fetchWithdrawals(undefined, sinceTs, 1000);
      for (const withdrawal of withdrawals ?? []) {
        const parsed = parseMovement({ movement: withdrawal, exchangeId, movementType: 'WITHDRAWAL' });
        if (parsed) results.push(parsed);
      }
    } catch {
      // Best effort.
    }
  }

  return results;
}

async function reconcileCcxtBalances(params: {
  accountId: number;
  exchangeId: CcxtExchangeId;
  exchange: any;
  asOf: Date;
}): Promise<number> {
  const balance = await params.exchange.fetchBalance();
  const totalsRaw = (balance?.total ?? {}) as Record<string, unknown>;
  const totalsBySymbol = new Map<string, number>();

  for (const [symbolRaw, amountRaw] of Object.entries(totalsRaw)) {
    const symbol = symbolRaw.trim().toUpperCase();
    if (!symbol) continue;
    const amount = toFiniteNumber(amountRaw);
    if (amount === null) continue;
    totalsBySymbol.set(symbol, amount);
  }

  const ledgerRows = await prisma.ledgerTransaction.findMany({
    where: { account_id: params.accountId },
    select: {
      quantity: true,
      asset: {
        select: {
          symbol: true,
        },
      },
    },
  });

  const ledgerBySymbol = new Map<string, number>();
  for (const row of ledgerRows) {
    const symbol = row.asset.symbol.trim().toUpperCase();
    if (!symbol) continue;
    const quantity = Number(row.quantity);
    if (!Number.isFinite(quantity)) continue;
    ledgerBySymbol.set(symbol, (ledgerBySymbol.get(symbol) ?? 0) + quantity);
  }

  const allSymbols = new Set<string>([...totalsBySymbol.keys(), ...ledgerBySymbol.keys()]);
  if (allSymbols.size === 0) {
    return 0;
  }

  const symbolList = Array.from(allSymbols);
  const assetMap = await ensureAssetsBySymbol(
    symbolList.map((symbol) => ({
      symbol,
      assetType: symbol === 'USD' ? 'CASH' : symbol === 'USDT' || symbol === 'USDC' ? 'STABLE' : 'CRYPTO',
    })),
  );

  const dateKey = formatDateKey(params.asOf);
  const epsilon = 1e-8;

  let reconciled = 0;

  for (const symbol of symbolList) {
    const assetId = assetMap.get(symbol);
    if (!assetId) {
      continue;
    }

    const exchangeQty = totalsBySymbol.get(symbol) ?? 0;
    const ledgerQty = ledgerBySymbol.get(symbol) ?? 0;
    const delta = exchangeQty - ledgerQty;

    if (!Number.isFinite(delta) || Math.abs(delta) < epsilon) {
      continue;
    }

    const externalReference = `CCXT:${params.exchangeId}:BALANCE:${params.accountId}:${symbol}:${dateKey}`;
    const notes = `CCXT balance reconcile ${symbol} ${dateKey}: exchange=${exchangeQty} ledger=${ledgerQty}`;

    const existing = await prisma.ledgerTransaction.findFirst({
      where: {
        account_id: params.accountId,
        external_reference: externalReference,
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.ledgerTransaction.update({
        where: { id: existing.id },
        data: {
          date_time: params.asOf,
          quantity: String(delta),
          notes,
        },
      });
      reconciled += 1;
      continue;
    }

    await prisma.ledgerTransaction.create({
      data: {
        date_time: params.asOf,
        account_id: params.accountId,
        asset_id: assetId,
        quantity: String(delta),
        tx_type: 'RECONCILIATION',
        external_reference: externalReference,
        notes,
      },
    });
    reconciled += 1;
  }

  return reconciled;
}

export async function syncCcxtAccount(params: {
  accountId: number;
  mode?: CcxtSyncMode;
  since?: Date;
}): Promise<{
  created: number;
  updated: number;
  reconciled: number;
  lastSyncAt: Date;
}> {
  const mode = params.mode ?? 'trades';
  const now = new Date();

  const connection = await prisma.ccxtConnection.findUnique({
    where: { account_id: params.accountId },
  });

  if (!connection) {
    throw new Error('CCXT connection not found for account.');
  }

  if (!isSupportedExchangeId(connection.exchange_id)) {
    throw new Error(`Unsupported exchange_id '${connection.exchange_id}'.`);
  }

  const exchangeId = connection.exchange_id as CcxtExchangeId;
  const connectionOptions = parseOptionsJson(connection.options_json);

  const buildExchangeForSync = (defaultTypeOverride?: 'spot' | 'margin') =>
    buildCcxtExchange({
      exchangeId,
      credentials: {
        apiKey: connection.api_key_enc,
        secret: connection.api_secret_enc,
        passphrase: connection.passphrase_enc ?? undefined,
        encrypted: true,
      },
      sandbox: connection.sandbox,
      options: defaultTypeOverride
        ? {
            ...(connectionOptions ?? {}),
            defaultType: defaultTypeOverride,
          }
        : connectionOptions,
    });

  let created = 0;
  let reconciled = 0;
  let latestTradeCursor: { tradeId: string; timestamp: Date } | null = null;

  if (mode === 'trades' || mode === 'full') {
    const exchangesForTradeSync =
      exchangeId === 'binance'
        ? [buildExchangeForSync('spot'), buildExchangeForSync('margin')]
        : [buildExchangeForSync()];

    const fetchedTrades: any[] = [];

    for (const exchange of exchangesForTradeSync) {
      await initializeCcxtExchange(exchange);
      await exchange.loadMarkets();

      const trades = await fetchTradesForSync({
        exchange,
        since: params.since,
      });

      fetchedTrades.push(...trades);
    }

    const normalized = fetchedTrades
      .map((trade) => parseTrade(trade, exchangeId))
      .filter((trade): trade is NormalizedCcxtTrade => Boolean(trade));

    const seenTradeKeys = new Set<string>();
    const deduped = normalized.filter((trade) => {
      const key = `${trade.exchangeId}:${trade.tradeId}:${trade.symbol}:${trade.timestamp.toISOString()}:${trade.side}:${trade.amount}`;
      if (seenTradeKeys.has(key)) return false;
      seenTradeKeys.add(key);
      return true;
    });

    const symbolsToEnsure = new Set<string>();

    for (const trade of deduped) {
      symbolsToEnsure.add(trade.base);
      symbolsToEnsure.add(trade.quote);
      if (trade.feeCurrency) symbolsToEnsure.add(trade.feeCurrency);
    }

    const assetMap = await ensureAssetsBySymbol(
      Array.from(symbolsToEnsure).map((symbol) => ({ symbol, assetType: 'CRYPTO' })),
    );

    const candidateRows = deduped.flatMap((trade) =>
      toLedgerRows({ accountId: params.accountId, assetMap, trade }),
    );

    const refs = candidateRows.map((row) => row.external_reference);

    const existing = refs.length
      ? await prisma.ledgerTransaction.findMany({
          where: {
            account_id: params.accountId,
            external_reference: { in: refs },
          },
          select: { external_reference: true },
        })
      : [];

    const existingRefs = new Set(
      existing
        .map((row) => row.external_reference)
        .filter((value): value is string => Boolean(value)),
    );

    const toCreate = candidateRows.filter((row) => !existingRefs.has(row.external_reference));

    if (toCreate.length) {
      const result = await prisma.ledgerTransaction.createMany({
        data: toCreate,
      });
      created += result.count;
    }

    const movementExchange = exchangeId === 'binance' ? buildExchangeForSync('spot') : buildExchangeForSync();
    await initializeCcxtExchange(movementExchange);

    const movements = await fetchMovementsForSync({
      exchange: movementExchange,
      exchangeId,
      since: params.since,
    });

    if (movements.length > 0) {
      const movementSymbols = Array.from(new Set(movements.map((movement) => movement.currency)));
      const movementAssetMap = await ensureAssetsBySymbol(
        movementSymbols.map((symbol) => ({
          symbol,
          assetType: symbol === 'USD' ? 'CASH' : symbol === 'USDT' || symbol === 'USDC' ? 'STABLE' : 'CRYPTO',
        })),
      );

      const movementRows = movements.flatMap((movement) =>
        toMovementLedgerRows({
          accountId: params.accountId,
          assetMap: movementAssetMap,
          movement,
        }),
      );

      const movementRefs = movementRows.map((row) => row.external_reference);

      const existingMovementRows = movementRefs.length
        ? await prisma.ledgerTransaction.findMany({
            where: {
              account_id: params.accountId,
              external_reference: { in: movementRefs },
            },
            select: { external_reference: true },
          })
        : [];

      const existingMovementRefs = new Set(
        existingMovementRows
          .map((row) => row.external_reference)
          .filter((value): value is string => Boolean(value)),
      );

      const movementToCreate = movementRows.filter((row) => !existingMovementRefs.has(row.external_reference));

      if (movementToCreate.length > 0) {
        const movementResult = await prisma.ledgerTransaction.createMany({
          data: movementToCreate,
        });
        created += movementResult.count;
      }
    }

    const lastTrade = deduped.length
      ? deduped.reduce((latest, item) => (item.timestamp > latest.timestamp ? item : latest), deduped[0])
      : null;

    latestTradeCursor = lastTrade
      ? {
          tradeId: lastTrade.tradeId,
          timestamp: lastTrade.timestamp,
        }
      : latestTradeCursor;
  }

  if (mode === 'balances' || mode === 'full') {
    const balanceExchange = exchangeId === 'binance' ? buildExchangeForSync('spot') : buildExchangeForSync();
    await initializeCcxtExchange(balanceExchange);
    reconciled += await reconcileCcxtBalances({
      accountId: params.accountId,
      exchangeId,
      exchange: balanceExchange,
      asOf: now,
    });
  }

  await prisma.ccxtConnection.update({
    where: { account_id: params.accountId },
    data: {
      last_sync_at: now,
      ...(latestTradeCursor
        ? {
            last_trade_sync_at: latestTradeCursor.timestamp,
            last_trade_cursor: JSON.stringify({
              tradeId: latestTradeCursor.tradeId,
              timestamp: latestTradeCursor.timestamp.toISOString(),
            }),
          }
        : {}),
      status: 'ACTIVE',
    },
  });

  return {
    created,
    updated: 0,
    reconciled,
    lastSyncAt: now,
  };
}