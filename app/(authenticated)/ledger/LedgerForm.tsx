'use client';

import React, { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

type LedgerFormMode = 'create' | 'edit';

export type LedgerFormInitialValues = {
  date_time: string;
  account_id: number;
  asset_id: number;
  quantity: string;
  tx_type: string;
  external_reference: string | null;
  notes: string | null;
};

type LedgerFormProps = {
  mode: LedgerFormMode;
  transactionId?: number;
  initialValues?: LedgerFormInitialValues;
  accounts: { id: number; name: string }[];
  assets: { id: number; symbol: string; name: string }[];
};

const TX_TYPES = [
  'DEPOSIT',
  'WITHDRAWAL',
  'TRADE',
  'YIELD',
  'NFT_TRADE',
  'OFFLINE_TRADE',
  'OTHER',
] as const;

type TxType = (typeof TX_TYPES)[number];

const TRADE_TYPES: TxType[] = ['TRADE', 'NFT_TRADE', 'OFFLINE_TRADE'];

function getDefaultDateTimeLocal(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  const local = new Date(now.getTime() - offsetMs);
  return local.toISOString().slice(0, 16);
}

function toLocalDateTimeInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return getDefaultDateTimeLocal();
  }
  const offsetMs = date.getTimezoneOffset() * 60000;
  const local = new Date(date.getTime() - offsetMs);
  return local.toISOString().slice(0, 16);
}

