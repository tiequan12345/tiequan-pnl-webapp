import { NextRequest, NextResponse } from 'next/server';
import { syncTradeStationAccount } from '@/lib/tradestation/sync';

type SyncPayload = {
  accountId?: number;
  mode?: 'orders' | 'positions' | 'full';
  since?: string;
};

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const accountId = url.searchParams.get('accountId') ?? '';

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TradeStation Sync</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; margin: 24px; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 6px; }
    input, select, button { padding: 8px 10px; font-size: 14px; }
    button { cursor: pointer; }
    .row { margin: 10px 0; }
    pre { background: #0b1020; color: #e5e7eb; padding: 12px; border-radius: 8px; overflow: auto; }
  </style>
</head>
<body>
  <h2>TradeStation Sync</h2>
  <p>This endpoint runs sync via <code>POST /api/tradestation/sync</code>. Use the form below.</p>

  <div class="row">
    <label>Local Account ID:&nbsp;</label>
    <input id="accountId" value="${accountId}" placeholder="e.g. 42" />
  </div>

  <div class="row">
    <label>Mode:&nbsp;</label>
    <select id="mode">
      <option value="orders" selected>orders</option>
      <option value="positions">positions</option>
      <option value="full">full</option>
    </select>
  </div>

  <div class="row">
    <label>Since (optional ISO date):&nbsp;</label>
    <input id="since" placeholder="2025-01-01T00:00:00.000Z" style="width: 340px" />
  </div>

  <div class="row">
    <button id="run">Run sync</button>
  </div>

  <h3>Response</h3>
  <pre id="out">(not run yet)</pre>

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
        const res = await fetch('/api/tradestation/sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const text = await res.text();
        out.textContent = text;
      } catch (e) {
        out.textContent = String(e);
      }
    });
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as SyncPayload | null;

    const accountId = body?.accountId;
    if (!accountId || !Number.isFinite(accountId) || accountId <= 0) {
      return NextResponse.json({ error: 'accountId is required.' }, { status: 400 });
    }

    const since = body?.since ? new Date(body.since) : undefined;
    if (body?.since && (!since || Number.isNaN(since.getTime()))) {
      return NextResponse.json({ error: 'Invalid since.' }, { status: 400 });
    }

    const result = await syncTradeStationAccount({
      accountId,
      mode: body?.mode,
      since,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to sync TradeStation account.' },
      { status: 500 },
    );
  }
}
