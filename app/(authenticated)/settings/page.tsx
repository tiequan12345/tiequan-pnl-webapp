'use client';

import { useEffect, useState } from 'react';

import { Card } from '../_components/ui/Card';

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

  const handleChange = (field: keyof SettingsState, value: string | boolean | number) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const isValidBaseCurrency = settings.baseCurrency.trim().length > 0;
  const isValidTimezone = settings.timezone.trim().length > 0;
  const isValidInterval =
    Number.isFinite(settings.priceAutoRefreshIntervalMinutes) &&
    settings.priceAutoRefreshIntervalMinutes > 0;
  const canSave = !loading && isValidBaseCurrency && isValidTimezone && isValidInterval;

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
            <input
              type="text"
              value={settings.baseCurrency}
              onChange={(e) => handleChange('baseCurrency', e.target.value.toUpperCase())}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="USD"
              disabled={loading}
            />
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