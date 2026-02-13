/**
 * Backfill script for match_reference on existing transfers
 * 
 * This script:
 * 1. Finds transfers with external_reference LIKE 'MATCH:%' and copies to match_reference
 * 2. For transfers without match_reference, groups by legacy key
 *    (same fallback as costBasisRecalc: asset_id + date_time + external_reference,
 *    or asset_id + MATCH:* when legacy MATCH refs are present)
 *   - If group size is exactly 2 with opposite quantities, assigns a generated MATCH:* to both
 *   - If group size != 2, leaves as-is for manual review
 * 
 * Run with: pnpm tsx scripts/backfill-match-reference.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function buildLegacyTransferKey(tx: {
  asset_id: number;
  date_time: Date;
  external_reference: string | null;
}): string {
  const reference = (tx.external_reference ?? '').trim();
  if (reference.startsWith('MATCH:')) {
    return `${tx.asset_id}|${reference}`;
  }
  return `${tx.asset_id}|${tx.date_time.toISOString()}|${reference}`;
}

async function backfillMatchReference() {
  console.log('Starting match_reference backfill...\n');

  // Step 1: Copy existing MATCH:* from external_reference to match_reference
  console.log('Step 1: Copying MATCH:* from external_reference to match_reference...');
  
  const transfersWithMatchRef = await prisma.ledgerTransaction.findMany({
    where: {
      tx_type: 'TRANSFER',
      external_reference: { startsWith: 'MATCH:' },
    },
    select: {
      id: true,
      external_reference: true,
      match_reference: true,
    },
  });

  console.log(`  Found ${transfersWithMatchRef.length} transfers with MATCH:* external_reference`);

  let updated = 0;
  for (const tx of transfersWithMatchRef) {
    if (!tx.match_reference && tx.external_reference) {
      await prisma.ledgerTransaction.update({
        where: { id: tx.id },
        data: { match_reference: tx.external_reference },
      });
      updated++;
    }
  }
  console.log(`  Updated ${updated} transfers with match_reference\n`);

  // Step 2: Find unmatched transfers and group by legacy key
  console.log('Step 2: Grouping unmatched transfers by legacy key...');

  const unmatchedTransfers = await prisma.ledgerTransaction.findMany({
    where: {
      tx_type: 'TRANSFER',
      match_reference: null,
    },
    orderBy: [{ date_time: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      asset_id: true,
      date_time: true,
      external_reference: true,
      quantity: true,
    },
  });

  console.log(`  Found ${unmatchedTransfers.length} transfers without match_reference`);

  // Build legacy grouping key to match runtime fallback in buildTransferKey()
  const legacyGroups = new Map<string, typeof unmatchedTransfers>();

  for (const tx of unmatchedTransfers) {
    const key = buildLegacyTransferKey(tx);

    const group = legacyGroups.get(key) ?? [];
    group.push(tx);
    legacyGroups.set(key, group);
  }

  // Find groups with exactly 2 opposite-direction legs
  const pairedGroups = Array.from(legacyGroups.entries()).filter(([_, group]) => {
    if (group.length !== 2) {
      return false;
    }

    const quantityA = Number(group[0].quantity);
    const quantityB = Number(group[1].quantity);

    if (!Number.isFinite(quantityA) || !Number.isFinite(quantityB)) {
      return false;
    }

    return Math.abs(quantityA + quantityB) < 1e-8;
  });
  console.log(`  Found ${pairedGroups.length} groups with exactly 2 legs\n`);

  // Step 3: Assign match_reference to paired groups
  console.log('Step 3: Assigning match_reference to paired groups...');
  
  let assigned = 0;
  for (const [, group] of pairedGroups) {
    // Skip if already has external_reference with MATCH: (already handled in Step 1)
    if (group[0].external_reference?.startsWith('MATCH:')) {
      continue;
    }
    
    const matchRef = `MATCH:${crypto.randomUUID()}`;
    
    await prisma.$transaction(
      group.map((tx) =>
        prisma.ledgerTransaction.update({
          where: { id: tx.id },
          data: { match_reference: matchRef },
        }),
      ),
    );
    
    assigned++;
    if (assigned <= 5) {
      console.log(`  Assigned ${matchRef} to transfers ${group.map(t => t.id).join(', ')}`);
    }
  }
  
  if (assigned > 5) {
    console.log(`  ... and ${assigned - 5} more groups`);
  }
  console.log(`  Total: assigned match_reference to ${assigned} transfer groups\n`);

  // Summary
  console.log('=== Summary ===');
  console.log(`Transfers with MATCH:* copied: ${updated}`);
  console.log(`Transfer groups paired: ${assigned}`);
  
  // Report on remaining unmatched
  const remainingUnmatched = await prisma.ledgerTransaction.count({
    where: {
      tx_type: 'TRANSFER',
      match_reference: null,
    },
  });
  
  console.log(`Remaining unmatched transfers: ${remainingUnmatched}`);
  console.log('\nDone!');
}

backfillMatchReference()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
