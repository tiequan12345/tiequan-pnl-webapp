import { NextRequest, NextResponse } from 'next/server';
import { syncCcxtAccount, type CcxtSyncMode } from '@/lib/ccxt/sync';

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
    <label>Since (optional ISO date): </label>
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

    const since = body?.since ? new Date(body.since) : undefined;
    if (body?.since && (!since || Number.isNaN(since.getTime()))) {
      return NextResponse.json({ error: 'Invalid since date.' }, { status: 400 });
    }

    const result = await syncCcxtAccount({
      accountId,
      mode: body?.mode,
      since,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync CCXT account.' },
      { status: 500 },
    );
  }
}
