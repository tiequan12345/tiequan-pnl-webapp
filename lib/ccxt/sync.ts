import { prisma } from '@/lib/db';
import {
  buildCcxtExchange,
  initializeCcxtExchange,
  parseOptionsJson,
  type CcxtExchangeId,
} from '@/lib/ccxt/client';
import { ensureAssetsBySymbol, updateAssetStatusesForAccount } from '@/lib/assets';

export type CcxtSyncMode = 'trades' | 'balances' | 'full';

type TradeLedgerType = 'TRADE' | 'HEDGE';
type TradeMarketScope = 'spotLike' | 'derivatives' | 'all';

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
  txType: TradeLedgerType;
  referenceScope?: string;
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

type SyncProgressPayload = {
  stage: string;
  message?: string;
  [key: string]: unknown;
};

type SyncProgressReporter = (payload: SyncProgressPayload) => Promise<void> | void;

// Bybit v5 supports fetchMyTrades without a symbol, which dramatically reduces
// sync API calls. Add exchanges here only after verifying unscoped support.
const EXCHANGES_WITH_UNSCOPED_MY_TRADES = new Set<CcxtExchangeId>(['bybit']);

// Bybit private execution history enforces a max 7-day start/end window.
const BYBIT_TRADE_QUERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const BYBIT_UNSCOPED_CATEGORIES_BY_SCOPE: Record<TradeMarketScope, string[]> = {
  spotLike: ['spot'],
  derivatives: ['linear', 'inverse', 'option'],
  all: ['spot', 'linear', 'inverse', 'option'],
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

async function reportProgress(
  onProgress: SyncProgressReporter | undefined,
  payload: SyncProgressPayload,
): Promise<void> {
  if (!onProgress) {
    return;
  }

  try {
    await onProgress(payload);
  } catch {
    // Progress reporting is best effort and must never interrupt sync.
  }
}

function extractBalanceTotals(balance: any): Map<string, number> {
  const totalRaw = (balance?.total ?? {}) as Record<string, unknown>;
  const freeRaw = (balance?.free ?? {}) as Record<string, unknown>;
  const usedRaw = (balance?.used ?? {}) as Record<string, unknown>;

  const symbols = new Set<string>([
    ...Object.keys(totalRaw),
    ...Object.keys(freeRaw),
    ...Object.keys(usedRaw),
  ]);

  const totalsBySymbol = new Map<string, number>();

  for (const symbolRaw of symbols) {
    const symbol = symbolRaw.trim().toUpperCase();
    if (!symbol) continue;

    const totalValue = toFiniteNumber(totalRaw[symbolRaw]);
    const resolvedTotal =
      totalValue ??
      ((toFiniteNumber(freeRaw[symbolRaw]) ?? 0) + (toFiniteNumber(usedRaw[symbolRaw]) ?? 0));

    if (!Number.isFinite(resolvedTotal)) {
      continue;
    }

    totalsBySymbol.set(symbol, resolvedTotal);
  }

  // Binance-specific fallback from raw payload (more reliable for some accounts/assets).
  const rawBalances = Array.isArray(balance?.info?.balances) ? balance.info.balances : [];
  for (const row of rawBalances) {
    const symbol = String(row?.asset ?? '')
      .trim()
      .toUpperCase();
    if (!symbol) continue;

    const free = toFiniteNumber(row?.free) ?? 0;
    const locked = toFiniteNumber(row?.locked) ?? 0;
    const total = free + locked;

    if (!Number.isFinite(total)) {
      continue;
    }

    totalsBySymbol.set(symbol, total);
  }

  return totalsBySymbol;
}

function addBalanceTotals(base: Map<string, number>, extra: Map<string, number>): Map<string, number> {
  const merged = new Map(base);

  for (const [symbol, amount] of extra.entries()) {
    if (!Number.isFinite(amount)) {
      continue;
    }

    merged.set(symbol, (merged.get(symbol) ?? 0) + amount);
  }

  return merged;
}

async function fetchBinanceSpotWalletTotals(exchange: any): Promise<Map<string, number>> {
  // Prefer Binance spot wallet endpoint; it returns explicit free/locked by coin.
  if (typeof exchange?.sapiGetCapitalConfigGetall === 'function') {
    try {
      const rows = await exchange.sapiGetCapitalConfigGetall();
      const totals = new Map<string, number>();

      for (const row of rows ?? []) {
        const symbol = String(row?.coin ?? '').trim().toUpperCase();
        if (!symbol) continue;

        const free = toFiniteNumber(row?.free) ?? 0;
        const locked = toFiniteNumber(row?.locked) ?? 0;
        const total = free + locked;

        if (!Number.isFinite(total)) continue;
        totals.set(symbol, total);
      }

      return totals;
    } catch {
      // Fall back to CCXT's generic balance parser.
    }
  }

  const spotBalance = await exchange.fetchBalance({ type: 'spot' });
  return extractBalanceTotals(spotBalance);
}

function extractBinanceFuturesWalletTotals(balance: any): Map<string, number> {
  const totals = new Map<string, number>();

  const rows = Array.isArray(balance?.info?.assets) ? balance.info.assets : [];
  for (const row of rows) {
    const symbol = String(row?.asset ?? '').trim().toUpperCase();
    if (!symbol) continue;

    // Important: walletBalance excludes unrealized PnL.
    const walletBalance = toFiniteNumber(row?.walletBalance);
    if (walletBalance === null || !Number.isFinite(walletBalance)) {
      continue;
    }

    totals.set(symbol, walletBalance);
  }

  return totals;
}

const USD_LIKE_SYMBOLS = new Set(['USD', 'USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'USDP', 'DAI']);

async function buildBinanceUsdPriceMap(exchange: any, symbols: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();

  const tradableSymbols = symbols.filter((symbol) => !USD_LIKE_SYMBOLS.has(symbol));
  if (tradableSymbols.length === 0) {
    return prices;
  }

  if (!exchange.markets || Object.keys(exchange.markets).length === 0) {
    try {
      await exchange.loadMarkets();
    } catch {
      return prices;
    }
  }

  const markets = exchange.markets ?? {};
  const tickerSymbols = Array.from(
    new Set(
      tradableSymbols
        .map((symbol) => `${symbol}/USDT`)
        .filter((marketSymbol) => Boolean(markets[marketSymbol])),
    ),
  );

  if (tickerSymbols.length === 0) {
    return prices;
  }

  try {
    const tickers = await exchange.fetchTickers(tickerSymbols);
    for (const [marketSymbol, ticker] of Object.entries(tickers ?? {})) {
      const base = String(marketSymbol).split('/')[0]?.trim().toUpperCase();
      if (!base) continue;

      const last = toFiniteNumber((ticker as any)?.last);
      if (last !== null && last > 0) {
        prices.set(base, last);
      }
    }
  } catch {
    // Best effort.
  }

  return prices;
}

async function applyBinanceUsdThreshold(params: {
  exchange: any;
  totalsBySymbol: Map<string, number>;
  minUsdValue: number;
}): Promise<Map<string, number>> {
  const { exchange, totalsBySymbol, minUsdValue } = params;
  if (!(minUsdValue > 0)) {
    return totalsBySymbol;
  }

  const symbols = Array.from(totalsBySymbol.keys());
  const priceMap = await buildBinanceUsdPriceMap(exchange, symbols);

  const filtered = new Map<string, number>();
  for (const [symbol, qty] of totalsBySymbol.entries()) {
    const absQty = Math.abs(qty);
    const usdValue = USD_LIKE_SYMBOLS.has(symbol)
      ? absQty
      : (() => {
          const price = priceMap.get(symbol);
          if (price === undefined || !Number.isFinite(price)) {
            return null;
          }
          return absQty * price;
        })();

    if (usdValue !== null && usdValue < minUsdValue) {
      continue;
    }

    // If we cannot price the asset via Binance markets, fall back to quantity threshold.
    if (usdValue === null && absQty < minUsdValue) {
      continue;
    }

    filtered.set(symbol, qty);
  }

  return filtered;
}

function isSupportedExchangeId(value: string): value is CcxtExchangeId {
  return value === 'binance' || value === 'bybit';
}

function parseTrade(params: {
  trade: any;
  exchangeId: CcxtExchangeId;
  txType: TradeLedgerType;
  referenceScope?: string;
}): NormalizedCcxtTrade | null {
  const { trade, exchangeId, txType, referenceScope } = params;
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
    txType,
    referenceScope,
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

  const tradeTimestampIso = trade.timestamp.toISOString();
  const tradeReferencePrefix = trade.referenceScope
    ? `CCXT:${trade.exchangeId}:${trade.referenceScope}:${trade.symbol}:${tradeTimestampIso}:${trade.side}:${trade.amount}:${trade.tradeId}`
    : `CCXT:${trade.exchangeId}:${trade.symbol}:${tradeTimestampIso}:${trade.side}:${trade.amount}:${trade.tradeId}`;

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
    tx_type: trade.txType,
    external_reference: `${tradeReferencePrefix}:BASE`,
    notes: `CCXT ${trade.exchangeId}${trade.referenceScope ? ` ${trade.referenceScope.toLowerCase()}` : ''} ${trade.symbol} ${trade.side}`,
    ...(typeof trade.price === 'number' ? { unit_price_in_base: String(trade.price) } : {}),
    total_value_in_base: String(Math.abs(quoteCost)),
  });

  const quoteQty = trade.side === 'buy' ? -quoteCost : quoteCost;

  rows.push({
    date_time: trade.timestamp,
    account_id: accountId,
    asset_id: quoteAssetId,
    quantity: String(quoteQty),
    tx_type: trade.txType,
    external_reference: `${tradeReferencePrefix}:QUOTE`,
    notes: `CCXT ${trade.exchangeId}${trade.referenceScope ? ` ${trade.referenceScope.toLowerCase()}` : ''} ${trade.symbol} ${trade.side} quote leg`,
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
        external_reference: `${tradeReferencePrefix}:FEE`,
        notes: `CCXT ${trade.exchangeId}${trade.referenceScope ? ` ${trade.referenceScope.toLowerCase()}` : ''} ${trade.symbol} fee ${trade.feeCurrency}`,
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

  const movementTimestampIso = movement.timestamp.toISOString();

  return [{
    date_time: movement.timestamp,
    account_id: accountId,
    asset_id: assetId,
    quantity: String(quantity),
    tx_type: movement.movementType,
    external_reference: `CCXT:${movement.exchangeId}:${movement.movementType}:${movement.movementId}:${movement.currency}:${movementTimestampIso}:${movement.amount}`,
    notes: `CCXT ${movement.exchangeId} ${movement.movementType.toLowerCase()} ${movement.currency}`,
  }];
}

async function fetchTradesForSync(params: {
  exchange: any;
  exchangeId: CcxtExchangeId;
  since?: Date;
  marketScope?: TradeMarketScope;
  onProgress?: SyncProgressReporter;
}): Promise<any[]> {
  const { exchange, exchangeId, since, marketScope = 'all', onProgress } = params;
  const sinceTs = getDefaultSince(since).getTime();

  const trades: any[] = [];

  const defaultQuote = (process.env.CCXT_DEFAULT_QUOTE ?? 'USDT').trim().toUpperCase();
  const derivativesDefaultQuoteOnly =
    String(process.env.CCXT_DERIVATIVES_DEFAULT_QUOTE_ONLY ?? 'false').toLowerCase() === 'true';

  const pageLimitRaw = Number(process.env.CCXT_SYNC_TRADE_PAGE_LIMIT ?? '200');
  const pageLimit =
    Number.isFinite(pageLimitRaw) && pageLimitRaw > 0
      ? Math.min(Math.trunc(pageLimitRaw), 1000)
      : 200;

  const maxPagesRaw = Number(process.env.CCXT_SYNC_TRADE_MAX_PAGES_PER_SYMBOL ?? '5');
  const maxPagesPerSymbol =
    Number.isFinite(maxPagesRaw) && maxPagesRaw > 0
      ? Math.trunc(maxPagesRaw)
      : 5;

  const markets = Object.values(exchange.markets ?? {}) as any[];
  const candidateSymbols = markets
    .filter((market) => {
      const symbol = String(market?.symbol ?? '').trim();
      if (!symbol) {
        return false;
      }

      const isContract = Boolean(market?.contract);
      if (marketScope === 'spotLike' && isContract) {
        return false;
      }
      if (marketScope === 'derivatives' && !isContract) {
        return false;
      }

      const quote = String(market?.quote ?? '').trim().toUpperCase();
      if (!quote) {
        return false;
      }

      if (marketScope === 'derivatives') {
        return derivativesDefaultQuoteOnly ? quote === defaultQuote : true;
      }

      if (marketScope === 'all') {
        return true;
      }

      return quote === defaultQuote;
    })
    .map((market) => String(market.symbol).trim())
    .filter(Boolean);

  const maxSymbolsRaw = Number(process.env.CCXT_SYNC_MAX_MARKETS_PER_PROFILE ?? '0');
  const maxSymbols = Number.isFinite(maxSymbolsRaw) && maxSymbolsRaw > 0 ? maxSymbolsRaw : null;

  const uniqueSymbols = Array.from(new Set(candidateSymbols));
  const targets = maxSymbols ? uniqueSymbols.slice(0, maxSymbols) : uniqueSymbols;

  await reportProgress(onProgress, {
    stage: 'trades.symbols',
    message: `Scanning ${targets.length || 1} market target(s).`,
    symbolCount: targets.length || 1,
    marketScope,
  });

  const fetchSymbolTrades = async (
    symbol?: string,
    symbolIndex?: number,
    extraParams?: Record<string, unknown>,
  ): Promise<void> => {
    const fetchWindow = async (
      windowSince: number,
      windowEnd?: number,
      windowIndex?: number,
      windowCount?: number,
    ): Promise<void> => {
      let cursorSince = windowSince;

      for (let page = 0; page < maxPagesPerSymbol; page += 1) {
        await reportProgress(onProgress, {
          stage: 'trades.fetch',
          symbol: symbol ?? '*',
          symbolIndex,
          page: page + 1,
          pages: maxPagesPerSymbol,
          ...(windowIndex && windowCount ? { windowIndex, windowCount } : {}),
        });

        const requestParams = {
          ...(extraParams ?? {}),
          ...(windowEnd !== undefined ? { endTime: windowEnd } : {}),
        };
        const result = await exchange.fetchMyTrades(symbol, cursorSince, pageLimit, requestParams);
        if (!Array.isArray(result) || result.length === 0) {
          return;
        }

        trades.push(...result);

        await reportProgress(onProgress, {
          stage: 'trades.fetched',
          symbol: symbol ?? '*',
          symbolIndex,
          page: page + 1,
          fetched: result.length,
          totalFetched: trades.length,
          ...(windowIndex && windowCount ? { windowIndex, windowCount } : {}),
        });

        if (result.length < pageLimit) {
          return;
        }

        let maxTimestamp = cursorSince;
        for (const trade of result) {
          const ts = toFiniteNumber((trade as any)?.timestamp);
          if (ts !== null && ts > maxTimestamp) {
            maxTimestamp = ts;
          }
        }

        if (!(maxTimestamp > cursorSince)) {
          return;
        }

        cursorSince = Math.trunc(maxTimestamp) + 1;

        if (windowEnd !== undefined && cursorSince > windowEnd) {
          return;
        }
      }
    };

    if (exchangeId === 'bybit') {
      const nowTs = Date.now();
      let windowSince = sinceTs;
      const windowCount = Math.max(1, Math.ceil((nowTs - sinceTs + 1) / BYBIT_TRADE_QUERY_WINDOW_MS));
      let windowIndex = 0;

      while (windowSince <= nowTs) {
        windowIndex += 1;
        const windowEnd = Math.min(windowSince + BYBIT_TRADE_QUERY_WINDOW_MS - 1, nowTs);
        await fetchWindow(windowSince, windowEnd, windowIndex, windowCount);
        windowSince = windowEnd + 1;
      }
      return;
    }

    await fetchWindow(sinceTs);
  };

  const supportsUnscopedFetchMyTrades = EXCHANGES_WITH_UNSCOPED_MY_TRADES.has(exchangeId);

  if (supportsUnscopedFetchMyTrades) {
    const unscopedRequests: Array<{ label: string; params?: Record<string, unknown> }> =
      exchangeId === 'bybit'
        ? BYBIT_UNSCOPED_CATEGORIES_BY_SCOPE[marketScope].map((category) => ({
            label: category,
            params: { category },
          }))
        : [{ label: 'default' }];

    let unscopedFetched = 0;

    for (const request of unscopedRequests) {
      try {
        const before = trades.length;
        await fetchSymbolTrades(undefined, 1, request.params);
        unscopedFetched += trades.length - before;
      } catch (error) {
        console.warn(
          `[ccxt-sync] Unscoped fetchMyTrades failed for ${exchangeId} (${marketScope}, ${request.label}); falling back to per-symbol sync.`,
          error,
        );
      }
    }

    if (unscopedFetched > 0 || targets.length === 0) {
      return trades;
    }

    console.warn(
      `[ccxt-sync] Unscoped fetchMyTrades returned no trades for ${exchangeId} (${marketScope}); falling back to per-symbol sync.`,
    );
  }

  if (targets.length === 0) {
    if (!supportsUnscopedFetchMyTrades) {
      try {
        await fetchSymbolTrades(undefined, 1);
      } catch {
        // Some exchange/profile combinations do not support unscoped fetchMyTrades.
      }
    }
    return trades;
  }

  for (let index = 0; index < targets.length; index += 1) {
    const symbol = targets[index];
    try {
      await fetchSymbolTrades(symbol, index + 1);
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
  onProgress?: SyncProgressReporter;
}): Promise<NormalizedCcxtMovement[]> {
  const { exchange, exchangeId, since, onProgress } = params;
  const sinceTs = getDefaultSince(since).getTime();
  const results: NormalizedCcxtMovement[] = [];

  const pageLimitRaw = Number(process.env.CCXT_SYNC_MOVEMENT_PAGE_LIMIT ?? '1000');
  const pageLimit = Number.isFinite(pageLimitRaw) && pageLimitRaw > 0
    ? Math.min(Math.trunc(pageLimitRaw), 1000)
    : 1000;

  const maxPagesRaw = Number(process.env.CCXT_SYNC_MOVEMENT_MAX_PAGES ?? '5');
  const maxPages = Number.isFinite(maxPagesRaw) && maxPagesRaw > 0
    ? Math.trunc(maxPagesRaw)
    : 5;

  const fetchMovementPages = async (
    movementType: 'DEPOSIT' | 'WITHDRAWAL',
    fetcher: (code?: string, since?: number, limit?: number) => Promise<any[]>,
  ): Promise<void> => {
    let cursorSince = sinceTs;

    for (let page = 0; page < maxPages; page += 1) {
      await reportProgress(onProgress, {
        stage: 'movements.fetch',
        movementType,
        page: page + 1,
        pages: maxPages,
      });

      const pageRows = await fetcher(undefined, cursorSince, pageLimit);
      if (!Array.isArray(pageRows) || pageRows.length === 0) {
        return;
      }

      for (const movement of pageRows) {
        const parsed = parseMovement({ movement, exchangeId, movementType });
        if (parsed) {
          results.push(parsed);
        }
      }

      await reportProgress(onProgress, {
        stage: 'movements.fetched',
        movementType,
        page: page + 1,
        fetched: pageRows.length,
        totalFetched: results.length,
      });

      if (pageRows.length < pageLimit) {
        return;
      }

      let maxTimestamp = cursorSince;
      for (const movement of pageRows) {
        const ts = toFiniteNumber((movement as any)?.timestamp);
        if (ts !== null && ts > maxTimestamp) {
          maxTimestamp = ts;
        }
      }

      if (!(maxTimestamp > cursorSince)) {
        return;
      }

      cursorSince = Math.trunc(maxTimestamp) + 1;
    }
  };

  if (exchange.has?.fetchDeposits) {
    try {
      await fetchMovementPages('DEPOSIT', exchange.fetchDeposits.bind(exchange));
    } catch {
      // Best effort.
    }
  }

  if (exchange.has?.fetchWithdrawals) {
    try {
      await fetchMovementPages('WITHDRAWAL', exchange.fetchWithdrawals.bind(exchange));
    } catch {
      // Best effort.
    }
  }

  return results;
}

function extractBaseSymbolFromCcxtSymbol(symbolRaw: unknown): string | null {
  const symbol = String(symbolRaw ?? '').trim();
  if (!symbol) {
    return null;
  }

  const base = symbol.split('/')[0]?.split(':')[0]?.trim().toUpperCase();
  return base || null;
}

function extractSignedPositionContracts(position: any): number | null {
  const rawPositionAmt = toFiniteNumber(position?.info?.positionAmt);
  if (rawPositionAmt !== null && Number.isFinite(rawPositionAmt)) {
    return rawPositionAmt;
  }

  const contracts = toFiniteNumber(position?.contracts);
  if (contracts === null || !Number.isFinite(contracts)) {
    return null;
  }

  if (contracts === 0) {
    return 0;
  }

  const side = String(position?.side ?? '')
    .trim()
    .toLowerCase();

  if (side === 'short') {
    return -Math.abs(contracts);
  }

  if (side === 'long') {
    return Math.abs(contracts);
  }

  return contracts;
}

async function reconcileCcxtFuturesPositions(params: {
  accountId: number;
  exchangeId: CcxtExchangeId;
  exchange: any;
  asOf: Date;
}): Promise<number> {
  if (typeof params.exchange?.fetchPositions !== 'function') {
    return 0;
  }

  let fetchedPositions: any[] = [];

  if (params.exchangeId === 'bybit') {
    const bybitCategories = ['linear', 'inverse', 'option'];
    let fetchedAnyCategory = false;

    for (const category of bybitCategories) {
      try {
        const positions = await params.exchange.fetchPositions(undefined, { category });
        if (!Array.isArray(positions) || positions.length === 0) {
          continue;
        }

        fetchedPositions.push(...positions);
        fetchedAnyCategory = true;
      } catch {
        // Best effort per Bybit category.
      }
    }

    if (!fetchedAnyCategory) {
      try {
        const positions = await params.exchange.fetchPositions();
        fetchedPositions = Array.isArray(positions) ? positions : [];
      } catch {
        return 0;
      }
    }
  } else {
    try {
      const positions = await params.exchange.fetchPositions();
      fetchedPositions = Array.isArray(positions) ? positions : [];
    } catch {
      return 0;
    }
  }

  const targetBySymbol = new Map<string, number>();
  const futuresSnapshotBySymbol = new Map<string, {
    contracts: number;
    unrealizedPnl: number;
    contractsAbs: number;
    entryNotionalAbs: number;
    markNotionalAbs: number;
  }>();
  const epsilon = 1e-8;

  for (const position of fetchedPositions) {
    const baseSymbol =
      extractBaseSymbolFromCcxtSymbol(position?.symbol) ??
      extractBaseSymbolFromCcxtSymbol(position?.info?.symbol);
    if (!baseSymbol) {
      continue;
    }

    const signedContracts = extractSignedPositionContracts(position);
    if (signedContracts === null || !Number.isFinite(signedContracts) || Math.abs(signedContracts) < epsilon) {
      continue;
    }

    targetBySymbol.set(baseSymbol, (targetBySymbol.get(baseSymbol) ?? 0) + signedContracts);

    const unrealizedPnl =
      toFiniteNumber(position?.unrealizedPnl) ??
      toFiniteNumber(position?.info?.unRealizedProfit) ??
      0;

    const entryPrice = toFiniteNumber(position?.entryPrice) ?? toFiniteNumber(position?.info?.entryPrice);
    const markPrice = toFiniteNumber(position?.markPrice) ?? toFiniteNumber(position?.info?.markPrice);
    const contractSizeRaw = toFiniteNumber(position?.contractSize) ?? toFiniteNumber(position?.info?.contractSize);
    const contractSize = contractSizeRaw !== null && Number.isFinite(contractSizeRaw) && contractSizeRaw > 0
      ? contractSizeRaw
      : 1;

    const contractsAbs = Math.abs(signedContracts);
    const entryNotionalAbs =
      entryPrice !== null && Number.isFinite(entryPrice) && entryPrice > 0
        ? contractsAbs * entryPrice * contractSize
        : 0;
    const markNotionalAbs =
      markPrice !== null && Number.isFinite(markPrice) && markPrice > 0
        ? contractsAbs * markPrice * contractSize
        : 0;

    const existing = futuresSnapshotBySymbol.get(baseSymbol) ?? {
      contracts: 0,
      unrealizedPnl: 0,
      contractsAbs: 0,
      entryNotionalAbs: 0,
      markNotionalAbs: 0,
    };

    existing.contracts += signedContracts;
    existing.unrealizedPnl += unrealizedPnl;
    existing.contractsAbs += contractsAbs;
    existing.entryNotionalAbs += entryNotionalAbs;
    existing.markNotionalAbs += markNotionalAbs;

    futuresSnapshotBySymbol.set(baseSymbol, existing);
  }

  const positionReferencePrefix = `CCXT:${params.exchangeId}:POSITION:${params.accountId}:`;
  const legacyPositionQuoteReferencePrefix = `CCXT:${params.exchangeId}:POSITION_QUOTE:${params.accountId}:`;

  // Rebuild synthetic position reconciliation rows from scratch each run.
  await prisma.ledgerTransaction.deleteMany({
    where: {
      account_id: params.accountId,
      OR: [
        { external_reference: { startsWith: positionReferencePrefix } },
        { external_reference: { startsWith: legacyPositionQuoteReferencePrefix } },
      ],
    },
  });

  const ledgerRows = await prisma.ledgerTransaction.findMany({
    where: { account_id: params.accountId },
    select: {
      quantity: true,
      tx_type: true,
      external_reference: true,
      asset: {
        select: {
          symbol: true,
        },
      },
    },
  });

  const hedgeBaseSymbols = new Set<string>();
  for (const row of ledgerRows) {
    const symbol = row.asset.symbol.trim().toUpperCase();
    if (!symbol) {
      continue;
    }

    const externalReference = typeof row.external_reference === 'string' ? row.external_reference.trim() : '';
    const isLegacyHedgeWithoutReference = externalReference.length === 0 && !USD_LIKE_SYMBOLS.has(symbol);
    const isCcxtBaseLeg = externalReference.includes(':BASE');
    const isHedgeBaseLeg = row.tx_type === 'HEDGE' && (isCcxtBaseLeg || isLegacyHedgeWithoutReference);

    if (isHedgeBaseLeg) {
      hedgeBaseSymbols.add(symbol);
    }
  }

  const positionSymbols = new Set<string>([...targetBySymbol.keys(), ...hedgeBaseSymbols]);
  if (positionSymbols.size === 0) {
    return 0;
  }

  const ledgerBySymbol = new Map<string, number>();
  for (const row of ledgerRows) {
    const symbol = row.asset.symbol.trim().toUpperCase();
    if (!symbol || !positionSymbols.has(symbol)) {
      continue;
    }

    const quantity = Number(row.quantity);
    if (!Number.isFinite(quantity)) {
      continue;
    }

    ledgerBySymbol.set(symbol, (ledgerBySymbol.get(symbol) ?? 0) + quantity);
  }

  const symbolList = Array.from(positionSymbols);
  const assetMap = await ensureAssetsBySymbol(
    symbolList.map((symbol) => ({
      symbol,
      assetType: symbol === 'USD' ? 'CASH' : symbol === 'USDT' || symbol === 'USDC' ? 'STABLE' : 'CRYPTO',
    })),
  );

  const dateKey = formatDateKey(params.asOf);
  let reconciled = 0;

  for (const symbol of symbolList) {
    const assetId = assetMap.get(symbol);
    if (!assetId) {
      continue;
    }

    const targetQty = targetBySymbol.get(symbol) ?? 0;
    const ledgerQty = ledgerBySymbol.get(symbol) ?? 0;
    const delta = targetQty - ledgerQty;

    if (!Number.isFinite(delta) || Math.abs(delta) < epsilon) {
      continue;
    }

    await prisma.ledgerTransaction.create({
      data: {
        date_time: params.asOf,
        account_id: params.accountId,
        asset_id: assetId,
        quantity: String(delta),
        tx_type: 'HEDGE',
        external_reference: `${positionReferencePrefix}${symbol}:${dateKey}`,
        notes: `CCXT futures position reconcile ${symbol} ${dateKey}: exchange=${targetQty} ledger=${ledgerQty}`,
      },
    });
    reconciled += 1;
  }

  const futuresBalanceSnapshots: Array<{
    symbol: string;
    walletBalance: number;
    unrealizedPnl: number;
    marginBalance: number;
    availableBalance: number | null;
  }> = [];

  try {
    const futuresBalance = await params.exchange.fetchBalance({ type: 'future' });
    const rows = Array.isArray(futuresBalance?.info?.assets) ? futuresBalance.info.assets : [];

    for (const row of rows) {
      const symbol = String(row?.asset ?? '').trim().toUpperCase();
      if (!symbol) {
        continue;
      }

      const walletBalance = toFiniteNumber(row?.walletBalance) ?? 0;
      const unrealizedPnl = toFiniteNumber(row?.unrealizedProfit) ?? 0;
      const marginBalance = toFiniteNumber(row?.marginBalance) ?? walletBalance + unrealizedPnl;
      const availableBalance = toFiniteNumber(row?.availableBalance);

      if (
        Math.abs(walletBalance) < epsilon &&
        Math.abs(unrealizedPnl) < epsilon &&
        Math.abs(marginBalance) < epsilon
      ) {
        continue;
      }

      futuresBalanceSnapshots.push({
        symbol,
        walletBalance,
        unrealizedPnl,
        marginBalance,
        availableBalance: availableBalance !== null && Number.isFinite(availableBalance) ? availableBalance : null,
      });
    }
  } catch {
    // Best effort snapshot capture.
  }

  const positionSnapshots = Array.from(futuresSnapshotBySymbol.entries())
    .map(([symbol, stats]) => {
      const contractsAbs = Math.abs(stats.contracts);
      const entryPrice = contractsAbs > epsilon ? stats.entryNotionalAbs / contractsAbs : null;
      const markPrice = contractsAbs > epsilon ? stats.markNotionalAbs / contractsAbs : null;

      return {
        symbol,
        contracts: stats.contracts,
        unrealizedPnl: stats.unrealizedPnl,
        entryPrice,
        markPrice,
      };
    })
    .filter((item) => Math.abs(item.contracts) > epsilon || Math.abs(item.unrealizedPnl) > epsilon);

  const totalUnrealizedPnl = positionSnapshots.reduce((sum, item) => sum + item.unrealizedPnl, 0);

  const existingConnection = await prisma.ccxtConnection.findUnique({
    where: { account_id: params.accountId },
    select: { metadata_json: true },
  });

  let metadata: Record<string, unknown> = {};
  if (existingConnection?.metadata_json) {
    try {
      const parsed = JSON.parse(existingConnection.metadata_json);
      if (parsed && typeof parsed === 'object') {
        metadata = parsed as Record<string, unknown>;
      }
    } catch {
      metadata = {};
    }
  }

  metadata.futuresSnapshot = {
    asOf: params.asOf.toISOString(),
    exchangeId: params.exchangeId,
    positions: positionSnapshots,
    balances: futuresBalanceSnapshots,
    totalUnrealizedPnl,
  };

  await prisma.ccxtConnection.update({
    where: { account_id: params.accountId },
    data: {
      metadata_json: JSON.stringify(metadata),
    },
  });

  return reconciled;
}

async function reconcileCcxtBalances(params: {
  accountId: number;
  exchangeId: CcxtExchangeId;
  exchange: any;
  asOf: Date;
}): Promise<number> {
  let totalsBySymbol =
    params.exchangeId === 'binance'
      ? await fetchBinanceSpotWalletTotals(params.exchange)
      : extractBalanceTotals(await params.exchange.fetchBalance());

  if (params.exchangeId === 'binance') {
    const configuredTypes = (process.env.CCXT_BINANCE_BALANCE_TYPES ?? 'spot,future')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    for (const balanceType of configuredTypes) {
      if (balanceType === 'spot') {
        continue;
      }

      try {
        const typedBalance = await params.exchange.fetchBalance({ type: balanceType });
        const typedTotals =
          balanceType === 'future' || balanceType === 'futures'
            ? extractBinanceFuturesWalletTotals(typedBalance)
            : extractBalanceTotals(typedBalance);
        totalsBySymbol = addBalanceTotals(totalsBySymbol, typedTotals);
      } catch {
        // Best effort per wallet type.
      }
    }

    if (configuredTypes.includes('untyped')) {
      try {
        const fallbackBalance = await params.exchange.fetchBalance();
        const fallbackTotals = extractBalanceTotals(fallbackBalance);
        totalsBySymbol = addBalanceTotals(totalsBySymbol, fallbackTotals);
      } catch {
        // Keep typed balance results only.
      }
    }

    const minUsdValueRaw = Number(process.env.CCXT_BINANCE_MIN_USD_VALUE ?? '1');
    const minUsdValue = Number.isFinite(minUsdValueRaw) && minUsdValueRaw >= 0 ? minUsdValueRaw : 1;
    totalsBySymbol = await applyBinanceUsdThreshold({
      exchange: params.exchange,
      totalsBySymbol,
      minUsdValue,
    });
  }

  const reconciliationReferencePrefix = `CCXT:${params.exchangeId}:BALANCE:${params.accountId}:`;

  const ledgerRows = await prisma.ledgerTransaction.findMany({
    where: { account_id: params.accountId },
    select: {
      asset_id: true,
      tx_type: true,
      quantity: true,
      external_reference: true,
      asset: {
        select: {
          symbol: true,
        },
      },
    },
  });

  const positionReferencePrefix = `CCXT:${params.exchangeId}:POSITION:${params.accountId}:`;

  const hedgeAssetIds = new Set<number>();
  const hedgeSymbols = new Set<string>();

  for (const row of ledgerRows) {
    if (row.tx_type !== 'HEDGE') {
      continue;
    }

    const symbol = row.asset.symbol.trim().toUpperCase();
    const externalReference = typeof row.external_reference === 'string' ? row.external_reference.trim() : '';
    const isLegacyHedgeWithoutReference = externalReference.length === 0 && !USD_LIKE_SYMBOLS.has(symbol);
    const isDerivativeBaseHedge =
      isLegacyHedgeWithoutReference ||
      externalReference.includes(':BASE') ||
      externalReference.startsWith(positionReferencePrefix);

    if (!isDerivativeBaseHedge) {
      continue;
    }

    hedgeAssetIds.add(row.asset_id);
    if (symbol) {
      hedgeSymbols.add(symbol);
    }
  }

  if (hedgeAssetIds.size > 0) {
    await prisma.ledgerTransaction.deleteMany({
      where: {
        account_id: params.accountId,
        tx_type: 'RECONCILIATION',
        asset_id: { in: Array.from(hedgeAssetIds) },
        external_reference: { startsWith: reconciliationReferencePrefix },
      },
    });
  }

  const ledgerBySymbol = new Map<string, number>();
  for (const row of ledgerRows) {
    const symbol = row.asset.symbol.trim().toUpperCase();
    if (!symbol) continue;

    const isRemovedHedgeReconciliation =
      row.tx_type === 'RECONCILIATION' &&
      hedgeAssetIds.has(row.asset_id) &&
      typeof row.external_reference === 'string' &&
      row.external_reference.startsWith(reconciliationReferencePrefix);

    if (isRemovedHedgeReconciliation) {
      continue;
    }

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
    // Derivatives positions are represented by HEDGE transactions, not wallet balances.
    // Skip balance reconciliation for those assets so futures exposure remains visible.
    if (hedgeSymbols.has(symbol)) {
      continue;
    }

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

    const externalReference = `${reconciliationReferencePrefix}${symbol}:${dateKey}`;
    const notes = `CCXT balance reconcile ${symbol} ${dateKey}: exchange=${exchangeQty} ledger=${ledgerQty}`;

    const existing = await prisma.ledgerTransaction.findFirst({
      where: {
        account_id: params.accountId,
        external_reference: externalReference,
      },
      select: { id: true, quantity: true },
    });

    if (existing) {
      const existingQty = Number(existing.quantity);
      const adjustedQuantity = Number.isFinite(existingQty) ? existingQty + delta : delta;

      await prisma.ledgerTransaction.update({
        where: { id: existing.id },
        data: {
          date_time: params.asOf,
          quantity: String(adjustedQuantity),
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
  onProgress?: SyncProgressReporter;
}): Promise<{
  created: number;
  updated: number;
  reconciled: number;
  lastSyncAt: Date;
}> {
  const mode = params.mode ?? 'trades';
  const now = new Date();
  const onProgress = params.onProgress;

  const connection = await prisma.ccxtConnection.findUnique({
    where: { account_id: params.accountId },
  });

  if (!connection) {
    throw new Error('CCXT connection not found for account.');
  }

  const overlapMinutesRaw = Number(
    process.env.CCXT_SYNC_TRADE_OVERLAP_MINUTES ??
      process.env.CCXT_AUTO_TRADE_OVERLAP_MINUTES ??
      '15',
  );
  const overlapMinutes = Number.isFinite(overlapMinutesRaw) && overlapMinutesRaw >= 0
    ? overlapMinutesRaw
    : 15;

  const cursorSince = connection.last_trade_sync_at
    ? new Date(connection.last_trade_sync_at.getTime() - overlapMinutes * 60 * 1000)
    : null;

  const fallbackSince = (() => {
    const candidates: number[] = [];
    if (connection.sync_since) {
      candidates.push(connection.sync_since.getTime());
    }
    if (cursorSince) {
      candidates.push(cursorSince.getTime());
    }
    if (candidates.length === 0) {
      return undefined;
    }
    return new Date(Math.max(...candidates));
  })();

  const effectiveSince = params.since ?? fallbackSince;

  if (!isSupportedExchangeId(connection.exchange_id)) {
    throw new Error(`Unsupported exchange_id '${connection.exchange_id}'.`);
  }

  const exchangeId = connection.exchange_id as CcxtExchangeId;
  const connectionOptions = parseOptionsJson(connection.options_json);

  await reportProgress(onProgress, {
    stage: 'sync.init',
    message: `Starting ${exchangeId} ${mode} sync.`,
    exchangeId,
    mode,
    since: effectiveSince?.toISOString() ?? null,
  });

  const buildExchangeForSync = (params?: {
    defaultTypeOverride?: 'spot' | 'margin' | 'swap' | 'future' | 'delivery' | 'option';
    forceSpotWalletProfile?: boolean;
  }) => {
    const { defaultTypeOverride, forceSpotWalletProfile } = params ?? {};

    const options = (() => {
      if (forceSpotWalletProfile && exchangeId === 'binance') {
        return { defaultType: 'spot' as const };
      }

      if (defaultTypeOverride) {
        return {
          ...(connectionOptions ?? {}),
          defaultType: defaultTypeOverride,
        };
      }

      return connectionOptions;
    })();

    return buildCcxtExchange({
      exchangeId,
      credentials: {
        apiKey: connection.api_key_enc,
        secret: connection.api_secret_enc,
        passphrase: connection.passphrase_enc ?? undefined,
        encrypted: true,
      },
      sandbox: connection.sandbox,
      options,
    });
  };

  let created = 0;
  let reconciled = 0;
  let latestTradeCursor: { tradeId: string; timestamp: Date } | null = null;

  if (mode === 'trades' || mode === 'full') {
    type TradeSyncProfile = {
      defaultTypeOverride?: 'spot' | 'margin' | 'swap' | 'future' | 'delivery' | 'option';
      txType: TradeLedgerType;
      marketScope: TradeMarketScope;
      referenceScope?: string;
    };

    const tradeSyncProfiles: TradeSyncProfile[] =
      exchangeId === 'binance'
        ? (() => {
            const configuredTypes = (process.env.CCXT_BINANCE_TRADE_TYPES ?? 'spot,margin,future')
              .split(',')
              .map((value) => value.trim().toLowerCase())
              .filter(Boolean);

            const profiles: TradeSyncProfile[] = [];
            const seen = new Set<string>();
            const addProfile = (key: string, profile: TradeSyncProfile) => {
              if (seen.has(key)) {
                return;
              }
              seen.add(key);
              profiles.push(profile);
            };

            for (const configuredType of configuredTypes) {
              if (configuredType === 'spot') {
                addProfile('spot', { defaultTypeOverride: 'spot', txType: 'TRADE', marketScope: 'spotLike' });
                continue;
              }

              if (configuredType === 'margin') {
                addProfile('margin', { defaultTypeOverride: 'margin', txType: 'TRADE', marketScope: 'spotLike' });
                continue;
              }

              if (configuredType === 'future' || configuredType === 'futures') {
                addProfile('future', { defaultTypeOverride: 'future', txType: 'HEDGE', marketScope: 'derivatives', referenceScope: 'FUTURE' });
                continue;
              }

              if (configuredType === 'delivery') {
                addProfile('delivery', { defaultTypeOverride: 'delivery', txType: 'HEDGE', marketScope: 'derivatives', referenceScope: 'DELIVERY' });
                continue;
              }

              if (configuredType === 'swap') {
                addProfile('swap', { defaultTypeOverride: 'swap', txType: 'HEDGE', marketScope: 'derivatives', referenceScope: 'SWAP' });
              }
            }

            if (profiles.length === 0) {
              return [{ defaultTypeOverride: 'spot', txType: 'TRADE', marketScope: 'spotLike' }];
            }

            return profiles;
          })()
        : [{ txType: 'TRADE', marketScope: 'all' }];

    const fetchedTrades: Array<{ trade: any; profile: TradeSyncProfile }> = [];

    for (let profileIndex = 0; profileIndex < tradeSyncProfiles.length; profileIndex += 1) {
      const profile = tradeSyncProfiles[profileIndex];

      await reportProgress(onProgress, {
        stage: 'trades.profile.start',
        profile: profile.defaultTypeOverride ?? profile.marketScope,
        profileIndex: profileIndex + 1,
        profileCount: tradeSyncProfiles.length,
      });

      const exchange = buildExchangeForSync({
        ...(profile.defaultTypeOverride ? { defaultTypeOverride: profile.defaultTypeOverride } : {}),
      });

      await initializeCcxtExchange(exchange);
      await exchange.loadMarkets();

      await reportProgress(onProgress, {
        stage: 'trades.profile.markets_loaded',
        profile: profile.defaultTypeOverride ?? profile.marketScope,
        profileIndex: profileIndex + 1,
        marketCount: Object.keys(exchange.markets ?? {}).length,
      });

      const trades = await fetchTradesForSync({
        exchange,
        exchangeId,
        since: effectiveSince,
        marketScope: profile.marketScope,
        onProgress,
      });

      fetchedTrades.push(...trades.map((trade) => ({ trade, profile })));

      await reportProgress(onProgress, {
        stage: 'trades.profile.complete',
        profile: profile.defaultTypeOverride ?? profile.marketScope,
        profileIndex: profileIndex + 1,
        fetchedTrades: trades.length,
      });
    }

    const normalized = fetchedTrades
      .map(({ trade, profile }) => parseTrade({
        trade,
        exchangeId,
        txType: profile.txType,
        referenceScope: profile.referenceScope,
      }))
      .filter((trade): trade is NormalizedCcxtTrade => Boolean(trade));

    const seenTradeKeys = new Set<string>();
    const deduped = normalized.filter((trade) => {
      const key = `${trade.exchangeId}:${trade.referenceScope ?? 'SPOT'}:${trade.tradeId}:${trade.symbol}:${trade.timestamp.toISOString()}:${trade.side}:${trade.amount}:${trade.txType}`;
      if (seenTradeKeys.has(key)) return false;
      seenTradeKeys.add(key);
      return true;
    });

    await reportProgress(onProgress, {
      stage: 'trades.normalize',
      normalized: normalized.length,
      deduped: deduped.length,
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

    await reportProgress(onProgress, {
      stage: 'trades.persist.start',
      candidateRows: candidateRows.length,
    });

    if (candidateRows.length) {
      const refs = candidateRows.map((row) => row.external_reference);
      const existingRows = await prisma.ledgerTransaction.findMany({
        where: {
          account_id: params.accountId,
          external_reference: { in: refs },
        },
        select: { external_reference: true },
      });

      const existingRefs = new Set(
        existingRows
          .map((row) => row.external_reference)
          .filter((value): value is string => Boolean(value)),
      );

      const rowsToCreate = candidateRows.filter((row) => !existingRefs.has(row.external_reference));

      if (rowsToCreate.length > 0) {
        const result = await prisma.ledgerTransaction.createMany({
          data: rowsToCreate,
        });
        created += result.count;
      }
    }

    await reportProgress(onProgress, {
      stage: 'trades.persist.complete',
      created,
      candidateRows: candidateRows.length,
    });

    const movementExchange =
      exchangeId === 'binance'
        ? buildExchangeForSync({ defaultTypeOverride: 'spot' })
        : buildExchangeForSync();
    await initializeCcxtExchange(movementExchange);

    const movements = await fetchMovementsForSync({
      exchange: movementExchange,
      exchangeId,
      since: effectiveSince,
      onProgress,
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

      await reportProgress(onProgress, {
        stage: 'movements.persist.start',
        candidateRows: movementRows.length,
      });

      if (movementRows.length > 0) {
        const movementRefs = movementRows.map((row) => row.external_reference);
        const existingMovementRows = await prisma.ledgerTransaction.findMany({
          where: {
            account_id: params.accountId,
            external_reference: { in: movementRefs },
          },
          select: { external_reference: true },
        });

        const existingMovementRefs = new Set(
          existingMovementRows
            .map((row) => row.external_reference)
            .filter((value): value is string => Boolean(value)),
        );

        const movementRowsToCreate = movementRows.filter((row) => !existingMovementRefs.has(row.external_reference));

        if (movementRowsToCreate.length > 0) {
          const movementResult = await prisma.ledgerTransaction.createMany({
            data: movementRowsToCreate,
          });
          created += movementResult.count;
        }
      }

      await reportProgress(onProgress, {
        stage: 'movements.persist.complete',
        created,
        candidateRows: movementRows.length,
      });
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
    await reportProgress(onProgress, {
      stage: 'balances.reconcile.start',
      message: 'Reconciling balances.',
    });

    if (exchangeId === 'binance' || exchangeId === 'bybit') {
      const futuresExchange =
        exchangeId === 'binance'
          ? buildExchangeForSync({ defaultTypeOverride: 'future' })
          : buildExchangeForSync({ defaultTypeOverride: 'swap' });

      await initializeCcxtExchange(futuresExchange);
      reconciled += await reconcileCcxtFuturesPositions({
        accountId: params.accountId,
        exchangeId,
        exchange: futuresExchange,
        asOf: now,
      });
    }

    const balanceExchange =
      exchangeId === 'binance'
        ? buildExchangeForSync({ forceSpotWalletProfile: true })
        : buildExchangeForSync();
    await initializeCcxtExchange(balanceExchange);
    reconciled += await reconcileCcxtBalances({
      accountId: params.accountId,
      exchangeId,
      exchange: balanceExchange,
      asOf: now,
    });

    await reportProgress(onProgress, {
      stage: 'balances.reconcile.complete',
      reconciled,
    });
  }

  await updateAssetStatusesForAccount(params.accountId);

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

  await reportProgress(onProgress, {
    stage: 'sync.complete',
    message: 'Sync completed successfully.',
    created,
    reconciled,
    lastSyncAt: now.toISOString(),
  });

  return {
    created,
    updated: 0,
    reconciled,
    lastSyncAt: now,
  };
}