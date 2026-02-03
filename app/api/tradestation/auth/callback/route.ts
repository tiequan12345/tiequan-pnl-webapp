import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exchangeAuthCode, fetchBrokerageAccounts } from '@/lib/tradestation/client';

const OAUTH_STATE_COOKIE = 'ts_oauth_state';

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  const withPadding = padded + '='.repeat(padLength);
  return Buffer.from(withPadding, 'base64').toString('utf8');
}

type StatePayload = {
  accountId: number;
  nonce: string;
  createdAt: number;
};

export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');
  if (error) {
    return NextResponse.json(
      { error, error_description: errorDescription },
      { status: 400 },
    );
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return NextResponse.json(
      { error: 'Missing code/state.' },
      { status: 400 },
    );
  }

  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!expectedState || expectedState !== state) {
    return NextResponse.json(
      { error: 'Invalid OAuth state.' },
      { status: 400 },
    );
  }

  let payload: StatePayload | null = null;
  try {
    payload = JSON.parse(base64UrlDecode(state)) as StatePayload;
  } catch {
    payload = null;
  }

  const accountId = payload?.accountId;
  if (!accountId || !Number.isFinite(accountId)) {
    return NextResponse.json({ error: 'Invalid OAuth state payload.' }, { status: 400 });
  }

  try {
    const token = await exchangeAuthCode(code);

    // Best-effort: attempt to detect the brokerage account ID if there's only one.
    let tsAccountId: string | null = null;
    try {
      const accounts = await fetchBrokerageAccounts(token.accessToken);
      if (accounts.length === 1 && accounts[0]?.AccountID) {
        tsAccountId = accounts[0].AccountID;
      }
    } catch {
      // ignore
    }

    await prisma.tradeStationConnection.upsert({
      where: { account_id: accountId },
      create: {
        account_id: accountId,
        ts_account_id: tsAccountId,
        access_token: token.accessToken,
        refresh_token: token.refreshToken,
        token_expires_at: token.expiresAt,
        scopes: token.scopes?.join(' ') ?? undefined,
        status: 'ACTIVE',
      },
      update: {
        ts_account_id: tsAccountId ?? undefined,
        access_token: token.accessToken,
        refresh_token: token.refreshToken,
        token_expires_at: token.expiresAt,
        scopes: token.scopes?.join(' ') ?? undefined,
        status: 'ACTIVE',
      },
    });

    const response = NextResponse.redirect(new URL(`/settings?tradestation=connected&accountId=${accountId}`, request.url));
    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to complete TradeStation auth.' },
      { status: 500 },
    );
  }
}
