import { NextRequest, NextResponse } from 'next/server';
import { syncCcxtAccount, type CcxtSyncMode } from '@/lib/ccxt/sync';
import { prisma } from '@/lib/db';
import { isMissingSyncSinceColumnError, parseIsoInstant } from '@/lib/datetime';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ exchange: string }>;
};

type SyncPayload = {
  accountId?: number;
  mode?: CcxtSyncMode;
  since?: string;
};

function isSupportedExchange(value: string): value is 'binance' | 'bybit' {
  return value === 'binance' || value === 'bybit';
}

function expectedAccountType(exchange: 'binance' | 'bybit'): 'BINANCE' | 'BYBIT' {
  return exchange === 'binance' ? 'BINANCE' : 'BYBIT';
}

function isSupportedMode(value: string): value is CcxtSyncMode {
  return value === 'trades' || value === 'balances' || value === 'full';
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { exchange } = await context.params;

  if (!isSupportedExchange(exchange)) {
    return NextResponse.json({ error: 'Unsupported exchange.' }, { status: 400 });
  }

  const accountId = new URL(request.url).searchParams.get('accountId') ?? '';

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${exchange.toUpperCase()} Sync</title>
</head>
<body style="font-family: ui-sans-serif, system-ui; margin: 24px;">
  <h2>${exchange.toUpperCase()} Sync</h2>
  <p>Runs <code>POST /api/ccxt/${exchange}/sync</code></p>

  <div style="margin: 10px 0;">
    <label>Local Account ID: </label>
    <input id="accountId" value="${accountId}" />
  </div>

  <div style="margin: 10px 0;">
    <label>Mode: </label>
    <select id="mode">
      <option value="trades" selected>trades</option>
      <option value="balances">balances</option>
      <option value="full">full</option>
    </select>
  </div>

  <div style="margin: 10px 0;">
    <label>Since (optional ISO date with timezone): </label>
    <input id="since" style="width: 360px" placeholder="2026-01-01T00:00:00.000Z" />
  </div>

  <button id="run">Run sync</button>

  <h3>Response</h3>
  <pre id="out" style="background: #111827; color: #e5e7eb; padding: 10px; border-radius: 8px;">(not run yet)</pre>

  <script>
    const out = document.getElementById('out');
    document.getElementById('run').addEventListener('click', async () => {
      out.textContent = 'Running...';
      const payload = {
        accountId: Number(document.getElementById('accountId').value),
        mode: document.getElementById('mode').value,
      };
      const since = document.getElementById('since').value.trim();
      if (since) payload.since = since;

      try {
        const res = await fetch('/api/ccxt/${exchange}/sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        out.textContent = await res.text();
      } catch (e) {
        out.textContent = String(e);
      }
    });
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { exchange } = await context.params;

    if (!isSupportedExchange(exchange)) {
      return NextResponse.json({ error: 'Unsupported exchange.' }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as SyncPayload | null;

    const accountId = body?.accountId;
    if (!accountId || !Number.isFinite(accountId) || accountId <= 0) {
      return NextResponse.json({ error: 'accountId is required.' }, { status: 400 });
    }

    const since = body?.since ? (parseIsoInstant(body.since) ?? undefined) : undefined;
    if (body?.since && !since) {
      return NextResponse.json(
        { error: 'Invalid since date. Use ISO 8601 with timezone (UTC recommended).' },
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
        { error: `Account type mismatch. Route '${exchange}' requires account_type='${expectedType}'.` },
        { status: 400 },
      );
    }

    const connection = await prisma.ccxtConnection.findUnique({
      where: { account_id: accountId },
      select: { exchange_id: true },
    });

    if (!connection || connection.exchange_id !== exchange) {
      return NextResponse.json({ error: `No ${exchange.toUpperCase()} connection configured for this account.` }, { status: 404 });
    }

    const mode = (body?.mode ?? 'trades').trim().toLowerCase();
    if (!isSupportedMode(mode)) {
      return NextResponse.json(
        { error: "mode must be one of 'trades', 'balances', or 'full'." },
        { status: 400 },
      );
    }

    const result = await syncCcxtAccount({
      accountId,
      mode,
      since,
    });

    return NextResponse.json({
      queued: false,
      completed: true,
      accountId,
      exchange,
      mode,
      created: result.created,
      updated: result.updated,
      reconciled: result.reconciled,
      lastSyncAt: result.lastSyncAt.toISOString(),
    });
  } catch (error) {
    if (isMissingSyncSinceColumnError(error)) {
      return NextResponse.json(
        { error: 'Database migration required: run Prisma migrations before using sync_since fields.' },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync CCXT account.' },
      { status: 500 },
    );
  }
}
