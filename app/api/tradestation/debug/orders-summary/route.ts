import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fetchHistoricalOrdersRaw, refreshToken } from '@/lib/tradestation/client';

function isExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() - Date.now() < 30_000;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const accountId = Number(url.searchParams.get('accountId'));
    const since = url.searchParams.get('since') ?? undefined;
    const pageSize = Number(url.searchParams.get('pageSize') ?? '200');

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
          status: 'ACTIVE',
        },
      });
    }

    const raw = await fetchHistoricalOrdersRaw({
      accountId: connection.ts_account_id,
      accessToken,
      since,
      pageSize: Number.isFinite(pageSize) ? pageSize : 200,
    });

    const json = raw.json as any;
    const orders: any[] = Array.isArray(json?.Orders) ? json.Orders : [];

    let totalOrders = orders.length;
    let ordersWithLegs = 0;
    let filledLegCount = 0;

    const byLegAssetType: Record<string, number> = {};
    const byOrderStatus: Record<string, number> = {};

    for (const order of orders) {
      const status = typeof order?.Status === 'string' ? order.Status : 'UNKNOWN';
      byOrderStatus[status] = (byOrderStatus[status] ?? 0) + 1;

      const legs: any[] = Array.isArray(order?.Legs) ? order.Legs : [];
      if (legs.length > 0) ordersWithLegs += 1;

      for (const leg of legs) {
        const t = typeof leg?.AssetType === 'string' ? leg.AssetType : 'UNKNOWN';
        byLegAssetType[t] = (byLegAssetType[t] ?? 0) + 1;

        const execQty = toNumber(leg?.ExecQuantity);
        if (execQty !== null && execQty > 0) {
          filledLegCount += 1;
        }
      }
    }

    return NextResponse.json({
      pathUsed: raw.path,
      totalOrders,
      ordersWithLegs,
      filledLegCount,
      byOrderStatus,
      byLegAssetType,
      sampleFirstOrder: orders[0] ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to summarize TradeStation orders.' },
      { status: 500 },
    );
  }
}
