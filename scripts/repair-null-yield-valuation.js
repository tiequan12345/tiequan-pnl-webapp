const { PrismaClient } = require('@prisma/client');

require('dotenv').config();

const prisma = new PrismaClient();

function getArg(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  const value = process.argv[idx + 1];
  return value ?? fallback;
}

function toNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'bigint') {
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value.toNumber === 'function') {
    const parsed = value.toNumber();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const limitRaw = getArg('--limit', null);
  const limit = limitRaw ? Number(limitRaw) : null;

  const where = {
    tx_type: { in: ['YIELD', 'DEPOSIT'] },
    total_value_in_base: null,
  };

  const transactions = await prisma.ledgerTransaction.findMany({
    where,
    select: {
      id: true,
      quantity: true,
      unit_price_in_base: true,
      total_value_in_base: true,
    },
    ...(limit && Number.isFinite(limit) && limit > 0 ? { take: limit } : {}),
  });

  console.log(`Found ${transactions.length} transactions with missing total_value_in_base.`);

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to update.');
    return;
  }

  const updates = transactions.map((tx) => {
    const quantityNumber = toNumber(tx.quantity);
    const unitPriceNumber = toNumber(tx.unit_price_in_base);

    let totalValue = '0';
    if (unitPriceNumber !== null && quantityNumber !== null) {
      const derived = unitPriceNumber * quantityNumber;
      if (Number.isFinite(derived)) {
        totalValue = derived.toString();
      }
    }

    const data = {
      total_value_in_base: totalValue,
    };

    if (tx.unit_price_in_base === null && unitPriceNumber === null) {
      data.unit_price_in_base = '0';
    }

    return prisma.ledgerTransaction.update({
      where: { id: tx.id },
      data,
    });
  });

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }

  console.log(`Updated ${updates.length} transactions.`);
}

main()
  .catch((error) => {
    console.error('Repair failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
