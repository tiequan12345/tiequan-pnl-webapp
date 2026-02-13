# Transfer Reconciliation Problem: Manual Entry vs Auto-Sync Conflict

## Status: 🔴 OPEN - Requires Senior Dev Review

**Date:** 2026-02-12
**Severity:** High - Data integrity & cost basis tracking broken
**Components:** Ledger, CCXT Sync, Reconcile UI

---

## Problem Summary

The ledger system has a **fundamental architectural conflict** between:

1. **Manual TRANSFER creation** - Users create 2-legged transfers that span accounts
2. **CCXT auto-sync** - Automatically creates DEPOSIT/WITHDRAWAL entries on CEX accounts

When these overlap (e.g., user manually creates EVM→Bybit transfer, then Bybit auto-syncs), it creates **duplicate entries**, **ambiguous transfer groups**, and **broken cost basis tracking**.

---

## Current State Evidence

### Example 1: Fixed 3-Leg Ambiguous Group (USDT, 02/06)

```
Original State (AMBIGUOUS - 3 legs):
┌─────────────────────────────────────────────────────┐
│ Hemi:         -13,820.93 USDT  (source)              │
│ EVM HW:       +13,820.93 USDT  (destination)        │
│ Binance:      +71,120 USDT    (extra destination)   │
│ External Ref: MATCH:7f9c... (all 3 share same ref) │
└─────────────────────────────────────────────────────┘

After Fix:
┌─────────────────────────────────────────────────────┐
│ Hemi:   -13,820.93 USDT  TRANSFER  (paired)         │
│ EVM HW: +13,820.93 USDT  TRANSFER  (paired)         │
│ Binance:+71,120 USDT    DEPOSIT   (separated)       │
└─────────────────────────────────────────────────────┘
```

**Root Cause:** User likely created a 2-leg transfer (Hemi↔EVM), then Binance auto-synced an unrelated deposit that got grouped into the same transfer.

### Example 2: Fixed 3-Leg Ambiguous Group (USDC, 02/09)

```
Original State (AMBIGUOUS - 3 legs):
┌─────────────────────────────────────────────────────┐
│ Bybit:        -96,000 USDC  (source)               │
│ Uniswap Mon:  +96,000 USDC  (destination)          │
│ EVM HW:       -21,197 USDC  (extra source)         │
│ External Ref: MATCH:8ba9... (all 3 share same ref) │
└─────────────────────────────────────────────────────┘

After Fix:
┌─────────────────────────────────────────────────────┐
│ Bybit:       -96,000 USDC  TRANSFER  (paired)       │
│ Uniswap Mon: +96,000 USDC  TRANSFER  (paired)       │
│ EVM HW:      -21,197 USDC  WITHDRAWAL (separated)   │
└─────────────────────────────────────────────────────┘
```

**Root Cause:** User created a 2-leg transfer (Bybit↔Uniswap), then had a separate EVM withdrawal that got grouped in.

---

## The Core Conflict: Auto-Sync vs Manual Entry

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CURRENT ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐                 ┌──────────────┐                  │
│  │ EVM Wallet   │                 │   Bybit      │                  │
│  │ (Manual)     │                 │  (Auto-sync) │                  │
│  └──────┬───────┘                 └──────┬───────┘                  │
│         │                                │                           │
│         │ 1. User creates TRANSFER in UI                            │
│         │    ┌───────────────────────────────────┐                   │
│         └───▶│ Creates 2 legs:                   │                   │
│             │   EVM:   TRANSFER -90K            │                   │
│             │   Bybit: TRANSFER +90K            │                   │
│             └───────────────────────────────────┘                   │
│                      │                                              │
│                      ▼                                              │
│         ┌───────────────────────────────────────────┐              │
│         │ 2. CCXT auto-sync runs (5-10 min later)   │              │
│         │    Detects deposit on Bybit               │              │
│         │    Creates: Bybit DEPOSIT +90K           │              │
│         └───────────────────────────────────────────┘              │
│                      │                                              │
│                      ▼                                              │
│         ┌───────────────────────────────────────────┐              │
│         │ RESULT: Bybit has DUPLICATE entries:      │              │
│         │   - TRANSFER +90K (from step 1)           │              │
│         │   - DEPOSIT +90K (from step 2)           │              │
│         │                                           │              │
│         │ UI shows: 180K total (WRONG!)            │              │
│         └───────────────────────────────────────────┘              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Database Evidence

