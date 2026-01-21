const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

require('dotenv').config();

const prisma = new PrismaClient();

function getArg(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  const value = process.argv[idx + 1];
  return value ?? fallback;
}

function parseList(value) {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function decimalToNumber(value) {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value.toNumber === 'function') {
    return value.toNumber();
  }
  return 0;
}

function decimalToNullableNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const converted = decimalToNumber(value);
  return Number.isFinite(converted) ? converted : null;
}

function isCashLikeAsset(asset) {
  const type = (asset.type || '').toUpperCase();
  const bucket = (asset.volatility_bucket || '').toUpperCase();
  const symbol = (asset.symbol || '').toUpperCase();
  return (
    type === 'CASH' ||
    type === 'STABLE' ||
    bucket === 'CASH_LIKE' ||
    symbol === 'USD' ||
    symbol === 'USDT' ||
    symbol === 'USDC'
  );
}

function getTransactionValue(quantity, totalValue, unitPrice) {
  const totalValueNumber = decimalToNullableNumber(totalValue);
  if (totalValueNumber !== null) {
    return Math.abs(totalValueNumber);
  }

  const unitPriceNumber = decimalToNullableNumber(unitPrice);
  const quantityNumber = decimalToNullableNumber(quantity);
  if (
    unitPriceNumber !== null &&
    quantityNumber !== null &&
    Math.abs(quantityNumber) > 0
  ) {
    return Math.abs(unitPriceNumber * quantityNumber);
  }

  return null;
}

const TRANSFER_MATCH_ABS_TOLERANCE = Number(
  process.env.TRANSFER_MATCH_ABS_TOLERANCE || '1e-6',
);
const TRANSFER_MATCH_REL_TOLERANCE = Number(
  process.env.TRANSFER_MATCH_REL_TOLERANCE || '0.01',
);

function getTransferMismatchInfo(sourceQtyAbs, destQtyAbs) {
  const mismatchAbs = Math.abs(sourceQtyAbs - destQtyAbs);
  const maxQty = Math.max(sourceQtyAbs, destQtyAbs, 0);
  const mismatchRel = maxQty > 0 ? mismatchAbs / maxQty : 0;
  const withinTolerance =
    mismatchAbs <= TRANSFER_MATCH_ABS_TOLERANCE ||
    mismatchRel <= TRANSFER_MATCH_REL_TOLERANCE;
  return { mismatchAbs, mismatchRel, withinTolerance };
}

function buildTransferKey(tx) {
  const reference = (tx.external_reference || '').trim();
  if (reference.startsWith('MATCH:')) {
    return `${tx.asset_id}|${reference}`;
  }
  const dateKey = tx.date_time.toISOString();
  return `${tx.asset_id}|${dateKey}|${reference}`;
}

function resolveTransferDiagnostics(transfers) {
  const diagnostics = [];
  const mismatchCandidates = [];
  const transferGroups = new Map();

  for (const tx of transfers) {
    const key = buildTransferKey(tx);
    const group = transferGroups.get(key) || [];
    group.push(tx);
    transferGroups.set(key, group);
  }

  for (const [transferKey, group] of transferGroups.entries()) {
    if (group.length !== 2) {
      diagnostics.push({
        key: transferKey,
        assetId: group[0]?.asset_id ?? null,
        dateTime: group[0]?.date_time?.toISOString?.() ?? null,
        issue: group.length < 2 ? 'UNMATCHED' : 'AMBIGUOUS',
        legIds: group.map((leg) => leg.id),
      });
      continue;
    }

    const [legA, legB] = group;
    const qtyA = decimalToNullableNumber(legA.quantity);
    const qtyB = decimalToNullableNumber(legB.quantity);
    const isManualMatch = (legA.external_reference || '').startsWith('MATCH:');

    const quantitiesValid = qtyA !== null && qtyB !== null;
    const signsDiffer = quantitiesValid && ((qtyA > 0 && qtyB < 0) || (qtyA < 0 && qtyB > 0));

    if (
      !quantitiesValid ||
      qtyA === 0 ||
      qtyB === 0 ||
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
      continue;
    }

    const validQtyA = qtyA;
    const validQtyB = qtyB;

    const sourceQtyAbs = Math.abs(validQtyA < 0 ? validQtyA : validQtyB);
    const destQtyAbs = Math.abs(validQtyA < 0 ? validQtyB : validQtyA);

    const mismatchInfo = getTransferMismatchInfo(sourceQtyAbs, destQtyAbs);
    const withinTolerance = isManualMatch ? true : mismatchInfo.withinTolerance;

    if (!withinTolerance && destQtyAbs > sourceQtyAbs) {
      diagnostics.push({
        key: transferKey,
        assetId: legA.asset_id,
        dateTime: legA.date_time.toISOString(),
        issue: 'INVALID_LEGS',
        legIds: group.map((leg) => leg.id),
      });
      continue;
    }

    if (!withinTolerance && destQtyAbs <= sourceQtyAbs) {
      diagnostics.push({
        key: transferKey,
        assetId: legA.asset_id,
        dateTime: legA.date_time.toISOString(),
        issue: 'FEE_MISMATCH',
        legIds: group.map((leg) => leg.id),
      });
      mismatchCandidates.push({
        key: transferKey,
        assetId: legA.asset_id,
        dateTime: legA.date_time.toISOString(),
        legIds: group.map((leg) => leg.id),
        qtyA,
        qtyB,
        mismatchAbs: mismatchInfo.mismatchAbs,
        mismatchRel: mismatchInfo.mismatchRel,
      });
    }
  }

  return { diagnostics, mismatchCandidates };
}

