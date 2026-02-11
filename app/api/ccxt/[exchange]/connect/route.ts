import { NextResponse } from 'next/server';
import ccxt from 'ccxt';
import { prisma } from '@/lib/db';
import { decrypt, encrypt } from '@/lib/crypto';
import {
  resolveCcxtProxyUrl,
  serializeOptions,
  testConnection,
  type CcxtClientOptions,
  type CcxtExchangeId,
} from '@/lib/ccxt/client';
import { isMissingSyncSinceColumnError, parseIsoInstant } from '@/lib/datetime';

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
  syncSince?: string;
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
    const syncSince = body?.syncSince ? parseIsoInstant(body.syncSince) : undefined;

    if (!accountId || !Number.isFinite(accountId) || accountId <= 0) {
      return NextResponse.json({ error: 'accountId is required.' }, { status: 400 });
    }

    if (body?.syncSince && !syncSince) {
      return NextResponse.json(
        { error: 'Invalid syncSince date. Use ISO 8601 with timezone (UTC recommended).' },
        { status: 400 },
      );
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

    const existingConnection = await prisma.ccxtConnection.findUnique({
      where: { account_id: accountId },
      select: {
        api_key_enc: true,
        api_secret_enc: true,
        passphrase_enc: true,
      },
    });

    const effectiveApiKeyEnc = apiKey ? encrypt(apiKey) : existingConnection?.api_key_enc;
    const effectiveSecretEnc = secret ? encrypt(secret) : existingConnection?.api_secret_enc;
    const effectivePassphraseEnc = passphrase
      ? encrypt(passphrase)
      : existingConnection?.passphrase_enc ?? null;

    if (!effectiveApiKeyEnc || !effectiveSecretEnc) {
      return NextResponse.json(
        { error: 'apiKey and secret are required for first-time connection setup.' },
        { status: 400 },
      );
    }

    const optionsJson = serializeOptions(body?.options);

    const shouldVerify = body?.verify !== false;

    if (shouldVerify) {
      const verification = await testConnection({
        exchangeId: exchange,
        credentials:
          apiKey && secret
            ? {
                apiKey,
                secret,
                passphrase:
                  passphrase ??
                  (existingConnection?.passphrase_enc ? decrypt(existingConnection.passphrase_enc) : undefined),
                encrypted: false,
              }
            : {
                apiKey: effectiveApiKeyEnc,
                secret: effectiveSecretEnc,
                passphrase: effectivePassphraseEnc ?? undefined,
                encrypted: true,
              },
        sandbox,
        options: body?.options,
      });

      if (!verification.success) {
        await prisma.ccxtConnection.upsert({
          where: { account_id: accountId },
          update: {
            exchange_id: exchange,
            api_key_enc: effectiveApiKeyEnc,
            api_secret_enc: effectiveSecretEnc,
            passphrase_enc: effectivePassphraseEnc,
            options_json: optionsJson,
            sandbox,
            sync_since: syncSince,
            status: 'ERROR',
            metadata_json: JSON.stringify({
              lastError: verification.error ?? 'Authentication failed',
              failedAt: new Date().toISOString(),
            }),
          },
          create: {
            account_id: accountId,
            exchange_id: exchange,
            api_key_enc: effectiveApiKeyEnc,
            api_secret_enc: effectiveSecretEnc,
            passphrase_enc: effectivePassphraseEnc,
            options_json: optionsJson,
            sandbox,
            sync_since: syncSince,
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
        api_key_enc: effectiveApiKeyEnc,
        api_secret_enc: effectiveSecretEnc,
        passphrase_enc: effectivePassphraseEnc,
        options_json: optionsJson,
        sandbox,
        sync_since: syncSince,
        status: 'ACTIVE',
        metadata_json: null,
      },
      create: {
        account_id: accountId,
        exchange_id: exchange,
        api_key_enc: effectiveApiKeyEnc,
        api_secret_enc: effectiveSecretEnc,
        passphrase_enc: effectivePassphraseEnc,
        options_json: optionsJson,
        sandbox,
        sync_since: syncSince,
        status: 'ACTIVE',
      },
      select: {
        account_id: true,
        exchange_id: true,
        status: true,
        options_json: true,
        sandbox: true,
        sync_since: true,
        last_sync_at: true,
        updated_at: true,
      },
    });

    return NextResponse.json({
      ok: true,
      connection,
    });
  } catch (error) {
    if (isMissingSyncSinceColumnError(error)) {
      return NextResponse.json(
        { error: 'Database migration required: run Prisma migrations before using sync_since fields.' },
        { status: 503 },
      );
    }

    const message =
      error instanceof ccxt.AuthenticationError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Failed to connect exchange.';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
