'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { datetimeLocalToUtcIso, toLocalDateTimeInput } from '@/lib/datetime';
import { DateTimePicker } from "@/app/(authenticated)/_components/ui/date-time-picker";
import { parseISO } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/(authenticated)/_components/ui/Card";
import { Button } from "@/app/(authenticated)/_components/ui/button";
import { Label } from "@/app/(authenticated)/_components/ui/label";
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type ExchangeConnectionClientProps = {
  accountId: number;
  exchangeId: string;
};

type StatusPayload = {
  connection?: {
    status: string;
    sandbox: boolean;
    sync_since: string | null;
    options_json: string;
  };
};

type SyncResponse = {
  completed?: boolean;
  jobId?: number;
  created?: number;
  reconciled?: number;
  error?: string;
};

type SyncJobStatusResponse = {
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  result?: {
    created?: number;
    reconciled?: number;
  };
  error_message?: string;
};

type CcxtSyncMode = 'all' | 'balances' | 'orders' | 'ledgers' | 'myTrades';

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
  const [manualSyncMode, setManualSyncMode] = useState<CcxtSyncMode>('balances');

  // Use state for raw date strings or Date objects depending on interaction
  // Existing code used strings for input type="datetime-local"
  // DateTimePicker expects Date | undefined.
  // We'll manage state as strings for API consistency but convert for UI
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
        // API returns a string, likely ISO
        // We need to keep it in a format suitable for our state
        // toLocalDateTimeInput was used for native input, returning 'YYYY-MM-DDTHH:mm'
        // For DateTimePicker, we can store ISO string directly or Date.
        // Let's stick to storing existing SyncSince as the backend string/ISO
        // But wait, toLocalDateTimeInput converts UTC ISO to local 'YYYY-MM-DDTHH:mm'.
        // We should just use the ISO string if we can.
        // If existing logic assumes local date string, we might need to be careful.
        // Let's assume sync_since is ISO.
        setSyncSince(data.connection.sync_since);
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
      // Logic for syncSince validation depending on format
      // If using DateTimePicker, syncSince is likely ISO string or standard Date string
      let parsedSyncSince: string | undefined = undefined;

      if (syncSince) {
        // If it's already an ISO string (from DateTimePicker change handler), use it.
        // Or verify it.
        // datetimeLocalToUtcIso was for converting 'YYYY-MM-DDTHH:mm' local to UTC ISO.
        // Our new picker gives us a Date object which we can format to ISO.
        // Let's assume syncSince is kept as ISO string in state.
        parsedSyncSince = syncSince;
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
          syncSince: parsedSyncSince,
          options: {
            defaultType,
            defaultSubType,
            defaultSettle,
          },
        }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        const errorMsg = data?.error ?? 'Failed to save exchange credentials.';
        setMessage(errorMsg);
        toast.error(errorMsg);
        return;
      }

      setMessage('Credentials saved.');
      toast.success('Credentials saved.');
      setApiKey('');
      setSecret('');
      setPassphrase('');
      await loadStatus();
    } catch {
      const errorMsg = 'Unexpected error while saving credentials.';
      setMessage(errorMsg);
      toast.error(errorMsg);
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
    toast.info("Starting manual sync...");

    try {
      let parsedOverride: string | undefined = undefined;
      if (manualSyncSinceOverride) {
        // unique behavior: override is ISO string from our picker
        parsedOverride = manualSyncSinceOverride;
      }

      const response = await fetch(`/api/ccxt/${exchangeId}/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId,
          mode: manualSyncMode,
          since: parsedOverride,
        }),
      });

      const payload = (await response.json().catch(() => null)) as SyncResponse | null;

      if (!response.ok) {
        const err = payload?.error ?? 'Manual sync failed.';
        setMessage(err);
        toast.error(err);
        return;
      }

      if (payload?.completed) {
        const msg = `Manual ${manualSyncMode} sync complete. Created ${payload.created ?? 0} ledger rows, reconciled ${payload.reconciled ?? 0} balances.`;
        setMessage(msg);
        toast.success(msg);
        await loadStatus();
        return;
      }

      if (!payload?.jobId) {
        setMessage('Manual sync started, but no completion or job id was returned.');
        return;
      }

      setMessage(`Manual ${manualSyncMode} sync queued (job #${payload.jobId}). Waiting for completion...`);

      const job = await pollSyncJob(payload.jobId);

      if (!job) {
        setMessage(`Manual ${manualSyncMode} sync queued (job #${payload.jobId}). Still running — refresh status in a moment.`);
        return;
      }

      if (job.status === 'FAILED') {
        const err = job.error_message ?? `Manual ${manualSyncMode} sync failed.`;
        setMessage(err);
        toast.error(err);
        return;
      }

      const successMsg = `Manual ${manualSyncMode} sync complete. Created ${job.result?.created ?? 0} ledger rows, reconciled ${job.result?.reconciled ?? 0} balances.`;
      setMessage(successMsg);
      toast.success(successMsg);
      await loadStatus();
    } catch {
      setMessage('Unexpected error while syncing.');
      toast.error('Unexpected error while syncing.');
    } finally {
      setSyncing(false);
    }
  }

  // Handlers for DateTimePicker
  const handleSyncSinceChange = (date: Date | undefined) => {
    setSyncSince(date ? date.toISOString() : '');
  };

  const handleManualSyncSinceChange = (date: Date | undefined) => {
    setManualSyncSinceOverride(date ? date.toISOString() : '');
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <h3 className="text-sm font-medium text-zinc-200 mb-2">Connection Status</h3>
        {loadingStatus ? (
          <p className="text-sm text-zinc-400">Loading...</p>
        ) : status?.connection ? (
          <div className="text-sm text-zinc-300 space-y-1">
            <p>Status: <span className="font-medium">{status.connection.status}</span></p>
            <p>Sandbox: <span className="font-medium">{String(status.connection.sandbox)}</span></p>
            <p>
              Synced Since: <span className="font-medium">{status.connection.sync_since ? new Date(status.connection.sync_since).toLocaleString() : 'N/A'}</span>
            </p>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Not connected or no status available.</p>
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
              onChange={(e) => setDefaultType(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            >
              <option value="spot">Spot</option>
              <option value="swap">Swap / Linear</option>
              <option value="future">Future / Inverse</option>
            </select>
          </label>

          <div className="space-y-1 text-sm text-zinc-300">
            <Label>Sync From (optional)</Label>
            <DateTimePicker
              date={syncSince ? new Date(syncSince) : undefined}
              setDate={handleSyncSinceChange}
              placeholder="Pick a start date"
              className="w-full"
            />
            <p className="text-xs text-zinc-500">Only sync trades/movements from this date onwards. Saved and applied in UTC. Leave empty to use default lookback.</p>
          </div>

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
          <Button
            type="submit"
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Credentials'
            )}
          </Button>

          {message && <span className={message.includes('complete') || message.includes('saved') ? 'text-green-400 text-sm' : 'text-amber-400 text-sm'}>{message}</span>}
        </div>
      </form>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-4">
        <h3 className="text-sm font-medium text-zinc-200">Manual Sync / Debug</h3>

        <div className="space-y-1 text-sm text-zinc-300 max-w-md">
          <Label>Manual Sync Override (optional)</Label>
          <DateTimePicker
            date={manualSyncSinceOverride ? new Date(manualSyncSinceOverride) : undefined}
            setDate={handleManualSyncSinceChange}
            placeholder="Pick override timestamp"
            className="w-full"
          />
          <p className="text-xs text-zinc-500">Manual sync uses saved Sync From by default. Set this only to override for one run.</p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-zinc-300">
            Mode:
            <select
              value={manualSyncMode}
              onChange={e => setManualSyncMode(e.target.value as CcxtSyncMode)}
              className="ml-2 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-100"
            >
              <option value="balances">Balances</option>
              <option value="orders">Orders</option>
              <option value="ledgers">Ledgers</option>
              <option value="myTrades">My Trades</option>
              <option value="all">All</option>
            </select>
          </label>
          <Button
            variant="secondary"
            onClick={handleManualSync}
            disabled={syncing}
          >
            {syncing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Run Manual Sync
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
