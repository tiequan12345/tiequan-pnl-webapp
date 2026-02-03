import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fetchHistoricalOrdersRaw, refreshToken } from '@/lib/tradestation/client';

function isExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) {
    return false;
  }
  return expiresAt.getTime() - Date.now() < 30_000;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const accountId = Number(url.searchParams.get('accountId'));
    const since = url.searchParams.get('since') ?? undefined;
    const pageSize = url.searchParams.get('pageSize');

    if (!Number.isFinite(accountId) || accountId <= 0) {
      return NextResponse.json({ error: 'accountId is required.' }, { status: 400 });
    }

    const connection = await prisma.tradeStationConnection.findUnique({
      where: { account_id: accountId },
    });

    if (!connection) {
      return NextResponse.json({ error: 'TradeStation connection not found.' }, { status: 404 });
    }

    if (!connection.ts_account_id) {
      return NextResponse.json({ error: 'ts_account_id is not set on the connection.' }, { status: 400 });
    }

    let accessToken = connection.access_token;

    if (!accessToken || isExpired(connection.token_expires_at)) {
      const refreshed = await refreshToken(connection.refresh_token);
      accessToken = refreshed.accessToken;

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
    }

    const raw = await fetchHistoricalOrdersRaw({
      accountId: connection.ts_account_id,
      accessToken,
      since,
      pageSize: pageSize ? Number(pageSize) : 50,
    });

    const json = raw.json;

    const topLevelKeys = json && typeof json === 'object' && !Array.isArray(json)
      ? Object.keys(json as Record<string, unknown>)
      : null;

    return NextResponse.json({
      pathUsed: raw.path,
      topLevelKeys,
      sample: json,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to debug TradeStation orders.' },
      { status: 500 },
    );
  }
}
