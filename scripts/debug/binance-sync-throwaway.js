#!/usr/bin/env node

/**
 * THROWAWAY debugging script for Binance CCXT sync behavior.
 *
 * Purpose:
 * - Compare unified CCXT fetchMyTrades behavior across market profiles
 * - Probe raw Binance user-trade endpoints for derivatives
 * - Help explain why full sync may only reconcile balances but not add trade rows
 *
 * Usage:
 *   node scripts/debug/binance-sync-throwaway.js --account 44
 *   node scripts/debug/binance-sync-throwaway.js --account 44 --sinceDays 7 --quote USDT --maxTargets 80
 *   node scripts/debug/binance-sync-throwaway.js --account 44 --profiles spot,margin,future,swap
 */

const path = require('path');
const crypto = require('crypto');
const ccxt = require('ccxt');
const { PrismaClient } = require('@prisma/client');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.local') });

const prisma = new PrismaClient();

function getArg(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  const value = process.argv[idx + 1];
  return value === undefined ? fallback : value;
}

function normalizeProxyUrl(raw) {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return undefined;
  if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

function resolveBinanceProxyUrl() {
  const host = process.env.CCXT_PROXY_HOST?.trim();
  const port = process.env.CCXT_PROXY_PORT?.trim();

  return (
    normalizeProxyUrl(process.env.CCXT_BINANCE_PROXY_URL) ??
    normalizeProxyUrl(process.env.CCXT_BINANCE_HTTPS_PROXY) ??
    normalizeProxyUrl(process.env.CCXT_BINANCE_HTTP_PROXY) ??
    normalizeProxyUrl(process.env.CCXT_CEX_PROXY_URL) ??
    normalizeProxyUrl(process.env.CCXT_CEX_HTTPS_PROXY) ??
    normalizeProxyUrl(process.env.CCXT_CEX_HTTP_PROXY) ??
    normalizeProxyUrl(process.env.CCXT_PROXY_URL) ??
    normalizeProxyUrl(process.env.CCXT_HTTPS_PROXY) ??
    normalizeProxyUrl(process.env.CCXT_HTTP_PROXY) ??
    (host && port ? `http://${host}:${port}` : undefined)
  );
}

function decrypt(cipherText) {
  const value = String(cipherText ?? '').trim();
  if (!value) return '';

  const encryptionKey = process.env.APP_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error('APP_ENCRYPTION_KEY is required to decrypt CCXT credentials.');
  }

  const key = crypto.pbkdf2Sync(encryptionKey, 'tiequan-salt', 100000, 32, 'sha256');
  const [ivHex, authTagHex, encryptedHex] = value.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Encrypted credential format is invalid.');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return decipher.update(encryptedHex, 'hex', 'utf8') + decipher.final('utf8');
}

function parseProfiles(raw) {
  return String(raw ?? 'spot,margin,future')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeDefaultType(profile) {
  if (profile === 'futures') return 'future';
  return profile;
}

function isDerivativesProfile(profile) {
  return profile === 'future' || profile === 'futures' || profile === 'swap' || profile === 'delivery';
}

function marketMatchesQuote(market, quote) {
  return String(market?.quote ?? '').trim().toUpperCase() === quote;
}

function buildTargetMarkets(marketsBySymbol, params) {
  const { quote, derivativesOnly, maxTargets } = params;
  const rows = Object.values(marketsBySymbol ?? {})
    .filter(Boolean)
    .filter((market) => marketMatchesQuote(market, quote))
    .filter((market) => (derivativesOnly ? Boolean(market.contract) : !market.contract))
    .sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));

  return rows.slice(0, maxTargets);
}

