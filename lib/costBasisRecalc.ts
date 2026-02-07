import { decimalValueToNumber } from '@/lib/ledger';

export type RecalcMode = 'PURE' | 'HONOR_RESETS';

type DecimalLike = { toString(): string };

export type RecalcTransaction = {
  id: number;
  date_time: Date;
  account_id: number;
  asset_id: number;
  quantity: string | number | DecimalLike;
  tx_type: string;
  external_reference: string | null;
  total_value_in_base: string | number | DecimalLike | null;
  unit_price_in_base: string | number | DecimalLike | null;
  asset: {
    type: string | null;
    volatility_bucket: string | null;
    symbol: string | null;
  };
};

export type CostBasisPosition = {
  accountId: number;
  assetId: number;
  quantity: number;
  costBasis: number;
  costBasisKnown: boolean;
};

export type TransferDiagnostic = {
  key: string;
  assetId: number;
  dateTime: string;
  issue: 'UNMATCHED' | 'AMBIGUOUS' | 'INVALID_LEGS' | 'FEE_MISMATCH';
  legIds: number[];
};

export type RecalcResult = {
  positions: Map<string, CostBasisPosition>;
  diagnostics: TransferDiagnostic[];
};

function toNumber(value: string | number | DecimalLike | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function isCashLikeAsset(asset: RecalcTransaction['asset']): boolean {
  const type = (asset.type ?? '').toUpperCase();
  const symbol = (asset.symbol ?? '').toUpperCase();
  return (
    type === 'CASH' ||
    type === 'STABLE' ||
    symbol === 'USD' ||
    symbol === 'USDT' ||
    symbol === 'USDC'
  );
}

const TRANSFER_MATCH_ABS_TOLERANCE = Number(
  process.env.TRANSFER_MATCH_ABS_TOLERANCE ?? '1e-6',
);
const TRANSFER_MATCH_REL_TOLERANCE = Number(
  process.env.TRANSFER_MATCH_REL_TOLERANCE ?? '0.01',
);

function getTransferMismatchInfo(sourceQtyAbs: number, destQtyAbs: number) {
  const mismatchAbs = Math.abs(sourceQtyAbs - destQtyAbs);
  const maxQty = Math.max(sourceQtyAbs, destQtyAbs, 0);
  const mismatchRel = maxQty > 0 ? mismatchAbs / maxQty : 0;
  const withinTolerance =
    mismatchAbs <= TRANSFER_MATCH_ABS_TOLERANCE ||
    mismatchRel <= TRANSFER_MATCH_REL_TOLERANCE;
  return { mismatchAbs, mismatchRel, withinTolerance };
}

function getTransactionValue(
  quantity: RecalcTransaction['quantity'],
  totalValue: RecalcTransaction['total_value_in_base'],
  unitPrice: RecalcTransaction['unit_price_in_base'],
): number | null {
  const totalValueNumber = toNumber(totalValue);
  if (totalValueNumber !== null) {
    return Math.abs(totalValueNumber);
  }

  const unitPriceNumber = toNumber(unitPrice);
  const quantityNumber = toNumber(quantity);
  if (
    unitPriceNumber !== null &&
    quantityNumber !== null &&
    Math.abs(quantityNumber) > 0
  ) {
    return Math.abs(unitPriceNumber * quantityNumber);
  }

  return null;
}

function buildPositionKey(assetId: number, accountId: number): string {
  return `${assetId}-${accountId}`;
}

function getOrCreatePosition(
  positions: Map<string, CostBasisPosition>,
  tx: RecalcTransaction,
): CostBasisPosition {
  const key = buildPositionKey(tx.asset_id, tx.account_id);
  const existing = positions.get(key);
  if (existing) {
    return existing;
  }
  const position: CostBasisPosition = {
    accountId: tx.account_id,
    assetId: tx.asset_id,
    quantity: 0,
    costBasis: 0,
    costBasisKnown: true,
  };
  positions.set(key, position);
  return position;
}

function buildTransferKey(tx: RecalcTransaction): string {
  const reference = (tx.external_reference ?? '').trim();
  if (reference.startsWith('MATCH:')) {
    return `${tx.asset_id}|${reference}`;
  }
  const dateKey = tx.date_time.toISOString();
  return `${tx.asset_id}|${dateKey}|${reference}`;
}

function applyReconciliationTransaction(
  positions: Map<string, CostBasisPosition>,
  tx: RecalcTransaction,
): void {
  const position = getOrCreatePosition(positions, tx);
  const quantity = toNumber(tx.quantity) ?? 0;

  position.quantity += quantity;

  // Match holdings.ts behavior
  if (Math.abs(position.quantity) <= 1e-12) {
    position.quantity = 0;
    position.costBasis = 0;
  }
}

function applyNonTransferTransaction(
  positions: Map<string, CostBasisPosition>,
  tx: RecalcTransaction,
): void {
  const position = getOrCreatePosition(positions, tx);
  const quantity = toNumber(tx.quantity) ?? 0;

  if (isCashLikeAsset(tx.asset)) {
    if (quantity > 0) {
      position.costBasisKnown = true;
      position.costBasis += Math.abs(quantity);
      position.quantity += quantity;
    } else if (quantity < 0) {
      position.costBasisKnown = true;
      position.costBasis -= Math.abs(quantity);
      if (position.costBasis < 0) {
        position.costBasis = 0;
      }
      position.quantity += quantity;
    }
    return;
  }

  const txValue = getTransactionValue(
    tx.quantity,
    tx.total_value_in_base,
    tx.unit_price_in_base,
  );

  if (quantity > 0) {
    if (txValue === null) {
      position.costBasisKnown = false;
    } else {
      position.costBasis += txValue;
    }
    position.quantity += quantity;
  } else if (quantity < 0) {
    const sellQuantity = Math.abs(quantity);
    if (position.costBasisKnown && position.quantity > 0) {
      const averageCost = position.quantity === 0 ? 0 : position.costBasis / position.quantity;
      position.costBasis -= averageCost * sellQuantity;
      if (position.costBasis < 0) {
        position.costBasis = 0;
      }
    } else {
      position.costBasisKnown = false;
    }
    position.quantity += quantity;
  }
}

export function recalcCostBasis(
  transactions: RecalcTransaction[],
  options: { mode: RecalcMode },
): RecalcResult {
  const sorted = [...transactions].sort((a, b) => {
    const timeDiff = a.date_time.getTime() - b.date_time.getTime();
    if (timeDiff !== 0) {
      return timeDiff;
    }
    return (a.id ?? 0) - (b.id ?? 0);
  });

  const positions = new Map<string, CostBasisPosition>();
  const diagnostics: TransferDiagnostic[] = [];

  const transferGroups = new Map<string, RecalcTransaction[]>();
  for (const tx of sorted) {
    if (tx.tx_type !== 'TRANSFER') {
      continue;
    }
    const key = buildTransferKey(tx);
    const group = transferGroups.get(key) ?? [];
    group.push(tx);
    transferGroups.set(key, group);
  }

  const processedTransfers = new Set<string>();

  for (const tx of sorted) {
    if (tx.tx_type === 'COST_BASIS_RESET') {
      if (options.mode === 'HONOR_RESETS') {
        const position = getOrCreatePosition(positions, tx);
        const resetValue = toNumber(tx.total_value_in_base);
        if (resetValue === null) {
          position.costBasisKnown = false;
        } else {
          position.costBasisKnown = true;
          position.costBasis = Math.max(Math.abs(resetValue), 0);
        }
      }
      continue;
    }

    if (tx.tx_type === 'RECONCILIATION') {
      applyReconciliationTransaction(positions, tx);
      continue;
    }

    if (tx.tx_type !== 'TRANSFER') {
      applyNonTransferTransaction(positions, tx);
      continue;
    }

    const transferKey = buildTransferKey(tx);
    const group = transferGroups.get(transferKey);
    if (!group) {
      applyNonTransferTransaction(positions, tx);
      continue;
    }

    if (processedTransfers.has(transferKey)) {
      continue;
    }

    processedTransfers.add(transferKey);

    if (group.length !== 2) {
      diagnostics.push({
        key: transferKey,
        assetId: tx.asset_id,
        dateTime: tx.date_time.toISOString(),
        issue: group.length < 2 ? 'UNMATCHED' : 'AMBIGUOUS',
        legIds: group.map((leg) => leg.id),
      });
      for (const leg of group) {
        applyNonTransferTransaction(positions, leg);
      }
      continue;
    }

    const [legA, legB] = group;
    const qtyA = toNumber(legA.quantity);
    const qtyB = toNumber(legB.quantity);

    const isManualMatch = (legA.external_reference || '').startsWith('MATCH:');

    const quantitiesValid = qtyA !== null && qtyB !== null;
    const signsDiffer = quantitiesValid && ((qtyA > 0 && qtyB < 0) || (qtyA < 0 && qtyB > 0));

    if (
      !quantitiesValid ||
      qtyA === 0 || qtyB === 0 ||
      legA.asset_id !== legB.asset_id ||
      legA.account_id === legB.account_id ||
      !signsDiffer
    ) {
      diagnostics.push({
        key: transferKey,
        assetId: legA.asset_id,
        dateTime: legA.date_time.toISOString(),
        issue: 'INVALID_LEGS',
        legIds: group.map((leg) => leg.id),
      });
      for (const leg of group) {
        applyNonTransferTransaction(positions, leg);
      }
      continue;
    }

    const validQtyA = qtyA as number;
    const validQtyB = qtyB as number;

    const sourceLeg = validQtyA < 0 ? legA : legB;
    const destLeg = sourceLeg === legA ? legB : legA;

    const sourceQtyAbs = Math.abs(validQtyA < 0 ? validQtyA : validQtyB);
    const destQtyAbs = Math.abs(validQtyA < 0 ? validQtyB : validQtyA);

    const mismatchInfo = getTransferMismatchInfo(sourceQtyAbs, destQtyAbs);
    const withinTolerance = isManualMatch ? true : mismatchInfo.withinTolerance;
    const feeMismatch = !withinTolerance && destQtyAbs <= sourceQtyAbs;

    if (!withinTolerance && destQtyAbs > sourceQtyAbs) {
      diagnostics.push({
        key: transferKey,
        assetId: legA.asset_id,
        dateTime: legA.date_time.toISOString(),
        issue: 'INVALID_LEGS',
        legIds: group.map((leg) => leg.id),
      });
      for (const leg of group) {
        applyNonTransferTransaction(positions, leg);
      }
      continue;
    }

    if (feeMismatch) {
      diagnostics.push({
        key: transferKey,
        assetId: legA.asset_id,
        dateTime: legA.date_time.toISOString(),
        issue: 'FEE_MISMATCH',
        legIds: group.map((leg) => leg.id),
      });
    }

    const transferQty = Math.min(sourceQtyAbs, destQtyAbs);

    const sourcePosition = getOrCreatePosition(positions, sourceLeg);
    const destPosition = getOrCreatePosition(positions, destLeg);

    const sourceQtyBefore = sourcePosition.quantity;

    sourcePosition.quantity += decimalValueToNumber(sourceLeg.quantity as any) ?? 0;
    destPosition.quantity += decimalValueToNumber(destLeg.quantity as any) ?? 0;

    if (!sourcePosition.costBasisKnown || sourceQtyBefore <= 0) {
      sourcePosition.costBasisKnown = sourcePosition.costBasisKnown && sourceQtyBefore > 0;
      destPosition.costBasisKnown = false;
      continue;
    }

    const averageCost = sourcePosition.costBasis / sourceQtyBefore;
    const movedBasis = averageCost * transferQty;
    const sourceReduction = averageCost * sourceQtyAbs;

    if (!Number.isFinite(movedBasis) || !Number.isFinite(sourceReduction)) {
      destPosition.costBasisKnown = false;
      continue;
    }

    sourcePosition.costBasis -= sourceReduction;
    if (sourcePosition.costBasis < 0) {
      sourcePosition.costBasis = 0;
    }

    destPosition.costBasis += movedBasis;
  }

  return { positions, diagnostics };
}