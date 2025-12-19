'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ALLOWED_TX_TYPES, LedgerTxType, shortenLedgerPrecision } from '@/lib/ledger';

type LedgerFormMode = 'create' | 'edit';

export type LedgerFormInitialValues = {
  date_time: string;
  account_id: number;
  asset_id: number;
  quantity: string;
  tx_type: string;
  external_reference: string | null;
  notes: string | null;
  unit_price_in_base?: string | null;
  total_value_in_base?: string | null;
  fee_in_base?: string | null;
};

type LedgerFormProps = {
  mode: LedgerFormMode;
  transactionId?: number;
  initialValues?: LedgerFormInitialValues;
  accounts: { id: number; name: string; status?: string; usageCount?: number }[];
  assets: { id: number; symbol: string; name: string; usageCount?: number }[];
};

type TxType = LedgerTxType;

const TRADE_TYPES: TxType[] = ['TRADE', 'NFT_TRADE', 'OFFLINE_TRADE', 'HEDGE'];

type ValuationFieldKey =
  | 'unit_price_in_base'
  | 'total_value_in_base'
  | 'fee_in_base';

type ValuationInputs = {
  unitPrice: string;
  totalValue: string;
  fee: string;
};

type ValuationPayload = Partial<Record<ValuationFieldKey, string | null>>;

function buildValuationPayload(
  values: ValuationInputs,
  options?: { allowNull?: boolean },
): ValuationPayload {
  const payload: ValuationPayload = {};

  const setField = (field: ValuationFieldKey, value: string) => {
    const trimmed = value?.trim() ?? '';
    if (trimmed) {
      payload[field] = trimmed;
      return;
    }
    if (options?.allowNull) {
      payload[field] = null;
    }
  };

  setField('unit_price_in_base', values.unitPrice);
  setField('total_value_in_base', values.totalValue);
  setField('fee_in_base', values.fee);

  return payload;
}

const TX_TYPE_LABELS: Record<LedgerTxType, string> = {
  DEPOSIT: 'Deposit',
  WITHDRAWAL: 'Withdrawal',
  TRADE: 'Trade',
  YIELD: 'Yield',
  NFT_TRADE: 'NFT Trade',
  OFFLINE_TRADE: 'Offline Trade',
  OTHER: 'Other',
  HEDGE: 'Hedge',
  COST_BASIS_RESET: 'Cost Basis Reset',
};

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

