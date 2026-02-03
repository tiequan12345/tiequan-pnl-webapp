import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { refreshToken } from '@/lib/tradestation/client';

function isExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() - Date.now() < 30_000;
}

function getApiBaseUrl(): string {
  const raw = process.env.TRADESTATION_BASE_URL?.trim();
  if (!raw) return 'https://api.tradestation.com';
  return raw.replace(/\/+$/g, '');
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const localAccountId = Number(url.searchParams.get('accountId'));
    const path = url.searchParams.get('path') ?? '';

    if (!Number.isFinite(localAccountId) || localAccountId <= 0) {
      return NextResponse.json({ error: 'accountId is required.' }, { status: 400 });
    }

    if (!path.startsWith('/v3/')) {
      return NextResponse.json({ error: 'path must start with /v3/.' }, { status: 400 });
    }

    const connection = await prisma.tradeStationConnection.findUnique({
      where: { account_id: localAccountId },
    });

    if (!connection) {
      return NextResponse.json({ error: 'TradeStation connection not found.' }, { status: 404 });
    }

    let accessToken = connection.access_token;
    if (!accessToken || isExpired(connection.token_expires_at)) {
      const refreshed = await refreshToken(connection.refresh_token);
      accessToken = refreshed.accessToken;
      await prisma.tradeStationConnection.update({
        where: { account_id: localAccountId },
        data: {
          access_token: refreshed.accessToken,
          refresh_token: refreshed.refreshToken,
          token_expires_at: refreshed.expiresAt,
          status: 'ACTIVE',
        },
      });
    }

    const fullUrl = `${getApiBaseUrl()}${path}`;

    const resp = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
      },
      cache: 'no-store',
    });

    const text = await resp.text();

    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    const topLevelKeys = json && typeof json === 'object' && !Array.isArray(json)
      ? Object.keys(json as Record<string, unknown>)
      : null;

    const ordersCount = Array.isArray((json as any)?.Orders) ? (json as any).Orders.length : null;
    const errorsCount = Array.isArray((json as any)?.Errors) ? (json as any).Errors.length : null;

    return NextResponse.json({
      url: fullUrl,
      status: resp.status,
      ok: resp.ok,
      topLevelKeys,
      ordersCount,
      errorsCount,
      json: json ?? text.slice(0, 2000),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to execute debug request.' },
      { status: 500 },
    );
  }
}
