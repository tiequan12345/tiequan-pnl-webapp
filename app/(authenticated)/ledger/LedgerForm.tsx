'use client';

import React, { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

type LedgerFormProps = {
  accounts: { id: number; name: string }[];
  assets: { id: number; symbol: string; name: string }[];
};

const TX_TYPES = [
  'DEPOSIT',
  'WITHDRAWAL',
  'TRADE_BUY',
  'TRADE_SELL',
  'YIELD',
  'FEE',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'NFT_PURCHASE',
  'NFT_SALE',
  'OFFLINE_IN',
  'OFFLINE_OUT',
  'OTHER',
] as const;

const DIRECTIONS = ['IN', 'OUT'] as const;

function getDefaultDateTimeLocal(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  const local = new Date(now.getTime() - offsetMs);
  return local.toISOString().slice(0, 16);
}

export function LedgerForm({ accounts, assets }: LedgerFormProps) {
  const router = useRouter();

  const [dateTime, setDateTime] = useState<string>(getDefaultDateTimeLocal());
  const [accountId, setAccountId] = useState<string>(
    accounts.length > 0 ? String(accounts[0].id) : '',
  );
  const [assetId, setAssetId] = useState<string>(
    assets.length > 0 ? String(assets[0].id) : '',
  );
  const [txType, setTxType] = useState<string>(TX_TYPES[0]);
  const [direction, setDirection] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [basePrice, setBasePrice] = useState<string>('');
  const [feeAssetId, setFeeAssetId] = useState<string>('');
  const [feeQuantity, setFeeQuantity] = useState<string>('');
  const [externalReference, setExternalReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload = {
      date_time: dateTime,
      account_id: accountId ? Number(accountId) : undefined,
      asset_id: assetId ? Number(assetId) : undefined,
      quantity: quantity.trim(),
      base_price: basePrice.trim(),
      tx_type: txType,
      direction: direction || null,
      fee_asset_id: feeAssetId ? Number(feeAssetId) : null,
      fee_quantity: feeQuantity.trim() === '' ? null : feeQuantity.trim(),
      external_reference: externalReference.trim() || null,
      notes: notes.trim() || null,
    };

    try {
      const response = await fetch('/api/ledger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error || 'Failed to create transaction.');
        setSubmitting(false);
        return;
      }

      // Clear core fields but keep context (date, account, asset, txType)
      setQuantity('');
      setBasePrice('');
      setFeeAssetId('');
      setFeeQuantity('');
      setExternalReference('');
      setNotes('');
      setSubmitting(false);

      router.refresh();
    } catch {
      setError('Unexpected error. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Date / Time */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Date / Time
          </label>
          <input
            type="datetime-local"
            value={dateTime}
            onChange={(event) => setDateTime(event.target.value)}
            required
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Account */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Account
          </label>
          <select
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            required
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {accounts.length === 0 ? (
              <option value="">No accounts available</option>
            ) : (
              accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Asset */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Asset
          </label>
          <select
            value={assetId}
            onChange={(event) => setAssetId(event.target.value)}
            required
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {assets.length === 0 ? (
              <option value="">No assets available</option>
            ) : (
              assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.symbol} ({asset.name})
                </option>
              ))
            )}
          </select>
        </div>

        {/* Tx Type */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Transaction Type
          </label>
          <select
            value={txType}
            onChange={(event) => setTxType(event.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {TX_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {/* Direction */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Direction
          </label>
          <select
            value={direction}
            onChange={(event) => setDirection(event.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Not set</option>
            {DIRECTIONS.map((dir) => (
              <option key={dir} value={dir}>
                {dir}
              </option>
            ))}
          </select>
        </div>

        {/* Quantity */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Quantity
          </label>
          <input
            type="number"
            step="0.00000001"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            required
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="e.g. 1.2345"
          />
        </div>

        {/* Base Price */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Base Price
          </label>
          <input
            type="number"
            step="0.00000001"
            value={basePrice}
            onChange={(event) => setBasePrice(event.target.value)}
            required
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Price in base currency"
          />
        </div>

        {/* Fee Asset */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Fee Asset
          </label>
          <select
            value={feeAssetId}
            onChange={(event) => setFeeAssetId(event.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="">None</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.symbol} ({asset.name})
              </option>
            ))}
          </select>
        </div>

        {/* Fee Quantity */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Fee Quantity
          </label>
          <input
            type="number"
            step="0.00000001"
            value={feeQuantity}
            onChange={(event) => setFeeQuantity(event.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Optional"
          />
        </div>

        {/* External Reference */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            External Reference
          </label>
          <input
            type="text"
            value={externalReference}
            onChange={(event) => setExternalReference(event.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Optional reference or ID"
          />
        </div>

        {/* Notes */}
        <div className="space-y-2 md:col-span-2">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
            placeholder="Optional notes about this transaction"
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
          type="submit"
          disabled={submitting}
          className="text-sm px-3 py-2 rounded-lg border border-blue-500/40 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700/60 text-white font-medium transition-colors"
        >
          {submitting ? 'Adding...' : 'Add Transaction'}
        </button>
      </div>
    </form>
  );
}