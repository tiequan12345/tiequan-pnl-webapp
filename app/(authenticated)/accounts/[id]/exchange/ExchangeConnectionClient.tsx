'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { datetimeLocalToUtcIso, toLocalDateTimeInput } from '@/lib/datetime';

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
    sync_since: string | null;
    last_sync_at: string | null;
    last_trade_sync_at: string | null;
    metadata_json: string | null;
  } | null;
};

type SyncQueueResponse = {
  error?: string;
  queued?: boolean;
  deduped?: boolean;
  jobId?: number;
  status?: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
};

type SyncJobStatusResponse = {
  id: number;
  status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  error_message: string | null;
  result?: {
    created?: number;
    reconciled?: number;
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
  const [syncSince, setSyncSince] = useState('');
  const [manualSyncSinceOverride, setManualSyncSinceOverride] = useState('');
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
      if (data.connection?.sync_since) {
        const localDatetime = toLocalDateTimeInput(data.connection.sync_since);
        setSyncSince(localDatetime ?? '');
      }
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
      if (syncSince) {
        const parsedSyncSince = datetimeLocalToUtcIso(syncSince);
        if (!parsedSyncSince) {
          setMessage('Invalid Sync From date/time.');
          return;
        }
      }

      const response = await fetch(`/api/ccxt/${exchangeId}/connect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId,
          apiKey,
          secret,
          passphrase: passphrase || undefined,
          sandbox,
          syncSince: syncSince ? datetimeLocalToUtcIso(syncSince) ?? undefined : undefined,
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

  async function pollSyncJob(jobId: number): Promise<SyncJobStatusResponse | null> {
    const maxAttempts = 180;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await fetch(`/api/ccxt/sync-jobs/${jobId}`, { cache: 'no-store' });
      if (!response.ok) {
        return null;
      }

      const data = (await response.json().catch(() => null)) as SyncJobStatusResponse | null;
      if (!data) {
        return null;
      }

      if (data.status === 'SUCCESS' || data.status === 'FAILED') {
        return data;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return null;
  }

  async function handleManualSync() {
    setSyncing(true);
    setMessage(null);

    try {
      if (manualSyncSinceOverride) {
        const parsedOverride = datetimeLocalToUtcIso(manualSyncSinceOverride);
        if (!parsedOverride) {
          setMessage('Invalid manual sync override date/time.');
          return;
        }
      }

      const response = await fetch(`/api/ccxt/${exchangeId}/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId,
          mode: manualSyncMode,
          since: manualSyncSinceOverride
            ? datetimeLocalToUtcIso(manualSyncSinceOverride) ?? undefined
            : undefined,
        }),
      });

      const queued = (await response.json().catch(() => null)) as SyncQueueResponse | null;

      if (!response.ok) {
        setMessage(queued?.error ?? 'Manual sync failed to queue.');
        return;
      }

      if (!queued?.jobId) {
        setMessage('Manual sync was queued, but job id was missing.');
        return;
      }

      setMessage(`Manual ${manualSyncMode} sync queued (job #${queued.jobId}). Waiting for completion...`);

      const job = await pollSyncJob(queued.jobId);

      if (!job) {
        setMessage(`Manual ${manualSyncMode} sync queued (job #${queued.jobId}). Still running — refresh status in a moment.`);
        return;
      }

      if (job.status === 'FAILED') {
        setMessage(job.error_message ?? `Manual ${manualSyncMode} sync failed.`);
        return;
      }

      setMessage(
        `Manual ${manualSyncMode} sync complete. Created ${job.result?.created ?? 0} ledger rows, reconciled ${job.result?.reconciled ?? 0} balances.`,
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
            <p>Sync from: {status.connection.sync_since ? `${new Date(status.connection.sync_since).toLocaleString()} (${new Date(status.connection.sync_since).toISOString()})` : '—'}</p>
            <p>Last sync: {status.connection.last_sync_at ?? '—'}</p>
            <p>Last trade sync: {status.connection.last_trade_sync_at ?? '—'}</p>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">No connection configured yet.</p>
        )}
      </div>

      <form onSubmit={handleSaveCredentials} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-4">
        <h3 className="text-sm font-medium text-zinc-200">Set / Update Credentials & Sync Settings</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1 text-sm text-zinc-300">
            <span>API Key (optional when already connected)</span>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            />
          </label>

          <label className="space-y-1 text-sm text-zinc-300">
            <span>API Secret (optional when already connected)</span>
            <input
              type="password"
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

          <label className="space-y-1 text-sm text-zinc-300">
            <span>Sync From (optional)</span>
            <input
              type="datetime-local"
              value={syncSince}
              onChange={(event) => setSyncSince(event.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            />
            <p className="text-xs text-zinc-500">Only sync trades/movements from this date onwards. Saved and applied in UTC. Leave empty to use default lookback. You can change this without re-entering API credentials.</p>
          </label>

          <label className="space-y-1 text-sm text-zinc-300">
            <span>Manual Sync Override (optional)</span>
            <input
              type="datetime-local"
              value={manualSyncSinceOverride}
              onChange={(event) => setManualSyncSinceOverride(event.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            />
            <p className="text-xs text-zinc-500">Manual sync uses saved Sync From by default. Set this only to override for one run.</p>
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
              <option value="trades">trades</option>
              <option value="balances">balances (fast)</option>
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
