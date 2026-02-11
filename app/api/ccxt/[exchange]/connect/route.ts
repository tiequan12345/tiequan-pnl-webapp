import { NextResponse } from 'next/server';
import ccxt from 'ccxt';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import {
  resolveCcxtProxyUrl,
  serializeOptions,
  testConnection,
  type CcxtClientOptions,
  type CcxtExchangeId,
} from '@/lib/ccxt/client';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ exchange: string }>;
};

type ConnectPayload = {
  accountId?: number;
  apiKey?: string;
  secret?: string;
  passphrase?: string;
  sandbox?: boolean;
  options?: CcxtClientOptions;
  verify?: boolean;
};

function isSupportedExchange(value: string): value is CcxtExchangeId {
  return value === 'binance' || value === 'bybit';
}

function expectedAccountType(exchange: CcxtExchangeId): 'BINANCE' | 'BYBIT' {
  return exchange === 'binance' ? 'BINANCE' : 'BYBIT';
}

function resolveProxyDebug(exchange: CcxtExchangeId): string | null {
  return resolveCcxtProxyUrl(exchange) ?? null;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { exchange } = await context.params;

    if (!isSupportedExchange(exchange)) {
      return NextResponse.json({ error: 'Unsupported exchange.' }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as ConnectPayload | null;

    const accountId = body?.accountId;
    const apiKey = body?.apiKey?.trim();
    const secret = body?.secret?.trim();
    const passphrase = body?.passphrase?.trim() || undefined;
    const sandbox = Boolean(body?.sandbox);

    if (!accountId || !Number.isFinite(accountId) || accountId <= 0) {
      return NextResponse.json({ error: 'accountId is required.' }, { status: 400 });
    }

    if (!apiKey || !secret) {
      return NextResponse.json({ error: 'apiKey and secret are required.' }, { status: 400 });
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, account_type: true },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    const expectedType = expectedAccountType(exchange);
    if (account.account_type !== expectedType) {
      return NextResponse.json(
        {
          error: `Account type mismatch. Route '${exchange}' requires account_type='${expectedType}'.`,
        },
        { status: 400 },
      );
    }

    const optionsJson = serializeOptions(body?.options);

    const shouldVerify = body?.verify !== false;

    if (shouldVerify) {
      const verification = await testConnection({
        exchangeId: exchange,
        credentials: {
          apiKey,
          secret,
          passphrase,
          encrypted: false,
        },
        sandbox,
        options: body?.options,
      });

      if (!verification.success) {
        await prisma.ccxtConnection.upsert({
          where: { account_id: accountId },
          update: {
            exchange_id: exchange,
            api_key_enc: encrypt(apiKey),
            api_secret_enc: encrypt(secret),
            passphrase_enc: passphrase ? encrypt(passphrase) : null,
            options_json: optionsJson,
            sandbox,
            status: 'ERROR',
            metadata_json: JSON.stringify({
              lastError: verification.error ?? 'Authentication failed',
              failedAt: new Date().toISOString(),
            }),
          },
          create: {
            account_id: accountId,
            exchange_id: exchange,
            api_key_enc: encrypt(apiKey),
            api_secret_enc: encrypt(secret),
            passphrase_enc: passphrase ? encrypt(passphrase) : null,
            options_json: optionsJson,
            sandbox,
            status: 'ERROR',
            metadata_json: JSON.stringify({
              lastError: verification.error ?? 'Authentication failed',
              failedAt: new Date().toISOString(),
            }),
          },
        });

        return NextResponse.json(
          {
            error: verification.error ?? 'Failed to authenticate with exchange credentials.',
            debug: {
              exchange,
              proxyConfigured: Boolean(resolveProxyDebug(exchange)),
              proxy: resolveProxyDebug(exchange),
              verifyDefaultType: body?.options?.defaultType ?? null,
            },
          },
          { status: 400 },
        );
      }
    }

    const connection = await prisma.ccxtConnection.upsert({
      where: { account_id: accountId },
      update: {
        exchange_id: exchange,
        api_key_enc: encrypt(apiKey),
        api_secret_enc: encrypt(secret),
        passphrase_enc: passphrase ? encrypt(passphrase) : null,
        options_json: optionsJson,
        sandbox,
        status: 'ACTIVE',
        metadata_json: null,
      },
      create: {
        account_id: accountId,
        exchange_id: exchange,
        api_key_enc: encrypt(apiKey),
        api_secret_enc: encrypt(secret),
        passphrase_enc: passphrase ? encrypt(passphrase) : null,
        options_json: optionsJson,
        sandbox,
        status: 'ACTIVE',
      },
      select: {
        account_id: true,
        exchange_id: true,
        status: true,
        options_json: true,
        sandbox: true,
        last_sync_at: true,
        updated_at: true,
      },
    });

    return NextResponse.json({
      ok: true,
      connection,
    });
  } catch (error) {
    const message =
      error instanceof ccxt.AuthenticationError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Failed to connect exchange.';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
