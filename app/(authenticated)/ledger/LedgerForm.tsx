'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ALLOWED_TX_TYPES, LedgerTxType, shortenLedgerPrecision, parseLedgerDecimal, decimalValueToNumber } from '@/lib/ledger';

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
const TRANSFER_TYPES: TxType[] = ['TRANSFER'];
const VALUATION_REQUIRED_TYPES: TxType[] = ['DEPOSIT', 'YIELD', ...TRADE_TYPES];
const ZERO_COST_BASIS_TYPES: TxType[] = ['DEPOSIT', 'YIELD'];

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
      // Parse and re-format to ensure comma-formatted input is normalized
      const parsed = parseLedgerDecimal(trimmed);
      if (parsed !== null && parsed !== undefined) {
        payload[field] = parsed;
      } else {
        // If parsing fails, use original trimmed value
        payload[field] = trimmed;
      }
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
  TRANSFER: 'Transfer',
  RECONCILIATION: 'Reconciliation (True-Up)',
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

// Helper function to parse numbers with comma support for auto-calculations
function parseFiniteNumberWithCommas(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  // Use parseLedgerDecimal for comma tolerance, then convert to number
  const parsed = parseLedgerDecimal(trimmed);
  const number = decimalValueToNumber(parsed);
  return number !== null && Number.isFinite(number) ? number : null;
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
  const [zeroCostBasis, setZeroCostBasis] = useState<boolean>(() => {
    if (!initialValues?.tx_type) {
      return false;
    }
    const initialTxType = initialValues.tx_type.toUpperCase() as TxType;
    if (!ZERO_COST_BASIS_TYPES.includes(initialTxType)) {
      return false;
    }
    return (
      initialValues.unit_price_in_base === '0' ||
      initialValues.total_value_in_base === '0'
    );
  });

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

  // Transfer-specific state
  const [transferFromAccountId, setTransferFromAccountId] = useState<string>(() => {
    if (mode === 'edit' && initialValues && TRANSFER_TYPES.includes(initialValues.tx_type as TxType)) {
      const qty = parseFloat(initialValues.quantity);
      if (qty < 0) return String(initialValues.account_id);
    }
    return '';
  });
  const [transferToAccountId, setTransferToAccountId] = useState<string>(() => {
    if (mode === 'edit' && initialValues && TRANSFER_TYPES.includes(initialValues.tx_type as TxType)) {
      const qty = parseFloat(initialValues.quantity);
      if (qty >= 0) return String(initialValues.account_id);
    }
    return '';
  });
  const [transferAssetId, setTransferAssetId] = useState<string>(() => {
    if (mode === 'edit' && initialValues && TRANSFER_TYPES.includes(initialValues.tx_type as TxType)) {
      return String(initialValues.asset_id);
    }
    return '';
  });
  const [transferQuantity, setTransferQuantity] = useState<string>(() => {
    if (mode === 'edit' && initialValues && TRANSFER_TYPES.includes(initialValues.tx_type as TxType)) {
      return Math.abs(parseFloat(initialValues.quantity)).toString();
    }
    return '';
  });
  const [transferUnitPrice, setTransferUnitPrice] = useState<string>(() => {
    if (mode === 'edit' && initialValues && TRANSFER_TYPES.includes(initialValues.tx_type as TxType)) {
      return initialValues.unit_price_in_base || '';
    }
    return '';
  });
  const [transferTotalValue, setTransferTotalValue] = useState<string>(() => {
    if (mode === 'edit' && initialValues && TRANSFER_TYPES.includes(initialValues.tx_type as TxType)) {
      return initialValues.total_value_in_base || '';
    }
    return '';
  });
  const [transferFee, setTransferFee] = useState<string>(() => {
    if (mode === 'edit' && initialValues && TRANSFER_TYPES.includes(initialValues.tx_type as TxType)) {
      return initialValues.fee_in_base || '';
    }
    return '';
  });
  const [transferUnitPriceTouched, setTransferUnitPriceTouched] = useState<boolean>(false);
  const [transferTotalValueTouched, setTransferTotalValueTouched] = useState<boolean>(false);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isTradeType = !isEditMode && TRADE_TYPES.includes(txType);
  const isTransferType = TRANSFER_TYPES.includes(txType);
  const isCostBasisReset = txType === 'COST_BASIS_RESET';
  const isReconciliationType = txType === 'RECONCILIATION' && !isEditMode;
  const isValuationRequired = VALUATION_REQUIRED_TYPES.includes(txType) && !isCostBasisReset;
  const canZeroCostBasis =
    ZERO_COST_BASIS_TYPES.includes(txType) &&
    !isCostBasisReset &&
    !isTransferType &&
    !isTradeType &&
    !isReconciliationType;

  useEffect(() => {
    if (isCostBasisReset) {
      if (quantity !== '0') {
        setQuantity('0');
      }
      return;
    }

    const qty = parseFiniteNumberWithCommas(quantity);
    if (qty === null || qty === 0) {
      return;
    }

    const unit = parseFiniteNumberWithCommas(unitPrice);
    const total = parseFiniteNumberWithCommas(totalValue);

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
    if (!canZeroCostBasis && zeroCostBasis) {
      setZeroCostBasis(false);
    }
  }, [canZeroCostBasis, zeroCostBasis]);

  useEffect(() => {
    // Transfer-specific valuation auto-derivation
    if (isTransferType) {
      const qty = parseFiniteNumberWithCommas(transferQuantity);
      if (qty !== null && qty !== 0) {
        const unit = parseFiniteNumberWithCommas(transferUnitPrice);
        const total = parseFiniteNumberWithCommas(transferTotalValue);

        if (!transferUnitPriceTouched && (transferUnitPrice.trim() === '' || unit === null) && total !== null) {
          const derivedUnit = total / qty;
          if (Number.isFinite(derivedUnit)) {
            setTransferUnitPrice(derivedUnit.toString());
          }
        } else if (!transferTotalValueTouched && (transferTotalValue.trim() === '' || total === null) && unit !== null) {
          const derivedTotal = qty * unit;
          if (Number.isFinite(derivedTotal)) {
            setTransferTotalValue(derivedTotal.toString());
          }
        }
      }
    }
  }, [isTransferType, transferQuantity, transferUnitPrice, transferTotalValue, transferUnitPriceTouched, transferTotalValueTouched]);

  // Default transfer "From" account to the main account selection
  useEffect(() => {
    if (isTransferType && accountId && !transferFromAccountId) {
      setTransferFromAccountId(accountId);
    }
  }, [isTransferType, accountId, transferFromAccountId]);

  useEffect(() => {
    if (!isTradeType) {
      return;
    }

    const qtyIn = parseFiniteNumberWithCommas(quantityIn);
    if (qtyIn !== null && qtyIn !== 0) {
      const unitIn = parseFiniteNumberWithCommas(assetInUnitPrice);
      const totalIn = parseFiniteNumberWithCommas(assetInTotalValue);

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

    const qtyOutRaw = parseFiniteNumberWithCommas(quantityOut);
    const qtyOut = qtyOutRaw === null ? null : -Math.abs(qtyOutRaw);
    if (qtyOut !== null && qtyOut !== 0) {
      const unitOut = parseFiniteNumberWithCommas(assetOutUnitPrice);
      const totalOut = parseFiniteNumberWithCommas(assetOutTotalValue);

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
      date_time: new Date(dateTime).toISOString(),
      account_id: accountId ? Number(accountId) : undefined,
      asset_id: overrides.assetId,
      quantity: overrides.quantity,
      tx_type: txType,
      external_reference: trimmedExternalRef || null,
      notes: trimmedNotes || null,
    };
  };

  const hasValuationInput = (unitValue: string, totalValueInput: string) => {
    const unitParsed = parseLedgerDecimal(unitValue);
    const totalParsed = parseLedgerDecimal(totalValueInput);

    if (unitParsed === null || totalParsed === null) {
      return true;
    }

    return (
      decimalValueToNumber(unitParsed ?? null) !== null ||
      decimalValueToNumber(totalParsed ?? null) !== null
    );
  };

  const validateValuationInputs = (
    unitValue: string,
    totalValueInput: string,
    label: string,
  ) => {
    const unitParsed = parseLedgerDecimal(unitValue);
    const totalParsed = parseLedgerDecimal(totalValueInput);

    if (unitParsed === null || totalParsed === null) {
      return `${label}: Unit price or total value must be a valid number.`;
    }

    return null;
  };

  const isCashLikeSymbol = (symbol?: string | null) => {
    if (!symbol) {
      return false;
    }
    const normalized = symbol.toUpperCase();
    return normalized === 'USD' || normalized === 'USDT' || normalized === 'USDC';
  };

  const getValuationWarning = () => {
    if (!isValuationRequired || isCostBasisReset) {
      return null;
    }

    if (isTradeType) {
      const inQtyNumber = parseFiniteNumberWithCommas(quantityIn);
      const outQtyNumber = parseFiniteNumberWithCommas(quantityOut);
      if (inQtyNumber === null || outQtyNumber === null) {
        return null;
      }

      const assetById = new Map(assets.map((asset) => [asset.id, asset]));
      const assetInSymbol = assetInId ? assetById.get(Number(assetInId))?.symbol : null;
      const assetOutSymbol = assetOutId ? assetById.get(Number(assetOutId))?.symbol : null;
      const hasCashLeg =
        isCashLikeSymbol(assetInSymbol) || isCashLikeSymbol(assetOutSymbol);

      const assetInHasValuation = hasValuationInput(
        assetInUnitPrice,
        assetInTotalValue,
      );
      const assetOutHasValuation = hasValuationInput(
        assetOutUnitPrice,
        assetOutTotalValue,
      );

      if (!assetInHasValuation && !assetOutHasValuation && !hasCashLeg) {
        return 'Valuation is missing; cost basis may be unknown for this trade.';
      }

      return null;
    }

    const quantityNumber = parseFiniteNumberWithCommas(quantity);
    if (quantityNumber === null) {
      return null;
    }

    if (!hasValuationInput(unitPrice, totalValue)) {
      return 'Valuation is missing; cost basis may be unknown for this transaction.';
    }

    return null;
  };

  const handleZeroCostBasisChange = (checked: boolean) => {
    setZeroCostBasis(checked);
    if (checked) {
      setUnitPrice('0');
      setTotalValue('0');
      setUnitPriceTouched(true);
      setTotalValueTouched(true);
    } else {
      if (unitPrice === '0') {
        setUnitPrice('');
      }
      if (totalValue === '0') {
        setTotalValue('');
      }
    }
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

    if (isReconciliationType) {
      // Batch reconciliation mode: asset and quantity are handled by backend (zeros out account)
      try {
        const payload = {
          date_time: new Date(dateTime).toISOString(),
          account_id: Number(accountId),
          tx_type: 'RECONCILIATION',
          external_reference: externalReference.trim() || null,
          notes: notes.trim() || null,
        };

        const response = await fetch('/api/ledger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error || 'Failed to reconcile account.');
        }

        router.push('/ledger');
        router.refresh();
        return;
      } catch (e: any) {
        setError(e.message);
        setSubmitting(false);
        return;
      }
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

        let targetAssetId = assetId ? Number(assetId) : NaN;
        let targetQuantity = quantity;
        let targetValuations = { unitPrice, totalValue, fee };
        let targetAccountId = accountId;

        // If editing a transfer, map transfer fields back to payload
        if (isTransferType) {
          const qtyParsed = parseLedgerDecimal(transferQuantity);
          const qtyNumber = decimalValueToNumber(qtyParsed);

          if (qtyParsed === null || qtyParsed === undefined || qtyNumber === null || qtyNumber <= 0) {
            setError('Transfer quantity must be a positive number.');
            setSubmitting(false);
            return;
          }

          targetAssetId = transferAssetId ? Number(transferAssetId) : NaN;
          targetValuations = {
            unitPrice: transferUnitPrice,
            totalValue: transferTotalValue,
            fee: transferFee,
          };

          // Determine direction based on initial state or filled fields
          const initialQty = initialValues ? parseFloat(initialValues.quantity) : 0;
          const wasSource = initialQty < 0;

          if (wasSource) {
            // We were the source (negative). Prefer From Account.
            if (transferFromAccountId) {
              targetAccountId = transferFromAccountId;
              targetQuantity = (-Math.abs(qtyNumber)).toString();
            } else if (transferToAccountId) {
              // User presumably flipped it
              targetAccountId = transferToAccountId;
              targetQuantity = Math.abs(qtyNumber).toString();
            } else {
              setError('From Account is required for this transfer leg.');
              setSubmitting(false);
              return;
            }
          } else {
            // We were destination (positive). Prefer To Account.
            if (transferToAccountId) {
              targetAccountId = transferToAccountId;
              targetQuantity = Math.abs(qtyNumber).toString();
            } else if (transferFromAccountId) {
              // User presumably flipped it
              targetAccountId = transferFromAccountId;
              targetQuantity = (-Math.abs(qtyNumber)).toString();
            } else {
              setError('To Account is required for this transfer leg.');
              setSubmitting(false);
              return;
            }
          }
        } else {
          // Standard validation for non-transfer edits
          const trimmedQuantity = quantity.trim();
          if (!trimmedQuantity) {
            setError('Quantity is required.');
            setSubmitting(false);
            return;
          }

          const qtyParsed = parseLedgerDecimal(trimmedQuantity);
          const qtyNumber = decimalValueToNumber(qtyParsed);
          if (qtyParsed === null || qtyParsed === undefined || qtyNumber === null || !Number.isFinite(qtyNumber)) {
            setError('Quantity must be a valid number.');
            setSubmitting(false);
            return;
          }
          // targetQuantity is already set to quantity string
        }

        if (!isTransferType) {
          const valuationError = validateValuationInputs(
            targetValuations.unitPrice,
            targetValuations.totalValue,
            'Valuation',
          );
          if (valuationError) {
            setError(valuationError);
            setSubmitting(false);
            return;
          }
        }

        const basePayload = buildCommonPayload({
          assetId: targetAssetId,
          quantity: targetQuantity,
        });

        // Override account if derived from transfer fields
        if (isTransferType) {
          basePayload.account_id = targetAccountId ? Number(targetAccountId) : undefined;
        }

        if (!Number.isFinite(basePayload.asset_id as number)) {
          setError('Asset is required.');
          setSubmitting(false);
          return;
        }

        const editValuationPayload = buildValuationPayload(
          targetValuations,
          { allowNull: true },
        );

        const payload = {
          ...basePayload,
          ...editValuationPayload,
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
      if (isTransferType) {
        // Transfer handling: move asset between accounts
        if (!transferFromAccountId || !transferToAccountId || !transferAssetId || !transferQuantity.trim()) {
          setError('From account, To account, Asset, and Quantity are required for transfers.');
          setSubmitting(false);
          return;
        }

        if (transferFromAccountId === transferToAccountId) {
          setError('Source and destination accounts must be different.');
          setSubmitting(false);
          return;
        }

        const qtyParsed = parseLedgerDecimal(transferQuantity);
        const qtyNumber = decimalValueToNumber(qtyParsed);
        if (qtyParsed === null || qtyParsed === undefined || qtyNumber === null || qtyNumber <= 0) {
          setError('Transfer quantity must be a positive number.');
          setSubmitting(false);
          return;
        }

        const assetNumeric = Number(transferAssetId);
        if (!Number.isFinite(assetNumeric)) {
          setError('Valid asset is required for transfer.');
          setSubmitting(false);
          return;
        }

        // Build valuation payload for transfer
        const transferValuationPayload = buildValuationPayload({
          unitPrice: transferUnitPrice,
          totalValue: transferTotalValue,
          fee: transferFee,
        });

        // Use the parsed quantity which handles commas properly
        const qtyString = qtyParsed!;
        const transferPayload = {
          ...buildCommonPayload({
            assetId: assetNumeric, // Will be ignored for multi-leg transfers
            quantity: '0', // Will be ignored for multi-leg transfers
          }),
          legs: [
            {
              account_id: Number(transferFromAccountId),
              asset_id: assetNumeric,
              quantity: (-Math.abs(qtyNumber)).toString(), // Negative for source
              ...transferValuationPayload,
            },
            {
              account_id: Number(transferToAccountId),
              asset_id: assetNumeric,
              quantity: Math.abs(qtyNumber).toString(), // Positive for destination
              ...transferValuationPayload,
            },
          ],
        };

        const response = await fetch('/api/ledger', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(transferPayload),
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          setError(data?.error || 'Failed to create transfer.');
          setSubmitting(false);
          return;
        }

        // Clear transfer-specific fields but keep context
        setTransferQuantity('');
        setTransferUnitPrice('');
        setTransferTotalValue('');
        setTransferFee('');
        setSubmitting(false);
        router.refresh();
        return;
      }

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

        const inQtyParsed = parseLedgerDecimal(inQtyRaw);
        const outQtyParsed = parseLedgerDecimal(outQtyRaw);
        const inQtyNumber = decimalValueToNumber(inQtyParsed);
        const outQtyNumber = decimalValueToNumber(outQtyParsed);

        if (
          inQtyNumber === null ||
          outQtyNumber === null ||
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

        const assetInError = validateValuationInputs(
          assetInUnitPrice,
          assetInTotalValue,
          'Asset In valuation',
        );
        if (assetInError) {
          setError(assetInError);
          setSubmitting(false);
          return;
        }

        const assetOutError = validateValuationInputs(
          assetOutUnitPrice,
          assetOutTotalValue,
          'Asset Out valuation',
        );
        if (assetOutError) {
          setError(assetOutError);
          setSubmitting(false);
          return;
        }

        const payload = buildCommonPayload({
          assetId: assetInNumeric, // This will be ignored for multi-leg trades
          quantity: '0', // This will be ignored for multi-leg trades
        });

        const payloadOut = buildCommonPayload({
          assetId: assetOutNumeric,
          quantity: (-Math.abs(outQtyNumber!)).toString(),
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
              quantity: Math.abs(inQtyNumber!).toString(),
              ...assetInValuations,
            },
            {
              asset_id: assetOutNumeric,
              quantity: (-Math.abs(outQtyNumber!)).toString(),
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

        const qtyParsed = parseLedgerDecimal(qtyRaw);
        const qtyNumber = decimalValueToNumber(qtyParsed);
        if (qtyParsed === null || qtyNumber === null || !Number.isFinite(qtyNumber)) {
          setError('Quantity must be a valid number.');
          setSubmitting(false);
          return;
        }

        // For non-trade types in create mode, apply sign based on transaction type
        if (txType === 'WITHDRAWAL') {
          signedQtyNumber = -Math.abs(qtyNumber!);
        } else if (txType === 'RECONCILIATION') {
          signedQtyNumber = qtyNumber!;
        } else {
          signedQtyNumber = Math.abs(qtyNumber!);
        }
      }

      const assetNumeric = assetId ? Number(assetId) : NaN;
      if (!Number.isFinite(assetNumeric)) {
        setError('Asset is required.');
        setSubmitting(false);
        return;
      }

      const valuationError = validateValuationInputs(
        unitPrice,
        totalValue,
        'Valuation',
      );
      if (valuationError) {
        setError(valuationError);
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
              date_time: new Date(dateTime).toISOString(),
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

  const valuationWarning = getValuationWarning();

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
          >
            {ALLOWED_TX_TYPES.map((type) => (
              <option key={type} value={type}>
                {TX_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        {/* Transfer-specific fields (create mode only) */}
        {isTransferType && (
          <>
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                From Account
              </label>
              <select
                value={transferFromAccountId}
                onChange={(event) => setTransferFromAccountId(event.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select source account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                To Account
              </label>
              <select
                value={transferToAccountId}
                onChange={(event) => setTransferToAccountId(event.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select destination account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Asset to Transfer
              </label>
              <select
                value={transferAssetId}
                onChange={(event) => setTransferAssetId(event.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select asset</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.symbol} ({asset.name})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Quantity to Transfer
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={transferQuantity}
                onChange={(event) => setTransferQuantity(event.target.value)}
                onBlur={(event) => {
                  if (event.target.value) {
                    setTransferQuantity(shortenLedgerPrecision(event.target.value));
                  }
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Amount to move (positive)"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  Transfer Valuation (base currency)
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
                    value={transferUnitPrice}
                    onChange={(event) => {
                      setTransferUnitPriceTouched(true);
                      setTransferUnitPrice(event.target.value);
                    }}
                    onBlur={(event) => {
                      if (event.target.value) {
                        setTransferUnitPrice(shortenLedgerPrecision(event.target.value));
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
                    value={transferTotalValue}
                    onChange={(event) => {
                      setTransferTotalValueTouched(true);
                      setTransferTotalValue(event.target.value);
                    }}
                    onBlur={(event) => {
                      if (event.target.value) {
                        setTransferTotalValue(shortenLedgerPrecision(event.target.value));
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
                    value={transferFee}
                    onChange={(event) => setTransferFee(event.target.value)}
                    onBlur={(event) => {
                      if (event.target.value) {
                        setTransferFee(shortenLedgerPrecision(event.target.value));
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

        {/* Non-trade asset + quantity */}
        {!isTradeType && !isTransferType && !isReconciliationType && (
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
                <span className="text-xs text-zinc-500">
                  {isValuationRequired ? 'Recommended' : 'Optional'}
                </span>
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
              {canZeroCostBasis && (
                <label className="flex items-center gap-2 text-xs text-zinc-400 mb-2">
                  <input
                    type="checkbox"
                    checked={zeroCostBasis}
                    onChange={(event) => handleZeroCostBasisChange(event.target.checked)}
                    className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-blue-500 focus:ring-blue-500"
                  />
                  Zero cost basis (set unit price and total value to 0)
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
                    placeholder={
                      isCostBasisReset
                        ? 'e.g. 45000 (per unit)'
                        : isValuationRequired
                          ? 'Recommended'
                          : 'Optional'
                    }
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
                      isCostBasisReset
                        ? 'e.g. 45000 (total) or leave blank to derive from unit price'
                        : isValuationRequired
                          ? 'Recommended'
                          : 'Optional'
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
                <span className="text-xs text-zinc-500">
                  {isValuationRequired ? 'Recommended' : 'Optional'}
                </span>
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
                    placeholder={isValuationRequired ? 'Recommended' : 'Optional'}
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
                    placeholder={isValuationRequired ? 'Recommended' : 'Optional'}
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
                <span className="text-xs text-zinc-500">
                  {isValuationRequired ? 'Recommended' : 'Optional'}
                </span>
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
                    placeholder={isValuationRequired ? 'Recommended' : 'Optional'}
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
                    placeholder={isValuationRequired ? 'Recommended' : 'Optional'}
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

      {valuationWarning && (
        <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/40 rounded-lg px-3 py-2">
          {valuationWarning}
        </div>
      )}

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
                : isTransferType
                  ? 'Adding Transfer...'
                  : 'Adding...'
            : isEditMode
              ? 'Save Changes'
              : isTransferType
                ? 'Add Transfer'
                : isTradeType
                  ? 'Add Trade'
                  : 'Add Transaction'}
        </button>
      </div>
    </form>
  );
}
