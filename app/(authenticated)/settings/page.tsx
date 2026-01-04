'use client';

import { useEffect, useState } from 'react';

import { Card } from '../_components/ui/Card';
import { UnmatchedDiagnosticsViewer, type EnrichedDiagnostic } from './_components/UnmatchedDiagnosticsViewer';

type SettingsState = {
  baseCurrency: string;
  timezone: string;
  priceAutoRefresh: boolean;
  priceAutoRefreshIntervalMinutes: number;
  priceRefreshEndpoint: string;
};

const INITIAL_SETTINGS: SettingsState = {
  baseCurrency: '',
  timezone: '',
  priceAutoRefresh: true,
  priceAutoRefreshIntervalMinutes: 60,
  priceRefreshEndpoint: '/api/prices/refresh',
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState>(INITIAL_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [refreshStatus, setRefreshStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recalcMode, setRecalcMode] = useState<'PURE' | 'HONOR_RESETS'>('PURE');
  const [recalcAsOf, setRecalcAsOf] = useState<string>('');
  const [recalcExternalRef, setRecalcExternalRef] = useState<string>('');
  const [recalcNotes, setRecalcNotes] = useState<string>('');
  const [recalcStatus, setRecalcStatus] = useState<string | null>(null);
  const [recalcDiagnostics, setRecalcDiagnostics] = useState<number | null>(null);
  const [recalcDiagnosticsList, setRecalcDiagnosticsList] = useState<EnrichedDiagnostic[] | null>(null);
  const [recalcError, setRecalcError] = useState<string | null>(null);
  const [recalcSubmitting, setRecalcSubmitting] = useState<boolean>(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) {
          throw new Error('Failed to load settings');
        }
        const data: SettingsState = await res.json();
        setSettings(data);
      } catch (err) {
        console.error(err);
        setError('Unable to load settings. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleCostBasisRecalc = async () => {
    setRecalcStatus(null);
    setRecalcDiagnostics(null);
    setRecalcDiagnosticsList(null);
    setRecalcError(null);
    setRecalcSubmitting(true);

    try {
      const payload: {
        mode: 'PURE' | 'HONOR_RESETS';
        as_of?: string;
        external_reference?: string;
        notes?: string;
      } = {
        mode: recalcMode,
      };

      const asOfTrimmed = recalcAsOf.trim();
      if (asOfTrimmed) {
        const asOfDate = new Date(asOfTrimmed);
        if (Number.isNaN(asOfDate.getTime())) {
          throw new Error('Invalid as_of date/time.');
        }
        payload.as_of = asOfDate.toISOString();
      }

      const externalRef = recalcExternalRef.trim();
      if (externalRef) {
        payload.external_reference = externalRef;
      }

      const notesTrimmed = recalcNotes.trim();
      if (notesTrimmed) {
        payload.notes = notesTrimmed;
      }

      const res = await fetch('/api/ledger/cost-basis-recalc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to recalculate cost basis.');
      }

      const data = (await res.json().catch(() => null)) as
        | {
          created?: number;
          skippedUnknown?: number;
          skippedZeroQuantity?: number;
          diagnostics?: unknown[];
        }
        | null;

      const created = typeof data?.created === 'number' ? data.created : 0;
      const skippedUnknown = typeof data?.skippedUnknown === 'number' ? data.skippedUnknown : 0;
      const skippedZeroQuantity =
        typeof data?.skippedZeroQuantity === 'number' ? data.skippedZeroQuantity : 0;

      const diagnosticsList = Array.isArray(data?.diagnostics)
        ? (data?.diagnostics as EnrichedDiagnostic[])
        : [];
      const diagnosticsCount = diagnosticsList.length;

      setRecalcDiagnostics(diagnosticsCount);
      setRecalcDiagnosticsList(diagnosticsList);
      setRecalcStatus(
        `Created ${created} resets. Skipped ${skippedUnknown} unknown, ${skippedZeroQuantity} zero-quantity.`,
      );
    } catch (err) {
      console.error(err);
      setRecalcError(err instanceof Error ? err.message : 'Failed to recalculate cost basis.');
    } finally {
      setRecalcSubmitting(false);
    }
  };

  const handleResolveTransfer = async (legIds: number[], action: 'MATCH' | 'SEPARATE') => {
    const res = await fetch('/api/ledger/resolve-transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legIds, action }),
    });

    if (!res.ok) {
      throw new Error('Resolution failed');
    }

    // Instead of optimistically removing, re-run recalc to ensure world state is consistent
    // and to clear out the diagnostics truly.
    await handleCostBasisRecalc();
  };

  const handleChange = (field: keyof SettingsState, value: string | boolean | number) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const isValidTimezone = settings.timezone.trim().length > 0;
  const isValidInterval =
    Number.isFinite(settings.priceAutoRefreshIntervalMinutes) &&
    settings.priceAutoRefreshIntervalMinutes > 0;
  const canSave = !loading && isValidTimezone && isValidInterval;

  const handleSave = async () => {
    setSaveStatus(null);
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to save settings');
      }
      const data: SettingsState = await res.json();
      setSettings(data);
      setSaveStatus('Settings saved successfully.');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to save settings.');
    }
  };

  const handleManualRefresh = async () => {
    setRefreshStatus(null);
    try {
      const endpoint = settings.priceRefreshEndpoint?.trim() || '/api/prices/refresh';
      const res = await fetch(endpoint, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Refresh failed');
      }
      setRefreshStatus('Price refresh triggered.');
    } catch (err) {
      console.error(err);
      setRefreshStatus(err instanceof Error ? err.message : 'Failed to trigger refresh.');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">General</h2>
          {loading && <span className="text-sm text-zinc-500">Loading…</span>}
        </div>
        {error && (
          <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/40 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        {saveStatus && (
          <div className="text-xs text-green-400 bg-green-500/10 border border-green-500/40 rounded-lg px-3 py-2">
            {saveStatus}
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Base Currency</span>
            <div className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300">
              USD (fixed)
            </div>
            <p className="text-xs text-zinc-500">
              Base currency is fixed to USD as all pricing providers return USD values.
            </p>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Timezone</span>
            <input
              type="text"
              value={settings.timezone}
              onChange={(e) => handleChange('timezone', e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="UTC"
              disabled={loading}
            />
          </label>
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={settings.priceAutoRefresh}
              onChange={(e) => handleChange('priceAutoRefresh', e.target.checked)}
              className="h-4 w-4 rounded border-zinc-800 bg-zinc-900 text-blue-600 focus:ring-blue-500 focus:ring-2"
              disabled={loading}
            />
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Auto refresh prices</span>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Auto Refresh Interval (minutes)</span>
            <input
              type="number"
              min={1}
              value={settings.priceAutoRefreshIntervalMinutes}
              onChange={(e) => {
                const numeric = Number(e.target.value);
                const clamped = Number.isFinite(numeric) ? Math.max(1, Math.floor(numeric)) : 1;
                handleChange('priceAutoRefreshIntervalMinutes', clamped);
              }}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              disabled={loading}
            />
          </label>
          <label className="md:col-span-2 space-y-2">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Price Refresh Endpoint</span>
            <input
              type="text"
              value={settings.priceRefreshEndpoint}
              onChange={(e) => handleChange('priceRefreshEndpoint', e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              disabled={loading}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="text-sm px-3 py-2 rounded-lg border border-blue-500/40 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700/60 text-white font-medium transition-colors"
          >
            Save Settings
          </button>
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Manual Price Refresh</h2>
          {refreshStatus && <span className="text-sm text-zinc-400">{refreshStatus}</span>}
        </div>
        <p className="text-sm text-zinc-400">
          Trigger an immediate price refresh without waiting for the scheduled interval.
        </p>
        <button
          type="button"
          onClick={handleManualRefresh}
          className="text-sm px-3 py-2 rounded-lg border border-blue-500/40 bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
        >
          Refresh Prices Now
        </button>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Cost Basis Recalculation</h2>
          {recalcStatus && <span className="text-sm text-zinc-400">{recalcStatus}</span>}
        </div>
        <p className="text-sm text-zinc-400">
          Recompute cost basis across all accounts and persist results as COST_BASIS_RESET entries.
        </p>
        {recalcError && (
          <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/40 rounded-lg px-3 py-2">
            {recalcError}
          </div>
        )}
        {recalcDiagnostics !== null && (
          <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/40 rounded-lg px-3 py-2">
            Diagnostics: {recalcDiagnostics} transfer pairing issue(s) detected.
          </div>
        )}
        {recalcDiagnosticsList && recalcDiagnosticsList.length > 0 && (
          <UnmatchedDiagnosticsViewer
            diagnostics={recalcDiagnosticsList}
            onResolve={handleResolveTransfer}
          />
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Mode</span>
            <select
              value={recalcMode}
              onChange={(e) => setRecalcMode(e.target.value as 'PURE' | 'HONOR_RESETS')}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="PURE">PURE (ignore resets)</option>
              <option value="HONOR_RESETS">HONOR_RESETS (apply existing resets)</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">As Of (optional)</span>
            <input
              type="datetime-local"
              value={recalcAsOf}
              onChange={(e) => setRecalcAsOf(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">External Reference (optional)</span>
            <input
              type="text"
              value={recalcExternalRef}
              onChange={(e) => setRecalcExternalRef(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="RECALC:2025-12-31"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Notes (optional)</span>
            <input
              type="text"
              value={recalcNotes}
              onChange={(e) => setRecalcNotes(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="Recalc notes"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={handleCostBasisRecalc}
          disabled={recalcSubmitting}
          className="text-sm px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-700/60 text-white font-medium transition-colors"
        >
          {recalcSubmitting ? 'Recalculating...' : 'Recalculate Cost Basis'}
        </button>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">System Health</h2>
        <p className="text-sm text-zinc-400">
          Monitor the health and status of the price refresh system.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            className="text-sm px-3 py-2 rounded-lg border border-green-500/40 bg-green-600 hover:bg-green-500 text-white font-medium transition-colors"
            href="/api/prices/health"
            target="_blank"
            rel="noopener noreferrer"
          >
            Check System Health
          </a>
          <a
            className="text-sm px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 transition-colors"
            href="/api/prices/rate-limit"
            target="_blank"
            rel="noopener noreferrer"
          >
            View Rate Limit Status
          </a>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Exports</h2>
        <p className="text-sm text-zinc-400">Download your data as CSV or the raw SQLite database.</p>
        <div className="flex flex-wrap gap-3">
          <a
            className="text-sm px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 transition-colors"
            href="/api/export/assets"
          >
            Export Assets CSV
          </a>
          <a
            className="text-sm px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 transition-colors"
            href="/api/export/accounts"
          >
            Export Accounts CSV
          </a>
          <a
            className="text-sm px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 transition-colors"
            href="/api/export/ledger"
          >
            Export Ledger CSV
          </a>
          <a
            className="text-sm px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 transition-colors"
            href="/api/export/db"
          >
            Download SQLite DB
          </a>
        </div>
      </Card>
    </div>
  );
}