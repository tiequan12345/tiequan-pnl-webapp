'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

type ExchangeConnectionClientProps = {
  accountId: number;
  exchangeId: 'binance' | 'bybit';
};

type CcxtSyncMode = 'trades' | 'balances' | 'full';

type StatusPayload = {
  connected: boolean;
  connection: {
    status: string;
    sandbox: boolean;
    options_json: string | null;
    last_sync_at: string | null;
    last_trade_sync_at: string | null;
    metadata_json: string | null;
  } | null;
};

export function ExchangeConnectionClient({ accountId, exchangeId }: ExchangeConnectionClientProps) {
  const [apiKey, setApiKey] = useState('');
  const [secret, setSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [sandbox, setSandbox] = useState(false);
  const [defaultType, setDefaultType] = useState('spot');
  const [defaultSubType, setDefaultSubType] = useState('linear');
  const [defaultSettle, setDefaultSettle] = useState('USDT');

  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [manualSyncMode, setManualSyncMode] = useState<CcxtSyncMode>('trades');
  const [message, setMessage] = useState<string | null>(null);

  const statusUrl = useMemo(
    () => `/api/ccxt/${exchangeId}/status?accountId=${accountId}`,
    [accountId, exchangeId],
  );

  async function loadStatus() {
    setLoadingStatus(true);
    try {
      const response = await fetch(statusUrl, { cache: 'no-store' });
      const data = (await response.json()) as StatusPayload;
      setStatus(data);

      const parsedOptions = data.connection?.options_json
        ? (JSON.parse(data.connection.options_json) as {
            defaultType?: string;
            defaultSubType?: string;
            defaultSettle?: string;
          })
        : null;

      if (parsedOptions?.defaultType) setDefaultType(parsedOptions.defaultType);
      if (parsedOptions?.defaultSubType) setDefaultSubType(parsedOptions.defaultSubType);
      if (parsedOptions?.defaultSettle) setDefaultSettle(parsedOptions.defaultSettle);
      if (typeof data.connection?.sandbox === 'boolean') setSandbox(data.connection.sandbox);
    } catch {
      setStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, [statusUrl]);

  async function handleSaveCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/ccxt/${exchangeId}/connect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId,
          apiKey,
          secret,
          passphrase: passphrase || undefined,
          sandbox,
          options: {
            defaultType,
            defaultSubType,
            defaultSettle,
          },
        }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setMessage(data?.error ?? 'Failed to save exchange credentials.');
        return;
      }

      setMessage('Credentials saved.');
      setApiKey('');
      setSecret('');
      setPassphrase('');
      await loadStatus();
    } catch {
      setMessage('Unexpected error while saving credentials.');
    } finally {
      setSaving(false);
    }
  }

  async function handleManualSync() {
    setSyncing(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/ccxt/${exchangeId}/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId,
          mode: manualSyncMode,
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        error?: string;
        created?: number;
        reconciled?: number;
      } | null;

      if (!response.ok) {
        setMessage(data?.error ?? 'Manual sync failed.');
        return;
      }

      setMessage(
        `Manual ${manualSyncMode} sync complete. Created ${data?.created ?? 0} ledger rows, reconciled ${data?.reconciled ?? 0} balances.`,
      );
      await loadStatus();
    } catch {
      setMessage('Unexpected error while syncing.');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white">{exchangeId.toUpperCase()} Connection</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Stored secrets are encrypted at rest. Existing secrets are never displayed.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <h3 className="text-sm font-medium text-zinc-200 mb-2">Connection Status</h3>
        {loadingStatus ? (
          <p className="text-sm text-zinc-400">Loading...</p>
        ) : status?.connection ? (
          <div className="text-sm text-zinc-300 space-y-1">
            <p>Status: <span className="font-medium">{status.connection.status}</span></p>
            <p>Sandbox: <span className="font-medium">{String(status.connection.sandbox)}</span></p>
            <p>Last sync: {status.connection.last_sync_at ?? '—'}</p>
            <p>Last trade sync: {status.connection.last_trade_sync_at ?? '—'}</p>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">No connection configured yet.</p>
        )}
      </div>

      <form onSubmit={handleSaveCredentials} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-4">
        <h3 className="text-sm font-medium text-zinc-200">Set / Update Credentials</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1 text-sm text-zinc-300">
            <span>API Key</span>
            <input
              type="password"
              required
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            />
          </label>

          <label className="space-y-1 text-sm text-zinc-300">
            <span>API Secret</span>
            <input
              type="password"
              required
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            />
          </label>

          <label className="space-y-1 text-sm text-zinc-300">
            <span>Passphrase (optional)</span>
            <input
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            />
          </label>

          <label className="space-y-1 text-sm text-zinc-300">
            <span>{exchangeId === 'binance' ? 'Preferred Type' : 'Default Type'}</span>
            <select
              value={defaultType}
              onChange={(event) => setDefaultType(event.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            >
              <option value="spot">spot</option>
              <option value="swap">swap</option>
              <option value="future">future</option>
              <option value="margin">margin</option>
            </select>
            {exchangeId === 'binance' ? (
              <p className="text-xs text-zinc-500">Binance sync runs both spot and margin automatically.</p>
            ) : null}
          </label>

          <label className="space-y-1 text-sm text-zinc-300">
            <span>Default SubType</span>
            <select
              value={defaultSubType}
              onChange={(event) => setDefaultSubType(event.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            >
              <option value="linear">linear</option>
              <option value="inverse">inverse</option>
            </select>
          </label>

          <label className="space-y-1 text-sm text-zinc-300">
            <span>Default Settle</span>
            <select
              value={defaultSettle}
              onChange={(event) => setDefaultSettle(event.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            >
              <option value="USDT">USDT</option>
              <option value="USDC">USDC</option>
            </select>
          </label>
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={sandbox}
            onChange={(event) => setSandbox(event.target.checked)}
          />
          Use sandbox / testnet
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-zinc-300 flex items-center gap-2">
            <span>Sync mode</span>
            <select
              value={manualSyncMode}
              onChange={(event) => setManualSyncMode(event.target.value as CcxtSyncMode)}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            >
              <option value="balances">balances (fast)</option>
              <option value="trades">trades</option>
              <option value="full">full</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 px-4 py-2 text-sm text-white"
          >
            {saving ? 'Saving...' : 'Save Credentials'}
          </button>

          <button
            type="button"
            onClick={handleManualSync}
            disabled={syncing}
            className="rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 px-4 py-2 text-sm text-zinc-100"
          >
            {syncing ? 'Syncing...' : 'Run Manual Sync'}
          </button>
        </div>

        {message ? <p className="text-sm text-zinc-300">{message}</p> : null}
      </form>
    </div>
  );
}
