'use client';

import React, { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '../_components/ui/Card';

export const ASSET_TYPES = ['CRYPTO', 'EQUITY', 'STABLE', 'NFT', 'OFFLINE', 'CASH', 'OTHER'] as const;
export const VOLATILITY_BUCKETS = ['CASH_LIKE', 'VOLATILE'] as const;
export const PRICING_MODES = ['AUTO', 'MANUAL'] as const;

export type AssetFormInitialValues = {
  symbol: string;
  name: string;
  type: string;
  volatility_bucket: string;
  pricing_mode: string;
  chain_or_market: string | null;
  manual_price: string | null;
  metadata_json: string | null;
};

type AssetFormMode = 'create' | 'edit';

type AssetFormProps = {
  mode: AssetFormMode;
  assetId?: number;
  initialValues?: AssetFormInitialValues;
};

export function AssetForm({ mode, assetId, initialValues }: AssetFormProps) {
  const router = useRouter();
  const [symbol, setSymbol] = useState(initialValues?.symbol ?? '');
  const [name, setName] = useState(initialValues?.name ?? '');
  const [type, setType] = useState(initialValues?.type ?? ASSET_TYPES[0]);
  const [volatilityBucket, setVolatilityBucket] = useState(
    initialValues?.volatility_bucket ?? 'VOLATILE',
  );
  const [pricingMode, setPricingMode] = useState(
    initialValues?.pricing_mode ?? PRICING_MODES[0],
  );
  const [chainOrMarket, setChainOrMarket] = useState(initialValues?.chain_or_market ?? '');
  const [manualPrice, setManualPrice] = useState(initialValues?.manual_price ?? '');
  const [metadataJson, setMetadataJson] = useState(initialValues?.metadata_json ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = mode === 'edit';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload = {
      symbol: symbol.trim(),
      name: name.trim(),
      type,
      volatility_bucket: volatilityBucket,
      pricing_mode: pricingMode,
      chain_or_market: chainOrMarket.trim() || '',
      manual_price: manualPrice.trim() === '' ? null : manualPrice.trim(),
      metadata_json: metadataJson.trim() === '' ? null : metadataJson,
    };

    try {
      const url = isEditMode ? `/api/assets/${assetId}` : '/api/assets';
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
        setError(data?.error || 'Failed to save asset.');
        setSubmitting(false);
        return;
      }

      router.push('/assets');
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
              Symbol
            </label>
            <input
              type="text"
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="e.g. BTC"
            />
          </div>

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
              placeholder="Asset name"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Type
            </label>
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {ASSET_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Volatility Bucket
            </label>
            <select
              value={volatilityBucket}
              onChange={(event) => setVolatilityBucket(event.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {VOLATILITY_BUCKETS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Pricing Mode
            </label>
            <select
              value={pricingMode}
              onChange={(event) => setPricingMode(event.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {PRICING_MODES.map((option) => (
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
              placeholder="e.g. ETH, NASDAQ, OFFLINE"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Manual Price
            </label>
            <input
              type="number"
              step="0.00000001"
              value={manualPrice}
              onChange={(event) => setManualPrice(event.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="Leave blank for AUTO"
            />
            <p className="text-[11px] text-zinc-500">
              Only used when pricing mode is MANUAL.
            </p>
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Metadata (JSON, optional)
            </label>
            <textarea
              value={metadataJson}
              onChange={(event) => setMetadataJson(event.target.value)}
              rows={4}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
              placeholder="Optional metadata or notes in JSON form"
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
            onClick={() => router.push('/assets')}
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
              : 'Create Asset'}
          </button>
        </div>
      </form>
    </Card>
  );
}
