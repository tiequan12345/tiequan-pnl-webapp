'use client';

import React, { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '../_components/ui/Card';
import { ExchangeConnectionClient } from './[id]/exchange/ExchangeConnectionClient';

const ACCOUNT_TYPES = [
  'CEX',
  'DEX_WALLET',
  'BROKER',
  'BANK',
  'BINANCE',
  'BYBIT',
  'NFT_WALLET',
  'OFFLINE',
  'OTHER',
] as const;

const ACCOUNT_STATUS_OPTIONS = ['ACTIVE', 'INACTIVE'] as const;

export type AccountFormInitialValues = {
  name: string;
  platform: string;
  account_type: string;
  chain_or_market: string | null;
  status: string;
  notes: string | null;
};

type AccountFormMode = 'create' | 'edit';

type AccountFormProps = {
  mode: AccountFormMode;
  accountId?: number;
  initialValues?: AccountFormInitialValues;
};

export function AccountForm({ mode, accountId, initialValues }: AccountFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialValues?.name ?? '');
  const [platform, setPlatform] = useState(initialValues?.platform ?? '');
  const [accountType, setAccountType] = useState(
    initialValues?.account_type ?? ACCOUNT_TYPES[0],
  );
  const [status, setStatus] = useState(initialValues?.status ?? ACCOUNT_STATUS_OPTIONS[0]);
  const [chainOrMarket, setChainOrMarket] = useState(
    initialValues?.chain_or_market ?? '',
  );
  const [notes, setNotes] = useState(initialValues?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = mode === 'edit';

  const selectedExchangeId = useMemo(() => {
    if (accountType === 'BINANCE') return 'binance' as const;
    if (accountType === 'BYBIT') return 'bybit' as const;
    return null;
  }, [accountType]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload = {
      name: name.trim(),
      platform: platform.trim(),
      account_type: accountType,
      status,
      chain_or_market: chainOrMarket.trim() === '' ? null : chainOrMarket.trim(),
      notes: notes.trim() === '' ? null : notes.trim(),
    };

    try {
      const url = isEditMode ? `/api/accounts/${accountId}` : '/api/accounts';
      const method = isEditMode ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error || 'Failed to save account.');
        setSubmitting(false);
        return;
      }

      const createdOrUpdated = (await response.json().catch(() => null)) as { id?: number } | null;

      if (!isEditMode && selectedExchangeId && createdOrUpdated?.id) {
        router.push(`/accounts/${createdOrUpdated.id}`);
      } else {
        router.push('/accounts');
      }

      router.refresh();
    } catch {
      setError('Unexpected error. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="Account name"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Platform
            </label>
            <input
              type="text"
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="e.g. Binance, Coinbase, Schwab"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Account Type
            </label>
            <select
              value={accountType}
              onChange={(event) => setAccountType(event.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {ACCOUNT_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Status
            </label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {ACCOUNT_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Chain / Market
            </label>
            <input
              type="text"
              value={chainOrMarket}
              onChange={(event) => setChainOrMarket(event.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="Optional, e.g. ETH, NASDAQ"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
              placeholder="Optional notes about this account"
            />
          </div>
        </div>

        {error && (
          <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/40 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push('/accounts')}
            className="text-sm px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="text-sm px-3 py-2 rounded-lg border border-blue-500/40 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700/60 text-white font-medium transition-colors"
          >
            {submitting
              ? isEditMode
                ? 'Saving...'
                : 'Creating...'
              : isEditMode
              ? 'Save Changes'
              : 'Create Account'}
          </button>
        </div>
      </form>

      {selectedExchangeId ? (
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <h3 className="text-sm font-medium text-zinc-200 mb-2">Exchange API Connection</h3>
          {isEditMode && accountId ? (
            <ExchangeConnectionClient accountId={accountId} exchangeId={selectedExchangeId} />
          ) : (
            <p className="text-sm text-zinc-400">
              Save this account first, then you can configure and sync {selectedExchangeId.toUpperCase()} credentials here.
            </p>
          )}
        </div>
      ) : null}
    </Card>
  );
}