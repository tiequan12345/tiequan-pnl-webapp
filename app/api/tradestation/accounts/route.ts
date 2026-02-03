import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fetchBrokerageAccounts, refreshToken } from '@/lib/tradestation/client';

function isExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) {
    return false;
  }
  return expiresAt.getTime() - Date.now() < 30_000;
}

type LinkPayload = {
  accountId?: number | string;
  tsAccountId?: string;
};

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const accountIdRaw = url.searchParams.get('accountId');
    const accountId = Number(accountIdRaw);

    if (!Number.isFinite(accountId) || accountId <= 0) {
      return NextResponse.json({ error: 'accountId is required.' }, { status: 400 });
    }

    const connection = await prisma.tradeStationConnection.findUnique({
      where: { account_id: accountId },
    });

    if (!connection) {
      return NextResponse.json({ error: 'TradeStation connection not found.' }, { status: 404 });
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

    const accounts = await fetchBrokerageAccounts(accessToken);

    return NextResponse.json({ accounts });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch TradeStation accounts.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as LinkPayload | null;

    const accountId = Number(body?.accountId);
    const tsAccountId = (body?.tsAccountId ?? '').trim();

    if (!Number.isFinite(accountId) || accountId <= 0) {
      return NextResponse.json({ error: 'accountId is required.' }, { status: 400 });
    }

    if (!tsAccountId) {
      return NextResponse.json({ error: 'tsAccountId is required.' }, { status: 400 });
    }

    const updated = await prisma.tradeStationConnection.update({
      where: { account_id: accountId },
      data: {
        ts_account_id: tsAccountId,
        status: 'ACTIVE',
      },
      select: {
        account_id: true,
        ts_account_id: true,
        status: true,
        updated_at: true,
      },
    });

    return NextResponse.json({ connection: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to link TradeStation account.' },
      { status: 500 },
    );
  }
}