export function LedgerForm({
  mode,
  transactionId,
  initialValues,
  accounts,
  assets,
}: LedgerFormProps) {
  const router = useRouter();
  const isEditMode = mode === 'edit';

  const [dateTime, setDateTime] = useState<string>(() => {
    if (initialValues?.date_time) {
      return toLocalDateTimeInput(initialValues.date_time);
    }
    return getDefaultDateTimeLocal();
  });

  const [accountId, setAccountId] = useState<string>(() => {
    if (initialValues?.account_id != null) {
      return String(initialValues.account_id);
    }
    return accounts.length > 0 ? String(accounts[0].id) : '';
  });

  const [assetId, setAssetId] = useState<string>(() => {
    if (initialValues?.asset_id != null) {
      return String(initialValues.asset_id);
    }
    return assets.length > 0 ? String(assets[0].id) : '';
  });

  const [txType, setTxType] = useState<TxType>(() => {
    if (initialValues?.tx_type) {
      return (initialValues.tx_type.toUpperCase() as TxType) || TX_TYPES[0];
    }
    return TX_TYPES[0];
  });

  const [quantity, setQuantity] = useState<string>(initialValues?.quantity ?? '');
  const [externalReference, setExternalReference] = useState<string>(
    initialValues?.external_reference ?? '',
  );
  const [notes, setNotes] = useState<string>(initialValues?.notes ?? '');

  const [assetInId, setAssetInId] = useState<string>(
    assets.length > 0 ? String(assets[0].id) : '',
  );
  const [quantityIn, setQuantityIn] = useState<string>('');
  const [assetOutId, setAssetOutId] = useState<string>(
    assets.length > 0 ? String(assets[0].id) : '',
  );
  const [quantityOut, setQuantityOut] = useState<string>('');

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isTradeType = !isEditMode && TRADE_TYPES.includes(txType);

  const buildCommonPayload = (overrides: {
    assetId: number;
    quantity: string;
  }) => {
    const trimmedExternalRef = externalReference.trim();
    const trimmedNotes = notes.trim();

    return {
      date_time: dateTime,
      account_id: accountId ? Number(accountId) : undefined,
      asset_id: overrides.assetId,
      quantity: overrides.quantity,
      tx_type: txType,
      external_reference: trimmedExternalRef || null,
      notes: trimmedNotes || null,
    };
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    if (!dateTime || !accountId) {
      setError('Date/time and account are required.');
      setSubmitting(false);
      return;
    }

    try {
      if (isEditMode) {
        if (!transactionId) {
          setError('Missing transaction id for edit.');
          setSubmitting(false);
          return;
        }

        const trimmedQuantity = quantity.trim();
        if (!trimmedQuantity) {
          setError('Quantity is required.');
          setSubmitting(false);
          return;
        }

        const payload = buildCommonPayload({
          assetId: assetId ? Number(assetId) : NaN,
          quantity: trimmedQuantity,
        });

        if (!Number.isFinite(payload.asset_id as number)) {
          setError('Asset is required.');
          setSubmitting(false);
          return;
        }

        const response = await fetch(`/api/ledger/${transactionId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          setError(data?.error || 'Failed to save transaction.');
          setSubmitting(false);
          return;
        }

        router.push('/ledger');
        router.refresh();
        return;
      }

      // Create mode
      if (isTradeType) {
        // Double-entry trades: one positive leg (asset in) and one negative leg (asset out)
        const inQtyRaw = quantityIn.trim();
        const outQtyRaw = quantityOut.trim();

        if (!assetInId || !assetOutId || !inQtyRaw || !outQtyRaw) {
          setError(
            'Asset In, Quantity In, Asset Out, and Quantity Out are required for trades.',
          );
          setSubmitting(false);
          return;
        }

        const inQtyNumber = Number(inQtyRaw);
        const outQtyNumber = Number(outQtyRaw);

        if (
          !Number.isFinite(inQtyNumber) ||
          !Number.isFinite(outQtyNumber) ||
          inQtyNumber <= 0 ||
          outQtyNumber <= 0
        ) {
          setError('Trade quantities must be positive numbers.');
          setSubmitting(false);
          return;
        }

        const assetInNumeric = Number(assetInId);
        const assetOutNumeric = Number(assetOutId);

        if (!Number.isFinite(assetInNumeric) || !Number.isFinite(assetOutNumeric)) {
          setError('Valid assets are required for trades.');
          setSubmitting(false);
          return;
        }

        const payloadIn = buildCommonPayload({
          assetId: assetInNumeric,
          quantity: Math.abs(inQtyNumber).toString(),
        });

        const payloadOut = buildCommonPayload({
          assetId: assetOutNumeric,
          quantity: (-Math.abs(outQtyNumber)).toString(),
        });

        const firstResponse = await fetch('/api/ledger', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payloadIn),
        });

        if (!firstResponse.ok) {
          const data = (await firstResponse.json().catch(() => null)) as
            | { error?: string }
            | null;
          setError(data?.error || 'Failed to create trade (asset in).');
          setSubmitting(false);
          return;
        }

        const secondResponse = await fetch('/api/ledger', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payloadOut),
        });

        if (!secondResponse.ok) {
          const data = (await secondResponse.json().catch(() => null)) as
            | { error?: string }
            | null;
          setError(data?.error || 'Failed to create trade (asset out).');
          setSubmitting(false);
          return;
        }

        // Clear trade-specific quantities but keep context (date, account, txType)
        setQuantityIn('');
        setQuantityOut('');
        setSubmitting(false);
        router.refresh();
        return;
      }

      // Non-trade types: single signed quantity based on tx_type semantics
      const qtyRaw = quantity.trim();
      if (!qtyRaw) {
        setError('Quantity is required.');
        setSubmitting(false);
        return;
      }

      const qtyNumber = Number(qtyRaw);
      if (!Number.isFinite(qtyNumber) || qtyNumber <= 0) {
        setError('Quantity must be a positive number.');
        setSubmitting(false);
        return;
      }

      let signedQtyNumber = Math.abs(qtyNumber);
      if (txType === 'WITHDRAWAL') {
        signedQtyNumber = -Math.abs(qtyNumber);
      }

      const assetNumeric = assetId ? Number(assetId) : NaN;
      if (!Number.isFinite(assetNumeric)) {
        setError('Asset is required.');
        setSubmitting(false);
        return;
      }

      const payload = buildCommonPayload({
        assetId: assetNumeric,
        quantity: signedQtyNumber.toString(),
      });

      const response = await fetch('/api/ledger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error || 'Failed to create transaction.');
        setSubmitting(false);
        return;
      }

      // Clear core fields but keep context (date, account, txType)
      setQuantity('');
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

        {/* Tx Type */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Transaction Type
          </label>
          <select
            value={txType}
            onChange={(event) => setTxType(event.target.value as TxType)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            disabled={isEditMode}
          >
            <option value="DEPOSIT">Deposit</option>
            <option value="WITHDRAWAL">Withdrawal</option>
            <option value="TRADE">Trade</option>
            <option value="YIELD">Yield</option>
            <option value="NFT_TRADE">NFT Trade</option>
            <option value="OFFLINE_TRADE">Offline Trade</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        {/* Non-trade asset + quantity */}
        {!isTradeType && (
          <>
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

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Quantity
              </label>
              <input
                type="number"
                step="0.00000001"
                min={0}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                required
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder={
                  txType === 'WITHDRAWAL'
                    ? 'Size of withdrawal (positive)'
                    : 'Size of deposit / yield'
                }
              />
            </div>
          </>
        )}

        {/* Trade-specific fields (create mode only) */}
        {isTradeType && (
          <>
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Asset In (acquired)
              </label>
              <select
                value={assetInId}
                onChange={(event) => setAssetInId(event.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.symbol} ({asset.name})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Quantity In
              </label>
              <input
                type="number"
                step="0.00000001"
                min={0}
                value={quantityIn}
                onChange={(event) => setQuantityIn(event.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="e.g. 2 (for +2 BTC)"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Asset Out (spent)
              </label>
              <select
                value={assetOutId}
                onChange={(event) => setAssetOutId(event.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.symbol} ({asset.name})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Quantity Out
              </label>
              <input
                type="number"
                step="0.00000001"
                min={0}
                value={quantityOut}
                onChange={(event) => setQuantityOut(event.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="e.g. 200000 (for -200000 USDT)"
              />
            </div>
          </>
        )}

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
          {submitting
            ? isEditMode
              ? 'Saving...'
              : isTradeType
              ? 'Adding Trade...'
              : 'Adding...'
            : isEditMode
            ? 'Save Changes'
            : 'Add Transaction'}
        </button>
      </div>
    </form>
  );
}