**All CCXT auto-synced deposits (last 30 days):**
- 7 total DEPOSITS created by CCXT
- 0 are matched to TRANSFER pairs
- All are standalone (breaking cost basis)

```sql
SELECT account, tx_type, COUNT(*)
FROM LedgerTransaction
WHERE tx_type = 'DEPOSIT' AND external_reference LIKE 'CCXT:%'
GROUP BY account;
```

---

## Cost Basis Impact

### Current Behavior (BROKEN)

```
Scenario: You bought 90K USDC at $0.90 on EVM wallet
          Transfer to Bybit
          Sell at $1.00 on Bybit

EVM Wallet Ledger:
  BUY  90,000 USDC @ $0.90 = $81,000 cost basis
  TRANSFER -90,000 USDC → cost basis flows to destination

Bybit Ledger (with CCXT DEPOSIT):
  DEPOSIT +90,000 USDC → cost basis RESETS to current price ($1.00)
  SELL -90,000 @ $1.00 = $90,000 value
  PROFIT: $0 (WRONG! Should be $9,000)

Bybit Ledger (properly matched TRANSFER):
  TRANSFER +90,000 USDC → cost basis = $81,000 (carried from EVM)
  SELL -90,000 @ $1.00 = $90,000 value
  PROFIT: $9,000 (CORRECT!)
```

**Financial Impact:** Capital gains are incorrectly calculated when DEPOSIT is used instead of TRANSFER.

---

## Transfer Grouping Logic

### How Transfers Are Grouped

File: `/home/ubuntu/tiequan-pnl-webapp/lib/costBasisRecalc.ts`

```typescript
function buildTransferKey(tx: RecalcTransaction): string {
  const reference = (tx.external_reference ?? '').trim();
  if (reference.startsWith('MATCH:')) {
    // Groups by asset_id + MATCH reference
    return `${tx.asset_id}|${reference}`;
  }
  // Groups by asset_id + timestamp + external reference
  const dateKey = tx.date_time.toISOString();
  return `${tx.asset_id}|${dateKey}|${reference}`;
}
```

**Rules:**
1. If `external_reference` starts with `MATCH:`, group by `asset_id|MATCH:ref`
2. Otherwise, group by `asset_id|timestamp|external_reference`
3. Groups with 2 legs are valid transfers
4. Groups with ≠2 legs are flagged as:
   - **UNMATCHED**: <2 legs
   - **AMBIGUOUS**: >2 legs
   - **INVALID_LEGS**: Invalid transfer logic

### The Ambiguity Detection

```typescript
if (group.length !== 2) {
  diagnostics.push({
    key: transferKey,
    assetId: tx.asset_id,
    dateTime: tx.date_time.toISOString(),
    issue: group.length < 2 ? 'UNMATCHED' : 'AMBIGUOUS',
    legIds: group.map((leg) => leg.id),
  });
}
```

---

## Related Code Locations

### 1. Transfer Issues API
**File:** `/home/ubuntu/tiequan-pnl-webapp/app/api/ledger/transfer-issues/route.ts`
- Fetches all TRANSFER transactions
- Calls `recalcCostBasis()` to detect ambiguous groups
- Returns diagnostics to UI

### 2. Cost Basis Calculation
**File:** `/home/ubuntu/tiequan-pnl-webapp/lib/costBasisRecalc.ts`
- Groups transfers by `buildTransferKey()`
- Validates 2-leg pairs
- Detects AMBIGUOUS groups (>2 legs)
- Calculates cost basis flow

