import ccxt from 'ccxt';
import { decrypt } from '@/lib/crypto';

export type CcxtExchangeId = 'binance' | 'bybit';

export type CcxtClientOptions = {
  defaultType?: 'spot' | 'swap' | 'future' | 'margin' | 'delivery' | 'option';
  defaultSubType?: 'linear' | 'inverse';
  defaultSettle?: 'USDT' | 'USDC';
};

export type CcxtClientCredentials = {
  apiKey: string;
  secret: string;
  passphrase?: string;
  encrypted?: boolean;
};

function getDefaultType(exchangeId: CcxtExchangeId): CcxtClientOptions['defaultType'] {
  if (exchangeId === 'binance') {
    const fromEnv = process.env.CCXT_BINANCE_DEFAULT_TYPE?.trim().toLowerCase();
    return (fromEnv as CcxtClientOptions['defaultType']) || 'spot';
  }

  const bybitFromEnv = process.env.CCXT_BYBIT_DEFAULT_TYPE?.trim().toLowerCase();
  return (bybitFromEnv as CcxtClientOptions['defaultType']) || 'spot';
}

function getDefaults(exchangeId: CcxtExchangeId): CcxtClientOptions {
  if (exchangeId === 'bybit') {
    return {
      defaultType: getDefaultType(exchangeId),
      defaultSubType: 'linear',
    };
  }

  return {
    defaultType: getDefaultType(exchangeId),
  };
}

function normalizeProxyUrl(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;

  if (/^[a-z]+:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `http://${trimmed}`;
}

export function resolveCcxtProxyUrl(exchangeId: CcxtExchangeId): string | undefined {
  const host = process.env.CCXT_PROXY_HOST?.trim();
  const port = process.env.CCXT_PROXY_PORT?.trim();

  const exchangeSpecificProxy =
    exchangeId === 'binance'
      ? normalizeProxyUrl(process.env.CCXT_BINANCE_PROXY_URL) ??
        normalizeProxyUrl(process.env.CCXT_BINANCE_HTTPS_PROXY) ??
        normalizeProxyUrl(process.env.CCXT_BINANCE_HTTP_PROXY)
      : normalizeProxyUrl(process.env.CCXT_BYBIT_PROXY_URL) ??
        normalizeProxyUrl(process.env.CCXT_BYBIT_HTTPS_PROXY) ??
        normalizeProxyUrl(process.env.CCXT_BYBIT_HTTP_PROXY);

  const cexProxy =
    normalizeProxyUrl(process.env.CCXT_CEX_PROXY_URL) ??
    normalizeProxyUrl(process.env.CCXT_CEX_HTTPS_PROXY) ??
    normalizeProxyUrl(process.env.CCXT_CEX_HTTP_PROXY);

  return (
    exchangeSpecificProxy ??
    cexProxy ??
    normalizeProxyUrl(process.env.CCXT_PROXY_URL) ??
    normalizeProxyUrl(process.env.CCXT_HTTPS_PROXY) ??
    normalizeProxyUrl(process.env.CCXT_HTTP_PROXY) ??
    (host && port ? `http://${host}:${port}` : undefined)
  );
}

function installProxyFetchImplementation(exchange: any, proxyUrl: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeFetchModule = require('node-fetch');
    const fetchImplementation = (nodeFetchModule.default ?? nodeFetchModule) as (
      url: string,
      options?: Record<string, unknown>,
    ) => Promise<any>;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { HttpsProxyAgent } = require('https-proxy-agent');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { HttpProxyAgent } = require('http-proxy-agent');

    const httpsAgent = new HttpsProxyAgent(proxyUrl);
    const httpAgent = new HttpProxyAgent(proxyUrl);

    exchange.fetchImplementation = (url: string, options?: Record<string, unknown>) => {
      const targetUrl = typeof url === 'string' ? url : String(url);
      const isHttps = targetUrl.startsWith('https://');
      const agent = isHttps ? httpsAgent : httpAgent;
      return fetchImplementation(targetUrl, {
        ...(options ?? {}),
        agent,
      });
    };
  } catch {
    // Fall back to CCXT default fetch behavior.
  }
}

export function parseOptionsJson(optionsJson: string | null): CcxtClientOptions | undefined {
  if (!optionsJson) return undefined;

  try {
    const parsed = JSON.parse(optionsJson) as CcxtClientOptions;
    return parsed;
  } catch {
    return undefined;
  }
}

export function serializeOptions(options: CcxtClientOptions | undefined): string | null {
  if (!options) return null;
  return JSON.stringify(options);
}

export function buildCcxtExchange(params: {
  exchangeId: CcxtExchangeId;
  credentials: CcxtClientCredentials;
  sandbox?: boolean;
  options?: CcxtClientOptions;
}): any {
  const { exchangeId, credentials } = params;

  const apiKey = credentials.encrypted ? decrypt(credentials.apiKey) : credentials.apiKey;
  const secret = credentials.encrypted ? decrypt(credentials.secret) : credentials.secret;
  const passphraseRaw = credentials.passphrase;
  const passphrase = passphraseRaw
    ? credentials.encrypted
      ? decrypt(passphraseRaw)
      : passphraseRaw
    : undefined;

  const mergedOptions: CcxtClientOptions = {
    ...getDefaults(exchangeId),
    ...(params.options ?? {}),
  };

  const ExchangeClass = ccxt[exchangeId] as unknown as new (options: Record<string, unknown>) => any;

  if (!ExchangeClass) {
    throw new Error(`Unsupported exchange: ${exchangeId}`);
  }

  const proxyUrl = resolveCcxtProxyUrl(exchangeId);

  const exchange = new ExchangeClass({
    apiKey,
    secret,
    ...(passphrase ? { password: passphrase } : {}),
    enableRateLimit: true,
    options: {
      ...(mergedOptions.defaultType ? { defaultType: mergedOptions.defaultType } : {}),
      ...(mergedOptions.defaultSubType ? { defaultSubType: mergedOptions.defaultSubType } : {}),
      ...(mergedOptions.defaultSettle ? { defaultSettle: mergedOptions.defaultSettle } : {}),
    },
  });

  if (proxyUrl) {
    // CCXT allows only one proxy setting at a time.
    // Callback mode is most reliable in Next.js/node runtime.
    exchange.httpProxy = undefined;
    exchange.httpsProxy = undefined;
    exchange.socksProxy = undefined;
    exchange.httpProxyCallback = undefined;
    exchange.httpsProxyCallback = () => proxyUrl;
    exchange.socksProxyCallback = undefined;

    // Force node-fetch + proxy agents. This avoids runtime-specific fetch behavior
    // in Next.js that can bypass CCXT proxy settings.
    installProxyFetchImplementation(exchange, proxyUrl);
  }

  if (params.sandbox || process.env.CCXT_SANDBOX_MODE === 'true') {
    exchange.setSandboxMode(true);
  }

  return exchange;
}

export async function initializeCcxtExchange(exchange: any): Promise<void> {
  if (typeof exchange?.loadProxyModules === 'function') {
    await exchange.loadProxyModules();
  }

  if (typeof exchange?.setProxyAgents === 'function') {
    exchange.setProxyAgents();
  }
}

export async function testConnection(params: {
  exchangeId: CcxtExchangeId;
  credentials: CcxtClientCredentials;
  sandbox?: boolean;
  options?: CcxtClientOptions;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const exchange = buildCcxtExchange(params);
    await initializeCcxtExchange(exchange);
    await exchange.loadMarkets();
    await exchange.fetchBalance();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}