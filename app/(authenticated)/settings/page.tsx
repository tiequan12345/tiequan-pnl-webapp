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
          {loading && <span className="text-sm text-gray-500">Loading…</span>}
        </div>
        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {saveStatus && (
          <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            {saveStatus}
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="block text-sm font-medium text-gray-700">Base Currency</span>
            <input
              type="text"
              value={settings.baseCurrency}
              onChange={(e) => handleChange('baseCurrency', e.target.value.toUpperCase())}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none"
              placeholder="USD"
              disabled={loading}
            />
          </label>
          <label className="space-y-2">
            <span className="block text-sm font-medium text-gray-700">Timezone</span>
            <input
              type="text"
              value={settings.timezone}
              onChange={(e) => handleChange('timezone', e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none"
              placeholder="UTC"
              disabled={loading}
            />
          </label>
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={settings.priceAutoRefresh}
              onChange={(e) => handleChange('priceAutoRefresh', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
              disabled={loading}
            />
            <span className="text-sm font-medium text-gray-700">Auto refresh prices</span>
          </label>
          <label className="space-y-2">
            <span className="block text-sm font-medium text-gray-700">Auto Refresh Interval (minutes)</span>
            <input
              type="number"
              min={1}
              value={settings.priceAutoRefreshIntervalMinutes}
              onChange={(e) => {
                const numeric = Number(e.target.value);
                const clamped = Number.isFinite(numeric) ? Math.max(1, Math.floor(numeric)) : 1;
                handleChange('priceAutoRefreshIntervalMinutes', clamped);
              }}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none"
              disabled={loading}
            />
          </label>
          <label className="md:col-span-2 space-y-2">
            <span className="block text-sm font-medium text-gray-700">Price Refresh Endpoint</span>
            <input
              type="text"
              value={settings.priceRefreshEndpoint}
              onChange={(e) => handleChange('priceRefreshEndpoint', e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none"
              disabled={loading}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
          >
            Save Settings
          </button>
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Manual Price Refresh</h2>
          {refreshStatus && <span className="text-sm text-gray-600">{refreshStatus}</span>}
        </div>
        <p className="text-sm text-gray-600">
          Trigger an immediate price refresh without waiting for the scheduled interval.
        </p>
        <button
          type="button"
          onClick={handleManualRefresh}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white shadow-sm"
        >
          Refresh Prices Now
        </button>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Exports</h2>
        <p className="text-sm text-gray-600">Download your data as CSV or the raw SQLite database.</p>
        <div className="flex flex-wrap gap-3">
          <a
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
            href="/api/export/assets"
          >
            Export Assets CSV
          </a>
          <a
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
            href="/api/export/accounts"
          >
            Export Accounts CSV
          </a>
          <a
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
            href="/api/export/ledger"
          >
            Export Ledger CSV
          </a>
          <a
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
            href="/api/export/db"
          >
            Download SQLite DB
          </a>
        </div>
      </Card>
    </div>
  );
}