### 3. Resolve Transfer Endpoint
**File:** `/home/ubuntu/tiequan-pnl-webapp/app/api/ledger/resolve-transfer/route.ts`
- `MATCH`: Assigns shared timestamp + MATCH:uuid reference
- `SEPARATE`: Converts to DEPOSIT/WITHDRAWAL (doesn't remove MATCH ref!)

### 4. CCXT Sync Logic
**File:** `/home/ubuntu/tiequan-pnl-webapp/lib/ccxt/sync.ts`
- Auto-imports deposits/withdrawals from exchanges
- Creates DEPOSIT/WITHDRAWAL transactions
- Does NOT check for existing TRANSFER entries

### 5. Reconcile UI
**File:** `/home/ubuntu/tiequan-pnl-webapp/app/(authenticated)/reconcile/ReconcileView.tsx`
- Shows ambiguous transfer groups
- Provides Match/Separate buttons
- Calls resolve-transfer API

---

## Potential Solutions (For Senior Dev Review)

### Option 1: Smart Transfer Detection ⭐ RECOMMENDED

**Idea:** When CCXT syncs a DEPOSIT, check if there's a corresponding TRANSFER already created.

```sql
-- Before creating CCXT DEPOSIT, check:
SELECT * FROM LedgerTransaction
WHERE tx_type = 'TRANSFER'
  AND account_id = [cew_account_id]
  AND asset_id = [asset_id]
  AND quantity = -[deposit_quantity]
  AND date_time BETWEEN [deposit_time] - 1hr AND [deposit_time] + 1hr
  AND external_reference LIKE 'MATCH:%'

-- If found:
--   1. Skip creating DEPOSIT
--   2. Update existing TRANSFER pair to mark as "synced"
-- If not found:
--   3. Create DEPOSIT as usual
```

**Pros:**
- Prevents duplicates at source
- Minimal UI changes
- Preserves user's manual TRANSFER intent

**Cons:**
- False positives (legitimate DEPOSITs that look like transfers)
- Time window heuristic (1 hour?)

---

### Option 2: Transfer-Centric UI

**Idea:** Change TRANSFER UI to create only the source leg. Destination is inferred or auto-created.

```
Current UI:
┌────────────────────────────────────┐
│ From: EVM Wallet    To: Bybit      │
│ Amount: 90,000 USDC                │
│ [Create Transfer] → Creates 2 legs │
└────────────────────────────────────┘

Proposed UI:
┌────────────────────────────────────┐
│ From: EVM Wallet                   │
│ To: Bybit (Auto-synced account)   │
│ Amount: 90,000 USDC                │
│ [Create Transfer] → Creates 1 leg  │
│   on EVM: TRANSFER -90K            │
│   Bybit: Will be auto-synced       │
└────────────────────────────────────┘
```

**Pros:**
- Acknowledges auto-sync reality
- Single source of truth (exchange API)
- Cleaner data model

**Cons:**
- Requires UI rework
- User confusion ("where's the destination leg?")
- Breaks if auto-sync is delayed

---

### Option 3: Post-Sync Reconciliation Job

**Idea:** Run a scheduled job that matches CCXT entries to manual TRANSFERS.

```typescript
// Runs every 5 minutes
async function reconcileCCXTWithTransfers() {
  // 1. Find recent CCXT DEPOSITS
  const deposits = await prisma.ledgerTransaction.findMany({
    where: {
      tx_type: 'DEPOSIT',
      external_reference: { like: 'CCXT:%' },
      created_at: { gte: fiveMinutesAgo }
    }
  });

  // 2. For each, find matching TRANSFER
  for (const deposit of deposits) {
    const matchingTransfer = await findCorrespondingTransfer(deposit);
    if (matchingTransfer) {
      // 3. Convert to matched pair
      await convertToTransferPair(deposit, matchingTransfer);
    }
  }
}
```

**Pros:**
- Non-blocking
- Can run async
- Batch processing efficient

**Cons:**
- Eventual consistency (5-10 min lag)
- Complex matching logic
- Race conditions

---

### Option 4: External Reference Namespace

**Idea:** Use separate namespaces for manual vs auto-sync transactions.

```
Manual TRANSFER: MATCH:manual:uuid
Auto-sync:       CCXT:exchange:txid
```

**Sync logic:**
```sql
-- Group transfers by namespace
SELECT * FROM LedgerTransaction
WHERE external_reference LIKE 'MATCH:manual:%'
  OR external_reference LIKE 'CCXT:%'
GROUP BY asset_id, date_time
HAVING COUNT(*) > 1
```

**Pros:**
- Clean separation
- Easy to query
- Namespace collision prevention

**Cons:**
- Doesn't solve duplicate problem
- Just organizes it better

---

### Option 5: User Intent Detection ⭐⭐ INNOVATIVE

**Idea:** Detect user's intent by analyzing transaction patterns.

```sql
-- If user creates TRANSFER from Manual → Auto-synced account:
--   Scenario A: User wants to record existing blockchain tx
--   Scenario B: User is entering the trade before auto-sync runs

-- Detection heuristic:
IF destination_account.auto_sync_enabled
   AND transfer.time < auto_sync.last_sync_time + 5min THEN
   -- User is pre-entering, skip auto-sync for this tx
   RETURN "SKIP_AUTO_SYNC";
ELSE
   -- User is recording historical tx
   RETURN "CREATE_TRANSFER_PAIR";
END IF
```

**Pros:**
- Smart, adaptive
- No UI changes
- Learns from user behavior

**Cons:**
- Complex logic
- Edge cases
- Hard to test

---

## Open Questions for Senior Devs

1. **What's the source of truth?**
   - Manual user entry? Or exchange API via CCXT?
   - Currently: Both, causing conflicts

2. **Should we allow manual TRANSFER to auto-synced accounts?**
   - Option A: Block it (UI validation)
   - Option B: Allow it but run reconciliation
   - Option C: Detect and auto-merge

3. **Cost basis preservation**
   - Is this critical for your use case?
   - Or is DEPOSIT/WITHDRAWAL acceptable?

4. **User workflow preference**
   - Do users want to pre-enter transfers before sync?
   - Or do they wait for sync and then clean up?

5. **Error handling**
   - What if CCXT sync fails?
   - What if user creates wrong TRANSFER?
   - Rollback mechanisms?

---

## Immediate Workarounds (Until Solution Is Implemented)

### For Users

1. **Wait for sync first, then create TRANSFER**
   - Let CCXT create DEPOSIT
   - Delete DEPOSIT
   - Create proper TRANSFER pair

2. **Use separate TRANSFER + SEPARATE workflow**
   - Create TRANSFER on manual side only
   - Let sync create DEPOSIT
   - Use Reconcile UI to separate and match

3. **Accept cost basis reset** (not recommended)
   - Leave as DEPOSIT/WITHDRAWAL
   - Live with broken P&L

### For Devs

- Run manual SQL to fix existing ambiguous groups (done ✓)
- Monitor transfer-issues page for new AMBIGUOUS groups
- Educate users on current workflow

---

## Data Integrity Concerns

### Current State Risks

1. **Duplicate balances**: Users see inflated totals
2. **Broken cost basis**: Capital gains miscalculated
3. **Ambiguous groups**: Reconcile page shows confusing errors
4. **Manual intervention required**: High support burden

### Scale Impact

- 7 CCXT DEPOSITS currently unmatched
- 2 AMBIGUOUS groups found in sample
- Unknown number of broken cost basis chains
- Problem grows with each transfer to/from CEX

---

## Recommendations

### Short Term (This Sprint)

1. ✅ Fix existing ambiguous groups (DONE)
2. ⬜ Add UI warning: "Bybit auto-syncs - avoid manual TRANSFER entries"
3. ⬜ Add validation: Block TRANSFER to auto-synced accounts
4. ⬜ Document workaround in user guide

### Medium Term (Next Sprint)

1. ⬜ Implement Option 1 (Smart Transfer Detection)
2. ⬜ Add "Convert to Transfer" button for CCXT DEPOSITS
3. ⬜ Post-sync reconciliation job
4. ⬜ Monitoring dashboard for transfer health

### Long Term (Next Quarter)

1. ⬜ Re-architect for single source of truth
2. ⬜ Transfer-centric data model
3. ⬜ User intent detection
4. ⬜ Automated cost basis validation

---

## Appendix: Database Schema

```sql
CREATE TABLE LedgerTransaction (
  id INTEGER PRIMARY KEY,
  date_time DATETIME NOT NULL,
  account_id INTEGER NOT NULL,
  asset_id INTEGER NOT NULL,
  quantity DECIMAL NOT NULL,
  tx_type TEXT NOT NULL,  -- TRANSFER, DEPOSIT, WITHDRAWAL, etc.
  external_reference TEXT,  -- MATCH:uuid or CCXT:exchange:txid
  notes TEXT,
  fee_in_base DECIMAL,
  total_value_in_base DECIMAL,
  unit_price_in_base DECIMAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME,
  FOREIGN KEY (account_id) REFERENCES Account(id),
  FOREIGN KEY (asset_id) REFERENCES Asset(id)
);

CREATE TABLE CcxtConnection (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL,
  exchange_id TEXT NOT NULL,  -- 'binance', 'bybit', etc.
  status TEXT DEFAULT 'ACTIVE',
  last_sync_at DATETIME,
  metadata_json TEXT,
  FOREIGN KEY (account_id) REFERENCES Account(id)
);
```

---

## Contact

**Reporter:** AI Agent (via user request)
**Reviewers:** @senior-devs
**Related Tickets:** TBD
**Pull Requests:** TBD