function parseFiniteNumber(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
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
    if (accounts.length > 0) {
      // Find the account with the highest usage count, fallback to first if all have 0
      const mostUsedAccount = accounts.reduce((prev, current) =>
        (current.usageCount || 0) > (prev.usageCount || 0) ? current : prev
      );
      return String(mostUsedAccount.id);
    }
    return '';
  });

  const [assetId, setAssetId] = useState<string>(() => {
    if (initialValues?.asset_id != null) {
      return String(initialValues.asset_id);
    }
    if (assets.length > 0) {
      // Find the asset with the highest usage count, fallback to first if all have 0
      const mostUsedAsset = assets.reduce((prev, current) =>
        (current.usageCount || 0) > (prev.usageCount || 0) ? current : prev
      );
      return String(mostUsedAsset.id);
    }
    return '';
  });

  const [txType, setTxType] = useState<TxType>(() => {
    if (initialValues?.tx_type) {
      return (initialValues.tx_type.toUpperCase() as TxType) || ALLOWED_TX_TYPES[0];
    }
    return ALLOWED_TX_TYPES[0];
  });

  const [quantity, setQuantity] = useState<string>(initialValues?.quantity ?? '');
  const [externalReference, setExternalReference] = useState<string>(
    initialValues?.external_reference ?? '',
  );
  const [notes, setNotes] = useState<string>(initialValues?.notes ?? '');

  const [unitPrice, setUnitPrice] = useState<string>(
    initialValues?.unit_price_in_base ?? '',
  );
  const [totalValue, setTotalValue] = useState<string>(
    initialValues?.total_value_in_base ?? '',
  );
  const [fee, setFee] = useState<string>(initialValues?.fee_in_base ?? '');

  const [unitPriceTouched, setUnitPriceTouched] = useState<boolean>(false);
  const [totalValueTouched, setTotalValueTouched] = useState<boolean>(false);
  const [applyResetToAllAccounts, setApplyResetToAllAccounts] = useState<boolean>(false);

  const [assetInId, setAssetInId] = useState<string>(() => {
    if (assets.length > 0) {
      // Find the asset with the highest usage count for trade form
      const mostUsedAsset = assets.reduce((prev, current) =>
        (current.usageCount || 0) > (prev.usageCount || 0) ? current : prev
      );
      return String(mostUsedAsset.id);
    }
    return '';
  });
  const [quantityIn, setQuantityIn] = useState<string>('');
  const [assetOutId, setAssetOutId] = useState<string>(() => {
    if (assets.length > 0) {
      // Find the asset with the highest usage count for trade form
      const mostUsedAsset = assets.reduce((prev, current) =>
        (current.usageCount || 0) > (prev.usageCount || 0) ? current : prev
      );
      return String(mostUsedAsset.id);
    }
    return '';
  });
  const [quantityOut, setQuantityOut] = useState<string>('');

  const [assetInUnitPrice, setAssetInUnitPrice] = useState<string>('');
  const [assetInTotalValue, setAssetInTotalValue] = useState<string>('');
  const [assetInFee, setAssetInFee] = useState<string>('');
  const [assetOutUnitPrice, setAssetOutUnitPrice] = useState<string>('');
  const [assetOutTotalValue, setAssetOutTotalValue] = useState<string>('');
  const [assetOutFee, setAssetOutFee] = useState<string>('');

  const [assetInUnitPriceTouched, setAssetInUnitPriceTouched] = useState<boolean>(false);
  const [assetInTotalValueTouched, setAssetInTotalValueTouched] = useState<boolean>(false);
  const [assetOutUnitPriceTouched, setAssetOutUnitPriceTouched] = useState<boolean>(false);
  const [assetOutTotalValueTouched, setAssetOutTotalValueTouched] = useState<boolean>(false);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isTradeType = !isEditMode && TRADE_TYPES.includes(txType);
  const isCostBasisReset = txType === 'COST_BASIS_RESET';

  useEffect(() => {
    if (isCostBasisReset) {
      if (quantity !== '0') {
        setQuantity('0');
      }
      return;
    }

    const qty = parseFiniteNumber(quantity);
    if (qty === null || qty === 0) {
      return;
    }

    const unit = parseFiniteNumber(unitPrice);
    const total = parseFiniteNumber(totalValue);

    if (!unitPriceTouched && (unitPrice.trim() === '' || unit === null) && total !== null) {
      const derivedUnit = total / qty;
      if (Number.isFinite(derivedUnit)) {
        setUnitPrice(derivedUnit.toString());
      }
      return;
    }

    if (!totalValueTouched && (totalValue.trim() === '' || total === null) && unit !== null) {
      const derivedTotal = qty * unit;
      if (Number.isFinite(derivedTotal)) {
        setTotalValue(derivedTotal.toString());
      }
    }
  }, [isCostBasisReset, quantity, unitPrice, totalValue, unitPriceTouched, totalValueTouched]);

  useEffect(() => {
    if (!isTradeType) {
      return;
    }

    const qtyIn = parseFiniteNumber(quantityIn);
    if (qtyIn !== null && qtyIn !== 0) {
      const unitIn = parseFiniteNumber(assetInUnitPrice);
      const totalIn = parseFiniteNumber(assetInTotalValue);

      if (
        !assetInUnitPriceTouched &&
        (assetInUnitPrice.trim() === '' || unitIn === null) &&
        totalIn !== null
      ) {
        const derived = totalIn / qtyIn;
        if (Number.isFinite(derived)) {
          setAssetInUnitPrice(derived.toString());
        }
      } else if (
        !assetInTotalValueTouched &&
        (assetInTotalValue.trim() === '' || totalIn === null) &&
        unitIn !== null
      ) {
        const derived = qtyIn * unitIn;
        if (Number.isFinite(derived)) {
          setAssetInTotalValue(derived.toString());
        }
      }
    }

    const qtyOutRaw = parseFiniteNumber(quantityOut);
    const qtyOut = qtyOutRaw === null ? null : -Math.abs(qtyOutRaw);
    if (qtyOut !== null && qtyOut !== 0) {
      const unitOut = parseFiniteNumber(assetOutUnitPrice);
      const totalOut = parseFiniteNumber(assetOutTotalValue);

      if (
        !assetOutUnitPriceTouched &&
        (assetOutUnitPrice.trim() === '' || unitOut === null) &&
        totalOut !== null
      ) {
        const derived = totalOut / qtyOut;
        if (Number.isFinite(derived)) {
          setAssetOutUnitPrice(derived.toString());
        }
      } else if (
        !assetOutTotalValueTouched &&
        (assetOutTotalValue.trim() === '' || totalOut === null) &&
        unitOut !== null
      ) {
        const derived = qtyOut * unitOut;
        if (Number.isFinite(derived)) {
          setAssetOutTotalValue(derived.toString());
        }
      }
    }
  }, [
    isTradeType,
    quantityIn,
    assetInUnitPrice,
    assetInTotalValue,
    assetInUnitPriceTouched,
    assetInTotalValueTouched,
    quantityOut,
    assetOutUnitPrice,
    assetOutTotalValue,
    assetOutUnitPriceTouched,
    assetOutTotalValueTouched,
  ]);

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
      const valuationPayload = buildValuationPayload(
        { unitPrice, totalValue, fee },
        { allowNull: isEditMode },
      );

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

        // Parse the quantity to ensure it's a valid number
        const qtyNumber = Number(trimmedQuantity);
        if (!Number.isFinite(qtyNumber)) {
          setError('Quantity must be a valid number.');
          setSubmitting(false);
          return;
        }

        const basePayload = buildCommonPayload({
          assetId: assetId ? Number(assetId) : NaN,
          quantity: trimmedQuantity,
        });

        if (!Number.isFinite(basePayload.asset_id as number)) {
          setError('Asset is required.');
          setSubmitting(false);
          return;
        }

        const payload = {
          ...basePayload,
          ...valuationPayload,
        };

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

        const payload = buildCommonPayload({
          assetId: assetInNumeric,
          quantity: Math.abs(inQtyNumber).toString(),
        });

        const payloadOut = buildCommonPayload({
          assetId: assetOutNumeric,
          quantity: (-Math.abs(outQtyNumber)).toString(),
        });

        // Use the new multi-leg API
        const assetInValuations = buildValuationPayload({
          unitPrice: assetInUnitPrice,
          totalValue: assetInTotalValue,
          fee: assetInFee,
        });
        const assetOutValuations = buildValuationPayload({
          unitPrice: assetOutUnitPrice,
          totalValue: assetOutTotalValue,
          fee: assetOutFee,
        });

        const tradePayload = {
          ...buildCommonPayload({
            assetId: assetInNumeric, // This will be ignored for multi-leg trades
            quantity: '0', // This will be ignored for multi-leg trades
          }),
          legs: [
            {
              asset_id: assetInNumeric,
              quantity: Math.abs(inQtyNumber).toString(),
              ...assetInValuations,
            },
            {
              asset_id: assetOutNumeric,
              quantity: (-Math.abs(outQtyNumber)).toString(),
              ...assetOutValuations,
            },
          ],
        };

        const response = await fetch('/api/ledger', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(tradePayload),
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          setError(data?.error || 'Failed to create trade.');
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
      let signedQtyNumber = 0;
      if (!isCostBasisReset) {
        const qtyRaw = quantity.trim();
        if (!qtyRaw) {
          setError('Quantity is required.');
          setSubmitting(false);
          return;
        }

        const qtyNumber = Number(qtyRaw);
        if (!Number.isFinite(qtyNumber)) {
          setError('Quantity must be a valid number.');
          setSubmitting(false);
          return;
        }

        // For non-trade types in create mode, apply sign based on transaction type
        if (txType === 'WITHDRAWAL') {
          signedQtyNumber = -Math.abs(qtyNumber);
        } else {
          signedQtyNumber = Math.abs(qtyNumber);
        }
      }

      const assetNumeric = assetId ? Number(assetId) : NaN;
      if (!Number.isFinite(assetNumeric)) {
        setError('Asset is required.');
        setSubmitting(false);
        return;
      }

      if (isCostBasisReset && applyResetToAllAccounts) {
        const totalValueTrimmed = totalValue.trim();
        const unitPriceTrimmed = unitPrice.trim();
        if (!totalValueTrimmed && !unitPriceTrimmed) {
          setError('Enter either unit price or total value for cost basis reset.');
          setSubmitting(false);
          return;
        }

        let response: Response;
        try {
          response = await fetch('/api/ledger/cost-basis-reset', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              date_time: dateTime,
              asset_id: assetNumeric,
              unit_price_in_base: unitPriceTrimmed || null,
              total_value_in_base: totalValueTrimmed || null,
              external_reference: externalReference.trim() || null,
              notes: notes.trim() || null,
            }),
          });
        } catch (fetchError) {
          console.error(fetchError);
          setError('Network error calling bulk cost basis reset endpoint.');
          setSubmitting(false);
          return;
        }

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          let errorMessage = 'Failed to create bulk cost basis reset.';
          try {
            const parsed = JSON.parse(text) as { error?: string };
            if (parsed?.error) {
              errorMessage = parsed.error;
            }
          } catch {
            if (text.trim()) {
              errorMessage = text.trim();
            }
          }
          setError(errorMessage);
          setSubmitting(false);
          return;
        }

        const createdPayload = (await response.json().catch(() => null)) as
          | { created?: number }
          | null;

        if (!createdPayload || typeof createdPayload.created !== 'number') {
          setError('Bulk cost basis reset succeeded but returned unexpected response.');
          setSubmitting(false);
          return;
        }

        // Clear core fields but keep context (date, asset, txType)
        setExternalReference('');
        setNotes('');
        setSubmitting(false);
        router.refresh();
        return;
      }

      const basePayload = buildCommonPayload({
        assetId: assetNumeric,
        quantity: signedQtyNumber.toString(),
      });
      if (isCostBasisReset) {
        const totalValueTrimmed = totalValue.trim();
        const unitPriceTrimmed = unitPrice.trim();
        if (!totalValueTrimmed && !unitPriceTrimmed) {
          setError('Enter either unit price or total value for cost basis reset.');
          setSubmitting(false);
          return;
        }
      }
      const payload = {
        ...basePayload,
        ...valuationPayload,
      };

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
    } catch (submitError) {
      console.error(submitError);
      const message =
        submitError instanceof Error && submitError.message
          ? submitError.message
          : 'Unexpected error. Please try again.';
      setError(message);
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
            {ALLOWED_TX_TYPES.map((type) => (
              <option key={type} value={type}>
                {TX_TYPE_LABELS[type]}
              </option>
            ))}
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
                type="text"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                onBlur={(event) => {
                  if (event.target.value) {
                    setQuantity(shortenLedgerPrecision(event.target.value));
                  }
                }}
                required={!isCostBasisReset}
                disabled={isCostBasisReset}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder={
                  isEditMode
                    ? 'Transaction amount'
                    : isCostBasisReset
                      ? '0 (reset does not change quantity)'
                      : txType === 'WITHDRAWAL'
                        ? 'Size of withdrawal (positive)'
                        : 'Size of deposit / yield'
                }
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  Valuation (base currency)
                </label>
                <span className="text-xs text-zinc-500">Optional</span>
              </div>
              {isCostBasisReset && !isEditMode && (
                <label className="flex items-center gap-2 text-xs text-zinc-400 mb-2">
                  <input
                    type="checkbox"
                    checked={applyResetToAllAccounts}
                    onChange={(event) => setApplyResetToAllAccounts(event.target.checked)}
                    className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-blue-500 focus:ring-blue-500"
                  />
                  Apply reset across all accounts holding this asset (allocates by quantity at time T)
                </label>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Unit price {isCostBasisReset ? '(optional)' : ''}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={unitPrice}
                    onChange={(event) => {
                      setUnitPriceTouched(true);
                      setUnitPrice(event.target.value);
                    }}
                    onBlur={(event) => {
                      if (event.target.value) {
                        setUnitPrice(shortenLedgerPrecision(event.target.value));
                      }
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder={isCostBasisReset ? 'e.g. 45000 (per unit)' : 'Optional'}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Total value {isCostBasisReset ? '(optional)' : ''}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={totalValue}
                    onChange={(event) => {
                      setTotalValueTouched(true);
                      setTotalValue(event.target.value);
                    }}
                    onBlur={(event) => {
                      if (event.target.value) {
                        setTotalValue(shortenLedgerPrecision(event.target.value));
                      }
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder={
                      isCostBasisReset ? 'e.g. 45000 (total) or leave blank to derive from unit price' : 'Optional'
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Fee
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={fee}
                    onChange={(event) => setFee(event.target.value)}
                    onBlur={(event) => {
                      if (event.target.value) {
                        setFee(shortenLedgerPrecision(event.target.value));
                      }
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Optional"
                  />
                </div>
              </div>
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
                Quantity Acquired
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={quantityIn}
                onChange={(event) => setQuantityIn(event.target.value)}
                onBlur={(event) => {
                  if (event.target.value) {
                    setQuantityIn(shortenLedgerPrecision(event.target.value));
                  }
                }}
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
                Quantity Spent
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={quantityOut}
                onChange={(event) => setQuantityOut(event.target.value)}
                onBlur={(event) => {
                  if (event.target.value) {
                    setQuantityOut(shortenLedgerPrecision(event.target.value));
                  }
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="e.g. 200000 (for -200000 USDT)"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  Asset In valuation
                </label>
                <span className="text-xs text-zinc-500">Optional</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Unit price
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={assetInUnitPrice}
                    onChange={(event) => {
                      setAssetInUnitPriceTouched(true);
                      setAssetInUnitPrice(event.target.value);
                    }}
                    onBlur={(event) => {
                      if (event.target.value) {
                        setAssetInUnitPrice(shortenLedgerPrecision(event.target.value));
                      }
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Total value
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={assetInTotalValue}
                    onChange={(event) => {
                      setAssetInTotalValueTouched(true);
                      setAssetInTotalValue(event.target.value);
                    }}
                    onBlur={(event) => {
                      if (event.target.value) {
                        setAssetInTotalValue(shortenLedgerPrecision(event.target.value));
                      }
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Fee
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={assetInFee}
                    onChange={(event) => setAssetInFee(event.target.value)}
                    onBlur={(event) => {
                      if (event.target.value) {
                        setAssetInFee(shortenLedgerPrecision(event.target.value));
                      }
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Optional"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  Asset Out valuation
                </label>
                <span className="text-xs text-zinc-500">Optional</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Unit price
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={assetOutUnitPrice}
                    onChange={(event) => {
                      setAssetOutUnitPriceTouched(true);
                      setAssetOutUnitPrice(event.target.value);
                    }}
                    onBlur={(event) => {
                      if (event.target.value) {
                        setAssetOutUnitPrice(shortenLedgerPrecision(event.target.value));
                      }
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Total value
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={assetOutTotalValue}
                    onChange={(event) => {
                      setAssetOutTotalValueTouched(true);
                      setAssetOutTotalValue(event.target.value);
                    }}
                    onBlur={(event) => {
                      if (event.target.value) {
                        setAssetOutTotalValue(shortenLedgerPrecision(event.target.value));
                      }
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Fee
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={assetOutFee}
                    onChange={(event) => setAssetOutFee(event.target.value)}
                    onBlur={(event) => {
                      if (event.target.value) {
                        setAssetOutFee(shortenLedgerPrecision(event.target.value));
                      }
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Optional"
                  />
                </div>
              </div>
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