async function runUnifiedTradeProbe(exchange, params) {
  const {
    sinceTs,
    quote,
    derivativesOnly,
    maxTargets,
    perSymbolLimit,
  } = params;

  const summary = {
    unscoped: { ok: true, count: 0, error: null },
    symbolProbe: {
      targetCount: 0,
      testedCount: 0,
      nonEmptySymbols: 0,
      totalTradesReturned: 0,
      errorCount: 0,
      hitSamples: [],
      errorSamples: [],
    },
  };

  try {
    const unscoped = await exchange.fetchMyTrades(undefined, sinceTs, perSymbolLimit);
    summary.unscoped.count = Array.isArray(unscoped) ? unscoped.length : 0;
  } catch (error) {
    summary.unscoped.ok = false;
    summary.unscoped.error = error instanceof Error ? error.message : String(error);
  }

  const targets = buildTargetMarkets(exchange.markets, {
    quote,
    derivativesOnly,
    maxTargets,
  });

  summary.symbolProbe.targetCount = targets.length;

  for (const market of targets) {
    summary.symbolProbe.testedCount += 1;
    try {
      const result = await exchange.fetchMyTrades(market.symbol, sinceTs, perSymbolLimit);
      const count = Array.isArray(result) ? result.length : 0;
      summary.symbolProbe.totalTradesReturned += count;
      if (count > 0) {
        summary.symbolProbe.nonEmptySymbols += 1;
        if (summary.symbolProbe.hitSamples.length < 8) {
          const first = result[0] ?? {};
          summary.symbolProbe.hitSamples.push({
            symbol: market.symbol,
            marketId: market.id,
            count,
            firstTrade: {
              id: first.id ?? null,
              side: first.side ?? null,
              amount: first.amount ?? null,
              price: first.price ?? null,
              timestamp: first.timestamp ?? null,
            },
          });
        }
      }
    } catch (error) {
      summary.symbolProbe.errorCount += 1;
      if (summary.symbolProbe.errorSamples.length < 8) {
        summary.symbolProbe.errorSamples.push({
          symbol: market.symbol,
          marketId: market.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return summary;
}

async function runRawDerivativesProbe(exchange, params) {
  const {
    sinceTs,
    quote,
    maxTargets,
  } = params;

  const supportsFapi = typeof exchange.fapiPrivateGetUserTrades === 'function';
  const supportsDapi = typeof exchange.dapiPrivateGetUserTrades === 'function';

  const targets = buildTargetMarkets(exchange.markets, {
    quote,
    derivativesOnly: true,
    maxTargets,
  });

  const out = {
    supportsFapi,
    supportsDapi,
    targetCount: targets.length,
    testedCount: 0,
    nonEmptySymbols: 0,
    totalTradesReturned: 0,
    errorCount: 0,
    hitSamples: [],
    errorSamples: [],
  };

  for (const market of targets) {
    out.testedCount += 1;

    const id = String(market.id ?? '').trim().toUpperCase();
    if (!id) {
      continue;
    }

    const isLinear = Boolean(market.linear);
    const isInverse = Boolean(market.inverse);

    const useFapi = isLinear && supportsFapi;
    const useDapi = isInverse && supportsDapi;

    if (!useFapi && !useDapi) {
      continue;
    }

    try {
      const rows = useFapi
        ? await exchange.fapiPrivateGetUserTrades({ symbol: id, startTime: sinceTs, limit: 1000 })
        : await exchange.dapiPrivateGetUserTrades({ symbol: id, startTime: sinceTs, limit: 1000 });

      const count = Array.isArray(rows) ? rows.length : 0;
      out.totalTradesReturned += count;
      if (count > 0) {
        out.nonEmptySymbols += 1;
        if (out.hitSamples.length < 8) {
          const first = rows[0] ?? {};
          out.hitSamples.push({
            symbol: market.symbol,
            marketId: id,
            api: useFapi ? 'fapiPrivateGetUserTrades' : 'dapiPrivateGetUserTrades',
            count,
            firstTrade: {
              id: first.id ?? first.orderId ?? null,
              side: first.side ?? null,
              qty: first.qty ?? null,
              price: first.price ?? null,
              time: first.time ?? null,
            },
          });
        }
      }
    } catch (error) {
      out.errorCount += 1;
      if (out.errorSamples.length < 8) {
        out.errorSamples.push({
          symbol: market.symbol,
          marketId: id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return out;
}

async function main() {
  const accountId = Number(getArg('--account', NaN));
  if (!Number.isFinite(accountId) || accountId <= 0) {
    throw new Error('Missing required --account <id> argument.');
  }

  const sinceDays = Number(getArg('--sinceDays', '7'));
  const quote = String(getArg('--quote', 'USDT')).trim().toUpperCase() || 'USDT';
  const maxTargets = Math.max(1, Number(getArg('--maxTargets', '120')));
  const perSymbolLimit = Math.max(1, Number(getArg('--perSymbolLimit', '100')));
  const profiles = parseProfiles(getArg('--profiles', process.env.CCXT_BINANCE_TRADE_TYPES ?? 'spot,margin,future'));

  const sinceTs = Date.now() - Math.max(1, sinceDays) * 24 * 60 * 60 * 1000;

  const connection = await prisma.ccxtConnection.findUnique({
    where: { account_id: accountId },
    select: {
      exchange_id: true,
      api_key_enc: true,
      api_secret_enc: true,
      passphrase_enc: true,
      sandbox: true,
    },
  });

  if (!connection) {
    throw new Error(`No CCXT connection found for account ${accountId}.`);
  }

  if (connection.exchange_id !== 'binance') {
    throw new Error(`Account ${accountId} is not a Binance CCXT connection.`);
  }

  const apiKey = decrypt(connection.api_key_enc);
  const secret = decrypt(connection.api_secret_enc);
  const passphrase = connection.passphrase_enc ? decrypt(connection.passphrase_enc) : undefined;
  const proxyUrl = resolveBinanceProxyUrl();

  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      accountId,
      quote,
      sinceDays,
      sinceIso: new Date(sinceTs).toISOString(),
      maxTargets,
      perSymbolLimit,
      profiles,
      hasProxy: Boolean(proxyUrl),
      sandbox: Boolean(connection.sandbox),
    },
    profiles: [],
  };

  for (const profile of profiles) {
    const defaultType = normalizeDefaultType(profile);
    const derivativesOnly = isDerivativesProfile(profile);

    const exchange = new ccxt.binance({
      apiKey,
      secret,
      ...(passphrase ? { password: passphrase } : {}),
      enableRateLimit: true,
      options: {
        defaultType,
      },
    });

    if (proxyUrl) {
      exchange.httpsProxyCallback = () => proxyUrl;
    }

    if (connection.sandbox) {
      exchange.setSandboxMode(true);
    }

    const profileReport = {
      profile,
      defaultType,
      derivativesOnly,
      loadMarkets: { ok: true, marketCount: 0, error: null },
      unified: null,
      rawDerivatives: null,
    };

    try {
      await exchange.loadMarkets();
      profileReport.loadMarkets.marketCount = Object.keys(exchange.markets ?? {}).length;

      profileReport.unified = await runUnifiedTradeProbe(exchange, {
        sinceTs,
        quote,
        derivativesOnly,
        maxTargets,
        perSymbolLimit,
      });

      if (derivativesOnly) {
        profileReport.rawDerivatives = await runRawDerivativesProbe(exchange, {
          sinceTs,
          quote,
          maxTargets,
        });
      }
    } catch (error) {
      profileReport.loadMarkets.ok = false;
      profileReport.loadMarkets.error = error instanceof Error ? error.message : String(error);
    } finally {
      try {
        await exchange.close();
      } catch {
        // no-op
      }
    }

    report.profiles.push(profileReport);
  }

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