async function main() {
  const assetSymbols = parseList(getArg('--asset-symbols', 'BTC'));
  const outputArg = getArg('--output', null);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = outputArg || path.join('reports', `cost-basis-phase1-${timestamp}.json`);

  if (assetSymbols.length === 0) {
    throw new Error('No asset symbols provided. Use --asset-symbols BTC,ETH');
  }

  const assets = await prisma.asset.findMany({
    where: { symbol: { in: assetSymbols } },
  });

  if (assets.length === 0) {
    throw new Error(`No assets found for symbols: ${assetSymbols.join(', ')}`);
  }

  const assetIds = assets.map((asset) => asset.id);
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));

  const resets = await prisma.ledgerTransaction.findMany({
    where: {
      tx_type: 'COST_BASIS_RESET',
      asset_id: { in: assetIds },
    },
    orderBy: [{ date_time: 'desc' }, { id: 'desc' }],
  });

  const lastResetByAssetId = new Map();
  for (const reset of resets) {
    if (!lastResetByAssetId.has(reset.asset_id)) {
      lastResetByAssetId.set(reset.asset_id, reset.date_time);
    }
  }

  const transactions = await prisma.ledgerTransaction.findMany({
    where: { asset_id: { in: assetIds } },
    orderBy: [{ date_time: 'asc' }, { id: 'asc' }],
    include: { asset: true, account: true },
  });

  const transfers = transactions.filter((tx) => tx.tx_type === 'TRANSFER');
  const transferDestinationsAfterReset = [];

  for (const tx of transfers) {
    const lastReset = lastResetByAssetId.get(tx.asset_id);
    const isDestination = decimalToNumber(tx.quantity) > 0;
    if (!isDestination) {
      continue;
    }
    const afterReset = lastReset ? tx.date_time > lastReset : true;
    if (!afterReset) {
      continue;
    }
    const asset = assetById.get(tx.asset_id);
    transferDestinationsAfterReset.push({
      assetId: tx.asset_id,
      assetSymbol: asset?.symbol ?? 'UNKNOWN',
      accountId: tx.account_id,
      accountName: tx.account.name,
      dateTime: tx.date_time.toISOString(),
      quantity: decimalToNumber(tx.quantity),
      externalReference: tx.external_reference,
      lastResetAt: lastReset ? lastReset.toISOString() : null,
    });
  }

  const positions = new Map();
  for (const tx of transactions) {
    const key = `${tx.asset_id}-${tx.account_id}`;
    const quantity = decimalToNumber(tx.quantity);
    const existing = positions.get(key);

    const position =
      existing || {
        asset: tx.asset,
        account: tx.account,
        quantity: 0,
        costBasis: 0,
        costBasisKnown: true,
      };

    if (tx.tx_type === 'COST_BASIS_RESET') {
      const resetValue = decimalToNullableNumber(tx.total_value_in_base);
      if (resetValue === null) {
        position.costBasisKnown = false;
      } else {
        position.costBasisKnown = true;
        position.costBasis = Math.max(Math.abs(resetValue), 0);
      }
      positions.set(key, position);
      continue;
    }

    if (tx.tx_type === 'RECONCILIATION') {
      position.quantity += quantity;
      if (Math.abs(position.quantity) <= 1e-12) {
        position.quantity = 0;
        position.costBasis = 0;
      }
      positions.set(key, position);
      continue;
    }

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
      positions.set(key, position);
      continue;
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

    positions.set(key, position);
  }

  const unknownCostBasisHoldings = [];
  for (const position of positions.values()) {
    if (!position.costBasisKnown && Math.abs(position.quantity) > 1e-12) {
      unknownCostBasisHoldings.push({
        assetId: position.asset.id,
        assetSymbol: position.asset.symbol,
        accountId: position.account.id,
        accountName: position.account.name,
        quantity: position.quantity,
      });
    }
  }

  const { diagnostics, mismatchCandidates } = resolveTransferDiagnostics(transfers);

  const report = {
    generatedAt: new Date().toISOString(),
    assetSymbols,
    assets: assets.map((asset) => ({
      id: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      type: asset.type,
      volatilityBucket: asset.volatility_bucket,
    })),
    lastResetByAsset: assets.map((asset) => ({
      assetId: asset.id,
      assetSymbol: asset.symbol,
      lastResetAt: lastResetByAssetId.get(asset.id)?.toISOString() ?? null,
    })),
    unknownCostBasisHoldings,
    transferDestinationsAfterReset,
    transferDiagnostics: diagnostics,
    transferMismatchCandidates: mismatchCandidates,
    summary: {
      unknownCostBasisHoldingsCount: unknownCostBasisHoldings.length,
      transferDestinationsAfterResetCount: transferDestinationsAfterReset.length,
      transferDiagnosticsCount: diagnostics.length,
      transferMismatchCandidateCount: mismatchCandidates.length,
    },
  };

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`Phase 1 report written to ${outputPath}`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
