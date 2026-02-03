import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildAuthUrl } from '@/lib/tradestation/client';

const OAUTH_STATE_COOKIE = 'ts_oauth_state';

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const accountIdRaw = url.searchParams.get('accountId');
    const prompt = url.searchParams.get('prompt');
    const debug = url.searchParams.get('debug');

    const accountId = Number(accountIdRaw);
    if (!Number.isFinite(accountId) || accountId <= 0) {
      return NextResponse.json({ error: 'accountId is required.' }, { status: 400 });
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    const clientId = process.env.TRADESTATION_CLIENT_ID;
    const redirectUri = process.env.TRADESTATION_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return NextResponse.json(
        { error: 'TradeStation env vars are not configured (TRADESTATION_CLIENT_ID/TRADESTATION_REDIRECT_URI).' },
        { status: 500 },
      );
    }

    const statePayload = {
      accountId,
      nonce: crypto.randomUUID(),
      createdAt: Date.now(),
    };

    const encodedState = base64UrlEncode(JSON.stringify(statePayload));

    const authUrl = buildAuthUrl({
      clientId,
      redirectUri,
      state: encodedState,
      prompt: prompt === 'login' ? 'login' : undefined,
    });

    if (debug === '1') {
      return NextResponse.json({
        authUrl,
        redirectUri,
      });
    }

    const response = NextResponse.redirect(authUrl);

    response.cookies.set(OAUTH_STATE_COOKIE, encodedState, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      // Use '/' so the cookie is available even if the redirect URI is configured as the site root.
      path: '/',
      maxAge: 60 * 10,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start TradeStation auth.' },
      { status: 500 },
    );
  }
}
