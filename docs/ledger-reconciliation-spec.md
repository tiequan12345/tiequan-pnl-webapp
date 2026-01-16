# Ledger Reconciliation Specification

## Document Information

- **Created**: 2025-01-15
- **Status**: Design Specification
- **Approach**: Option B (Quantity True-ups + Cost Basis Resets)
- **Related Docs**: `04-implementation-details.md`

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Current Architecture Analysis](#current-architecture-analysis)
3. [Solution Overview](#solution-overview)
4. [Detailed Implementation Plan](#detailed-implementation-plan)
5. [API Specifications](#api-specifications)
6. [UI/UX Design](#uiux-design)
7. [Testing Strategy](#testing-strategy)
8. [Usage Examples](#usage-examples)
9. [Future Enhancements](#future-enhancements)

---

## Problem Statement

### The Issue: Impermanent Loss and Ledger Reconciliation

When providing liquidity to decentralized exchanges (DEXes), users often encounter **impermanent loss** (IL) - a temporary loss of funds that occurs when the price of deposited assets changes compared to when they were deposited.

#### Concrete Scenario

1. **Initial Deposit**: User deposits 1 BTC + 100,000 USDC into a liquidity pool
2. **Price Movement**: BTC price drops significantly
3. **Withdrawal**: User removes liquidity, receiving:
   - More BTC (e.g., 1.2 BTC)
   - Less USDC (e.g., 80,000 USDC)
4. **Transfer**: User transfers these assets to another project/account
5. **Problem**: The original ledger entry shows:
   - Position "zeroed out" but continues to fluctuate with price
   - No way to properly reconcile the quantity differences
   - Cost basis becomes inaccurate or unknown

#### Root Causes

1. **No Explicit Position Closure**: The ledger has no concept of "closing" a position
2. **Quantity-Cost Basis Coupling**: Adjusting quantities affects cost basis in unintended ways
3. **Transfer Validation**: Transfers require equal-and-opposite quantities, which IL violates
4. **No True-Up Mechanism**: No way to say "actual holdings are X, make ledger match"

### Requirements

The reconciliation system must:

1. ✅ Allow quantity adjustments without distorting cost basis
2. ✅ Support "closing" positions to zero cleanly
3. ✅ Handle impermanent loss scenarios properly
4. ✅ Provide idempotent operations (can be re-run safely)
5. ✅ Integrate with existing cost basis recalculation
6. ✅ Maintain audit trail of adjustments

---

## Current Architecture Analysis

### Ledger Data Model

**Core Table**: `ledger_transactions` (Prisma/SQLite)

```prisma
model LedgerTransaction {
  id                    Int      @id @default(autoincrement())
  date_time             DateTime
  account_id            Int
  asset_id              Int
  quantity              Decimal  // Signed: positive = increase, negative = decrease
  tx_type               String   // Transaction type enum
  unit_price_in_base    Decimal?
  total_value_in_base   Decimal?
  fee_in_base           Decimal?
  external_reference    String?
  notes                 String?

  account               Account  @relation(...)
  asset                 Asset    @relation(...)

  @@index([date_time])
  @@index([tx_type])
}
```

### Transaction Types (Current)

```typescript
const ALLOWED_TX_TYPES = [
  'DEPOSIT',           // External deposit in
  'WITHDRAWAL',        // External withdrawal out
  'TRADE',             // Exchange trade
  'YIELD',             // Yield/rewards
  'NFT_TRADE',         // NFT transaction
  'OFFLINE_TRADE',     // Non-exchange trade
  'OTHER',             // Uncategorized
  'HEDGE',             // Hedging transaction
  'COST_BASIS_RESET',  // Manual cost basis override
  'TRANSFER',          // Movement between accounts
] as const;
```

### Holdings Calculation Engine

**File**: `lib/holdings.ts`

Holdings are computed by **replaying all ledger transactions** in chronological order:

```typescript
for (const tx of transactions) {
  const quantity = toNumber(tx.quantity);

  switch (tx.tx_type) {
    case 'COST_BASIS_RESET':
      // Override cost basis, quantity unchanged
      position.costBasis = abs(total_value_in_base);
      break;

    case 'DEPOSIT':
    case 'WITHDRAWAL':
    case 'TRADE':
    default:
      // Standard quantity + cost basis adjustment
      position.quantity += quantity;

      if (quantity > 0) {
        // Buy/deposit: add to cost basis
        if (hasValuation) {
          position.costBasis += total_value;
        } else {
          position.costBasisKnown = false;
        }
      } else {
        // Sell/withdraw: reduce cost basis proportionally
        if (position.costBasisKnown && position.quantity > 0) {
          const avgCost = position.costBasis / position.quantity;
          position.costBasis -= abs(quantity) * avgCost;
        }
      }
      break;
  }
}
```

**Key Characteristic**: All non-RESET transactions affect both quantity AND cost basis.

### Cost Basis Recalculation Engine

**File**: `lib/costBasisRecalc.ts`

**Purpose**: Create `COST_BASIS_RESET` snapshots to correct cost basis without changing quantities.

**Features**:
- Replays transactions with optional reset honoring
- Groups and validates transfers
- Detects unmatched/ambiguous transfers
- Emits diagnostic information

**Endpoint**: `POST /api/ledger/cost-basis-recalc`

### Transfer System

**Model**: Two-legged transfers (equal-and-opposite)

```typescript
// Example: Transfer 1 BTC from Account A to Account B
[
  { account_id: 1, asset_id: 1, quantity: -1, tx_type: 'TRANSFER' },
  { account_id: 2, asset_id: 1, quantity: +1, tx_type: 'TRANSFER' }
]
```

**Validation**:
- Must have exactly 2 legs
- Accounts must differ
- Asset must match
- Quantities must sum to zero (strict equality)
- Valuation consistency checked per leg

**Limitation for IL**: Cannot handle unequal quantities (e.g., 1 BTC → 1.2 BTC due to IL)

---

## Solution Overview

### Approach: Option B - Quantity True-ups + Cost Basis Resets

**Core Concept**: Introduce a new transaction type `RECONCILIATION` that adjusts quantities ONLY, without affecting cost basis.

#### Key Innovation

Unlike existing transaction types, `RECONCILIATION`:

| Aspect | RECONCILIATION | Other Types (DEPOSIT, WITHDRAWAL, etc.) |
|--------|---------------|------------------------------------------|
| Quantity | ✅ Adjusts | ✅ Adjusts |
| Cost Basis | ❌ No change | ✅ Adjusts |
| Basis Known flag | ❌ No change | ⚠️ May become unknown |
| Use case | True-up/correction | Economic events |

#### Why This Works for Impermanent Loss

1. **Deposit to LP Pool**:
   - `-1 BTC`, `-100,000 USDC` (from main account)

2. **Withdraw with IL**:
   - `+1.2 BTC`, `+80,000 USDC` (back to main account)
   - Quantities differ from deposit!

3. **Reconciliation Entry**:
   ```
   RECONCILIATION: +0.2 BTC  (adjusts quantity, NOT cost basis)
   RECONCILIATION: -20,000 USDC (adjusts quantity, NOT cost basis)
   ```

4. **Result**:
   - Holdings match actual wallet balance
   - Cost basis preserved (or manually reset if desired)
   - No "fake trades" created

---

## Detailed Implementation Plan

### Phase 1: Core Transaction Type

#### 1.1 Update `lib/ledger.ts`

**Location**: Line ~20 (ALLOWED_TX_TYPES constant)

**Change**:
```typescript
export const ALLOWED_TX_TYPES = [
  'DEPOSIT',
  'WITHDRAWAL',
  'TRADE',
  'YIELD',
  'NFT_TRADE',
  'OFFLINE_TRADE',
  'OTHER',
  'HEDGE',
  'COST_BASIS_RESET',
  'TRANSFER',
  'RECONCILIATION',  // ← NEW
] as const;
```

**Impact**:
- Automatically accepted by API validation
- Available in UI dropdowns
- Filterable in ledger queries

#### 1.2 Update `lib/holdings.ts`

**Change 1: Deterministic Ordering**

**Current** (Line ~80):
```typescript
orderBy: { date_time: 'asc' }
```

**Updated**:
```typescript
orderBy: [{ date_time: 'asc' }, { id: 'asc' }]
```

**Rationale**: When multiple reconciliation entries share the same timestamp, ensure consistent replay order.

**Change 2: Add RECONCILIATION Semantics**

**Location**: In main transaction loop (after COST_BASIS_RESET, before cash-like logic)

**Add**:
```typescript
if (tx.tx_type === 'RECONCILIATION') {
  position.quantity += quantity;

  // Optional: Clean up dust and ghost basis
  if (Math.abs(position.quantity) <= 1e-12) {
    position.quantity = 0;
    position.costBasis = 0;
  }

  positions.set(key, position);
  continue;
}
```

**Behavior**:
- ✅ Adjusts quantity
- ❌ Does NOT modify costBasis
- ❌ Does NOT change costBasisKnown
- ✅ Zeroes out basis when position closed

#### 1.3 Update `lib/costBasisRecalc.ts`

**Location**: Main recalc loop (where transaction types are handled)

**Add helper function**:
```typescript
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
```

**Add to main loop** (before TRANSFER logic):
```typescript
if (tx.tx_type === 'RECONCILIATION') {
  applyReconciliationTransaction(positions, tx);
  continue;
}
```

**Rationale**: Ensures cost basis recalculation produces results consistent with holdings engine.

---

### Phase 2: Reconciliation API Endpoint

#### 2.1 Create `app/api/ledger/reconcile/route.ts`

**Purpose**: Compute and create reconciliation entries to make ledger match target balances.

#### API Contract

**Endpoint**: `POST /api/ledger/reconcile`

**Request Schema**:
```typescript
type ReconcileTarget = {
  account_id: number | string;
  asset_id: number | string;
  target_quantity: string | number;
  notes?: string | null;
};

type ReconcilePayload = {
  as_of: string;                    // ISO datetime string
  targets: ReconcileTarget[];        // Accounts/assets to reconcile

  epsilon?: number;                 // Dust threshold (default: 1e-9)
  external_reference?: string | null; // Default: "RECON:<iso_timestamp>"
  notes?: string | null;            // Default batch notes

  mode?: 'PREVIEW' | 'COMMIT';      // Default: PREVIEW
  replace_existing?: boolean;       // Default: true (idempotent)
};
```

**Response Schema**:
```typescript
type ReconcilePreviewRow = {
  account_id: number;
  asset_id: number;
  current_quantity: string;    // Computed from ledger
  target_quantity: string;     // User input
  delta_quantity: string;      // Difference
  will_create: boolean;        // False if within epsilon
};

type ReconcileResponse = {
  as_of: string;
  external_reference: string;
  epsilon: number;
  mode: 'PREVIEW' | 'COMMIT';
  replace_existing: boolean;

  rows: ReconcilePreviewRow[];

  // COMMIT mode only
  created?: number;
  created_ids?: number[];
};
```

#### Implementation Details

**Step 1: Validation**

```typescript
// Parse and validate as_of timestamp
const asOf = parseLedgerDateTime(payload.as_of);

// Validate targets exist
const accountIds = targets.map(t => Number(t.account_id));
const assetIds = targets.map(t => Number(t.asset_id));

const existingAccounts = await prisma.account.findMany({
  where: { id: { in: accountIds } }
});

const existingAssets = await prisma.asset.findMany({
  where: { id: { in: assetIds } }
});

// Return 400 if any not found
```

**Step 2: Compute Current Quantities**

```typescript
// Efficient aggregation query
const grouped = await prisma.ledgerTransaction.groupBy({
  by: ['account_id', 'asset_id'],
  where: {
    date_time: { lte: asOf },
    account_id: { in: accountIds },
    asset_id: { in: assetIds },

    // Exclude existing reconciliation for this batch (if replace_existing)
    ...(replace_existing && externalReference ? {
      NOT: {
        tx_type: 'RECONCILIATION',
        external_reference: externalReference,
        date_time: asOf,
      }
    } : {}),
  },
  _sum: { quantity: true },
});

// Map to: currentQuantities[account_id][asset_id] = number
```

**Step 3: Compute Deltas**

```typescript
const rows: ReconcilePreviewRow[] = [];

for (const target of targets) {
  const current = currentQuantities[target.account_id]?.[target.asset_id] ?? 0;
  const targetQty = parseLedgerDecimal(target.target_quantity);
  const delta = targetQty - current;

  const willCreate = Math.abs(delta) > (payload.epsilon ?? 1e-9);

  rows.push({
    account_id: target.account_id,
    asset_id: target.asset_id,
    current_quantity: current.toString(),
    target_quantity: targetQty.toString(),
    delta_quantity: delta.toString(),
    will_create: willCreate,
  });
}
```

**Step 4: Preview Mode**

```typescript
if (mode === 'PREVIEW') {
  return Response.json({
    as_of: asOf.toISOString(),
    external_reference: externalReference,
    epsilon: payload.epsilon ?? 1e-9,
    mode: 'PREVIEW',
    replace_existing: replace_existing ?? true,
    rows,
  });
}
```

**Step 5: Commit Mode**

```typescript
if (mode === 'COMMIT') {
  // Idempotency: Delete existing reconciliation for this batch
  if (replace_existing && externalReference) {
    await prisma.ledgerTransaction.deleteMany({
      where: {
        tx_type: 'RECONCILIATION',
        external_reference: externalReference,
        date_time: asOf,
      },
    });
  }

  // Create new reconciliation entries
  const toCreate = rows
    .filter(r => r.will_create)
    .map(row => ({
      date_time: asOf,
      account_id: row.account_id,
      asset_id: row.asset_id,
      quantity: row.delta_quantity,
      tx_type: 'RECONCILIATION',
      external_reference: externalReference,
      notes: payload.notes ?? null,

      // Valuation fields intentionally null
      unit_price_in_base: null,
      total_value_in_base: null,
      fee_in_base: null,
    }));

  const created = await prisma.ledgerTransaction.createMany({
    data: toCreate,
  });

  return Response.json({
    as_of: asOf.toISOString(),
    external_reference: externalReference,
    epsilon: payload.epsilon ?? 1e-9,
    mode: 'COMMIT',
    replace_existing: replace_existing ?? true,
    rows,

    created: created.count,
  });
}
```

#### Error Handling

```typescript
// 400: Invalid timestamp
if (!asOf || isNaN(asOf.getTime())) {
  return Response.json(
    { error: 'Invalid as_of timestamp' },
    { status: 400 }
  );
}

// 400: Empty targets
if (!targets || targets.length === 0) {
  return Response.json(
    { error: 'targets must not be empty' },
    { status: 400 }
  );
}

// 400: Account/asset not found
const missingAccounts = accountIds.filter(
  id => !existingAccounts.find(a => a.id === id)
);
if (missingAccounts.length > 0) {
  return Response.json(
    { error: `Accounts not found: ${missingAccounts.join(', ')}` },
    { status: 400 }
  );
}

// Similar for assets
```

---

### Phase 3: User Interface

#### 3.1 Create `app/(authenticated)/settings/_components/ReconciliationCard.tsx`

**Purpose**: UI workflow for reconciliation (preview → commit → recalc)

**Component Structure**:

```typescript
type TargetRow = {
  id: string;          // Client-side UUID
  accountId: string;
  assetId: string;
  targetQuantity: string;
  notes?: string;
};

type PreviewState = {
  as_of: string;
  external_reference: string;
  rows: Array<{
    account_id: number;
    asset_id: number;
    current_quantity: string;
    target_quantity: string;
    delta_quantity: string;
    will_create: boolean;
  }>;
};

export function ReconciliationCard() {
  // State
  const [asOf, setAsOf] = useState(new Date().toISOString());
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  // Handlers
  const addTargetRow = () => { /* ... */ };
  const removeTargetRow = (id: string) => { /* ... */ };
  const updateTargetRow = (id: string, field: string, value: string) => { /* ... */ };

  const handlePreview = async () => {
    setIsPreviewing(true);
    const response = await fetch('/api/ledger/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        as_of: asOf,
        targets: targets.map(t => ({
          account_id: Number(t.accountId),
          asset_id: Number(t.assetId),
          target_quantity: t.targetQuantity,
        })),
        mode: 'PREVIEW',
      }),
    });
    const data = await response.json();
    setPreview(data);
    setIsPreviewing(false);
  };

  const handleCommit = async () => {
    setIsCommitting(true);
    const response = await fetch('/api/ledger/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        as_of: asOf,
        targets: targets.map(t => ({
          account_id: Number(t.accountId),
          asset_id: Number(t.assetId),
          target_quantity: t.targetQuantity,
        })),
        mode: 'COMMIT',
        replace_existing: true,
      }),
    });
    // Show success message, clear preview
    setIsCommitting(false);
    setPreview(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reconciliation</CardTitle>
        <CardDescription>
          True-up quantities to match actual balances (e.g., after LP exits with impermanent loss)
        </CardDescription>
      </CardHeader>

      <CardContent>
        {/* As-of timestamp input */}
        <DatePicker value={asOf} onChange={setAsOf} />

        {/* Target rows */}
        {targets.map(target => (
          <TargetRowEditor
            key={target.id}
            target={target}
            accounts={accounts}
            assets={assets}
            onUpdate={updateTargetRow}
            onRemove={() => removeTargetRow(target.id)}
          />
        ))}

        <Button onClick={addTargetRow}>Add Target</Button>

        {/* Preview table */}
        {preview && (
          <PreviewTable rows={preview.rows} />
        )}
      </CardContent>

      <CardFooter>
        <Button onClick={handlePreview} disabled={isPreviewing}>
          Preview
        </Button>
        <Button onClick={handleCommit} disabled={!preview || isCommitting}>
          Apply
        </Button>
      </CardFooter>
    </Card>
  );
}
```

**UI Components Needed**:

1. **DatePicker**: For `as_of` timestamp
2. **TargetRowEditor**: Single target row with:
   - Account dropdown
   - Asset dropdown
   - Target quantity input
   - Notes input (optional)
   - Remove button
3. **PreviewTable**: Shows current/target/delta in tabular format

#### 3.2 Update `app/(authenticated)/settings/page.tsx`

**Location**: After existing Cost Basis Recalc card

**Add**:
```typescript
import { ReconciliationCard } from './_components/ReconciliationCard';

// In component return:
<div className="space-y-6">
  {/* Existing cards... */}

  <CostBasisRecalcCard />
  <UnmatchedDiagnosticsViewer />

  {/* NEW */}
  <ReconciliationCard />
</div>
```

#### 3.3 Update `app/(authenticated)/ledger/LedgerForm.tsx`

**Purpose**: Make RECONCILIATION type available for manual entry

**Location**: TX_TYPE_LABELS constant (Line ~50)

**Add**:
```typescript
const TX_TYPE_LABELS = {
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
  RECONCILIATION: 'Reconciliation (Quantity True-Up)',  // ← NEW
};
```

**Optional Enhancement**: Add helper text when RECONCILIATION is selected:

```typescript
{txType === 'RECONCILIATION' && (
  <p className="text-sm text-muted-foreground">
    Adjusts quantity only. Does not affect cost basis. Use for true-ups and closing positions.
  </p>
)}
```

---

### Phase 4: Documentation

#### 4.1 Update `docs/04-implementation-details.md`

**Add section**: "Reconciliation for Impermanent Loss and True-Ups"

```markdown
## Reconciliation

### Purpose

The `RECONCILIATION` transaction type allows quantity adjustments without affecting cost basis.
This is particularly useful for:

- **Impermanent loss reconciliation**: After exiting liquidity pools with different asset ratios
- **Quantity true-ups**: Correcting discrepancies between ledger and actual balances
- **Position closure**: Zeroing out positions without realizing gains/losses

### Semantics

When the holdings engine encounters a `RECONCILIATION` transaction:

1. **Quantity**: Adjusted by `tx.quantity` (signed)
2. **Cost basis**: Unchanged
3. **Cost basis known flag**: Unchanged
4. **Dust handling**: If quantity → 0, cost basis also set to 0

### API Usage

**Endpoint**: `POST /api/ledger/reconcile`

**Preview Mode**:
\`\`\`json
{
  "as_of": "2025-01-15T10:00:00Z",
  "targets": [
    { "account_id": 1, "asset_id": 5, "target_quantity": "1.2" },
    { "account_id": 1, "asset_id": 6, "target_quantity": "80000" }
  ],
  "mode": "PREVIEW"
}
\`\`\`

**Commit Mode**:
\`\`\`json
{
  "as_of": "2025-01-15T10:00:00Z",
  "targets": [...],
  "mode": "COMMIT",
  "replace_existing": true
}
\`\`\`

### Workflow

1. User enters target balances for `as_of` timestamp
2. System computes deltas: `delta = target - current`
3. Preview shows what will change
4. On commit, creates `RECONCILIATION` entries for non-trivial deltas
5. Optionally run cost basis recalculation to adjust basis

### Idempotency

Reconciliation is idempotent when using the same `external_reference` and `as_of` timestamp:
- Previous entries with matching reference/timestamp are deleted
- New entries are created
- Net result is consistent

### Integration with Cost Basis Reset

Reconciliation and cost basis reset serve complementary roles:

- **Reconciliation**: Makes quantities correct
- **Cost basis reset**: Makes cost basis correct

Typical workflow:
1. Run reconciliation to fix quantities
2. Run cost basis recalculation to fix basis
3. Holdings now match reality with accurate PnL
```

---

### Phase 5: Database Optimization (Optional)

#### 5.1 Add Indexes to `prisma/schema.prisma`

**Current indexes**:
```prisma
model LedgerTransaction {
  // ...

  @@index([date_time])
  @@index([tx_type])
}
```

**Recommended additions**:
```prisma
model LedgerTransaction {
  // ...

  @@index([date_time])
  @@index([tx_type])
  @@index([external_reference])  // ← NEW
  @@index([tx_type, external_reference, date_time])  // ← NEW for idempotency deletes
}
```

**Rationale**:
- Faster `deleteMany` queries for idempotency
- Faster audit queries by reconciliation batch
- Minimal storage overhead

**Migration**:
```bash
npx prisma migrate dev --name add_reconciliation_indexes
```

---

## API Specifications

### Complete API Reference

#### POST /api/ledger/reconcile

**Purpose**: Compute and create reconciliation entries.

**Authentication**: Required (user session)

**Request**:
```typescript
POST /api/ledger/reconcile
Content-Type: application/json

{
  "as_of": "2025-01-15T10:30:00Z",
  "targets": [
    {
      "account_id": 1,
      "asset_id": 5,
      "target_quantity": "1.23456789",
      "notes": "After LP exit"
    },
    {
      "account_id": 1,
      "asset_id": 6,
      "target_quantity": "80000"
    }
  ],
  "epsilon": 0.000001,
  "external_reference": "LP_EXIT_2025-01-15",
  "notes": "Reconcile after Uniswap position exit",
  "mode": "PREVIEW",
  "replace_existing": true
}
```

**Response (PREVIEW)**:
```typescript
200 OK

{
  "as_of": "2025-01-15T10:30:00Z",
  "external_reference": "LP_EXIT_2025-01-15",
  "epsilon": 0.000001,
  "mode": "PREVIEW",
  "replace_existing": true,

  "rows": [
    {
      "account_id": 1,
      "asset_id": 5,
      "current_quantity": "1.0",
      "target_quantity": "1.23456789",
      "delta_quantity": "0.23456789",
      "will_create": true
    },
    {
      "account_id": 1,
      "asset_id": 6,
      "current_quantity": "100000",
      "target_quantity": "80000",
      "delta_quantity": "-20000",
      "will_create": true
    }
  ]
}
```

**Response (COMMIT)**:
```typescript
200 OK

{
  "as_of": "2025-01-15T10:30:00Z",
  "external_reference": "LP_EXIT_2025-01-15",
  "epsilon": 0.000001,
  "mode": "COMMIT",
  "replace_existing": true,

  "rows": [...],  // Same as preview

  "created": 2,
  "created_ids": [12345, 12346]
}
```

**Error Responses**:

400 Bad Request:
```typescript
{
  "error": "Invalid as_of timestamp"
}
```

```typescript
{
  "error": "Accounts not found: 999"
}
```

```typescript
{
  "error": "Assets not found: 888"
}
```

---

## UI/UX Design

### User Workflow

#### Step 1: Navigate to Settings
```
User → Settings → Reconciliation Card
```

#### Step 2: Configure Reconciliation

**Input Fields**:
1. **As-of Date/Time**: When to apply reconciliation (default: now)
2. **Target Rows**: One or more
   - Account (dropdown)
   - Asset (dropdown)
   - Target Quantity (number input)
   - Notes (optional text)

**Example**:
```
As-of: [2025-01-15 14:30]

Targets:
┌─────────────────────────────────────────────────────┐
│ Account: [Main Wallet ▼]                            │
│ Asset:    [Bitcoin ▼]                               │
│ Target:   [1.2]                                     │
│ Notes:    [After LP exit with IL]                   │
│          [Remove]                                   │
├─────────────────────────────────────────────────────┤
│ Account: [Main Wallet ▼]                            │
│ Asset:    [USDC ▼]                                  │
│ Target:   [80000]                                   │
│ Notes:    []                                        │
│          [Remove]                                   │
└─────────────────────────────────────────────────────┘

[+ Add Target]
```

#### Step 3: Preview

Click **Preview** → See what will change:

```
Preview Results:
┌──────────┬──────────┬───────────┬────────────┬────────┐
│ Account  │ Asset    │ Current   │ Target     │ Delta  │
├──────────┼──────────┼───────────┼────────────┼────────┤
│ Main     │ BTC      │ 1.00000   │ 1.20000    │ +0.20  │
│ Main     │ USDC     │ 100,000   │ 80,000     │ -20K   │
└──────────┴──────────┴───────────┴────────────┴────────┘

2 reconciliation entries will be created.
```

#### Step 4: Apply

Click **Apply** → Entries created → Success message:

```
✓ Created 2 reconciliation entries.

Next steps:
- [Recalculate Cost Basis] [View Ledger]
```

#### Step 5: Optional Cost Basis Recalc

User can click "Recalculate Cost Basis" to fix basis after quantities are correct.

### Screen Layout

**Settings Page Structure**:
```
┌─────────────────────────────────────────────────┐
│ Settings                                         │
├─────────────────────────────────────────────────┤
│                                                 │
│ [Cost Basis Recalculation Card]                 │
│ - Recalculate cost basis                        │
│ - View transfer diagnostics                     │
│                                                 │
│ [Unmatched Transfers Card]                      │
│ - Resolve AMBIGUOUS transfers                   │
│                                                 │
│ [Reconciliation Card]               ← NEW       │
│ - True-up quantities                           │
│ - Close positions                              │
│ - Reconcile IL                                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Visual Design Considerations

1. **Preview vs Commit**: Clearly distinguish modes (preview = read-only, commit = write)
2. **Delta highlighting**: Color-code deltas (green = increase, red = decrease)
3. **Validation feedback**: Show errors inline (invalid account, missing asset, etc.)
4. **Progress indication**: Loading states for preview/commit operations
5. **Success confirmation**: Show count of created entries + next actions

---

## Testing Strategy

### Unit Tests

#### Test 1: Delta Computation
```typescript
describe('computeDeltas', () => {
  it('should compute correct delta', () => {
    const current = 1.0;
    const target = 1.2;
    const delta = target - current;
    expect(delta).toBe(0.2);
  });

  it('should handle negative deltas', () => {
    const current = 100000;
    const target = 80000;
    const delta = target - current;
    expect(delta).toBe(-20000);
  });

  it('should suppress dust within epsilon', () => {
    const current = 1.0;
    const target = 1.000000001;
    const epsilon = 1e-9;
    const delta = target - current;
    const willCreate = Math.abs(delta) > epsilon;
    expect(willCreate).toBe(false);
  });
});
```

#### Test 2: Holdings Replay with RECONCILIATION
```typescript
describe('holdings replay', () => {
  it('should adjust quantity without affecting cost basis', () => {
    const transactions = [
      { quantity: 1.0, tx_type: 'DEPOSIT', unit_price: 50000, ... },
      { quantity: 0.2, tx_type: 'RECONCILIATION', ... },
    ];

    const position = replayTransactions(transactions);

    expect(position.quantity).toBe(1.2);
    expect(position.costBasis).toBe(50000);  // Unchanged!
    expect(position.costBasisKnown).toBe(true);
  });

  it('should zero out position when reconciliation makes quantity zero', () => {
    const transactions = [
      { quantity: 1.0, tx_type: 'DEPOSIT', unit_price: 50000, ... },
      { quantity: -1.0, tx_type: 'RECONCILIATION', ... },
    ];

    const position = replayTransactions(transactions);

    expect(position.quantity).toBe(0);
    expect(position.costBasis).toBe(0);  // Also zeroed
  });
});
```

#### Test 3: Cost Basis Recalc with RECONCILIATION
```typescript
describe('costBasisRecalc', () => {
  it('should treat reconciliation as quantity-only', () => {
    const transactions = [
      { quantity: 1.0, tx_type: 'DEPOSIT', total_value: 50000 },
      { quantity: 0.2, tx_type: 'RECONCILIATION' },
    ];

    const positions = recalcCostBasis(transactions);
    const btcPosition = positions.get('1-5');  // account 1, asset 5 (BTC)

    expect(btcPosition.quantity).toBe(1.2);
    expect(btcPosition.costBasis).toBe(50000);
  });
});
```

### Integration Tests

#### Test 4: API Preview Mode
```typescript
describe('POST /api/ledger/reconcile (PREVIEW)', () => {
  it('should return preview without creating entries', async () => {
    const response = await fetch('/api/ledger/reconcile', {
      method: 'POST',
      body: JSON.stringify({
        as_of: '2025-01-15T10:00:00Z',
        targets: [
          { account_id: 1, asset_id: 5, target_quantity: '1.2' },
        ],
        mode: 'PREVIEW',
      }),
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.mode).toBe('PREVIEW');
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].will_create).toBe(true);

    // Verify no entries created
    const entries = await prisma.ledgerTransaction.findMany({
      where: { tx_type: 'RECONCILIATION' },
    });
    expect(entries).toHaveLength(0);
  });
});
```

#### Test 5: API Commit Mode
```typescript
describe('POST /api/ledger/reconcile (COMMIT)', () => {
  it('should create reconciliation entries', async () => {
    const response = await fetch('/api/ledger/reconcile', {
      method: 'POST',
      body: JSON.stringify({
        as_of: '2025-01-15T10:00:00Z',
        targets: [
          { account_id: 1, asset_id: 5, target_quantity: '1.2' },
        ],
        mode: 'COMMIT',
      }),
    });

    const data = await response.json();

    expect(data.created).toBe(1);

    // Verify entry created
    const entries = await prisma.ledgerTransaction.findMany({
      where: { tx_type: 'RECONCILIATION' },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].quantity).toBe('0.2');
  });
});
```

#### Test 6: Idempotency
```typescript
describe('Idempotency', () => {
  it('should replace existing entries with same reference', async () => {
    const payload = {
      as_of: '2025-01-15T10:00:00Z',
      external_reference: 'TEST_RECON',
      targets: [
        { account_id: 1, asset_id: 5, target_quantity: '1.2' },
      ],
      mode: 'COMMIT',
      replace_existing: true,
    };

    // First call
    await fetch('/api/ledger/reconcile', { method: 'POST', body: JSON.stringify(payload) });

    // Second call (should replace, not duplicate)
    await fetch('/api/ledger/reconcile', { method: 'POST', body: JSON.stringify(payload) });

    // Should still be only 1 entry
    const entries = await prisma.ledgerTransaction.findMany({
      where: {
        tx_type: 'RECONCILIATION',
        external_reference: 'TEST_RECON',
      },
    });
    expect(entries).toHaveLength(1);
  });
});
```

### Manual QA Checklist

#### Ledger Operations
- [ ] Create reconciliation via API in preview mode
- [ ] Create reconciliation via API in commit mode
- [ ] Verify reconciliation entries appear in ledger list
- [ ] Edit reconciliation entry (update quantity/notes)
- [ ] Delete reconciliation entry
- [ ] Filter ledger by tx_type=RECONCILIATION

#### Holdings Calculations
- [ ] Verify holdings quantity updates after reconciliation
- [ ] Verify cost basis UNCHANGED after reconciliation
- [ ] Verify cost basis known flag unchanged
- [ ] Test position closure (quantity → 0 zeroes basis)

#### Cost Basis Recalc
- [ ] Run cost basis recalc after reconciliation
- [ ] Verify recalc handles reconciliation entries correctly
- [ ] Verify transfer diagnostics still work

#### UI Workflow
- [ ] Navigate to Settings → Reconciliation
- [ ] Add/remove target rows
- [ ] Select account/asset from dropdowns
- [ ] Enter target quantities
- [ ] Click preview and verify results table
- [ ] Click apply and verify success message
- [ ] Run follow-up cost basis recalc

#### Edge Cases
- [ ] Empty targets array (should error)
- [ ] Invalid account ID (should error)
- [ ] Invalid asset ID (should error)
- [ ] Target equals current (should skip)
- [ ] Delta within epsilon (should skip)
- [ ] Negative target quantity
- [ ] Very large quantities
- [ ] Unicode in external_reference/notes

---

## Usage Examples

### Example 1: Simple Impermanent Loss Reconciliation

**Scenario**: Uniswap BTC/USDC position with IL

**Initial State** (in ledger):
```
Account: Main Wallet
- BTC:  0 (transferred to Uniswap)
- USDC: 0 (transferred to Uniswap)
```

**After LP Exit** (actual wallet):
```
Account: Main Wallet
- BTC:  1.2 (impermanent loss: got more BTC)
- USDC: 80,000 (impermanent loss: got less USDC)
```

**Reconciliation Request**:
```json
POST /api/ledger/reconcile

{
  "as_of": "2025-01-15T14:30:00Z",
  "targets": [
    { "account_id": 1, "asset_id": 5, "target_quantity": "1.2" },
    { "account_id": 1, "asset_id": 6, "target_quantity": "80000" }
  ],
  "mode": "PREVIEW"
}
```

**Preview Response**:
```json
{
  "rows": [
    {
      "account_id": 1,
      "asset_id": 5,
      "current_quantity": "0",
      "target_quantity": "1.2",
      "delta_quantity": "1.2",
      "will_create": true
    },
    {
      "account_id": 1,
      "asset_id": 6,
      "current_quantity": "0",
      "target_quantity": "80000",
      "delta_quantity": "80000",
      "will_create": true
    }
  ]
}
```

**Commit**:
```json
POST /api/ledger/reconcile

{
  "as_of": "2025-01-15T14:30:00Z",
  "targets": [
    { "account_id": 1, "asset_id": 5, "target_quantity": "1.2" },
    { "account_id": 1, "asset_id": 6, "target_quantity": "80000" }
  ],
  "mode": "COMMIT",
  "external_reference": "UNISLP_BTC_USDC_EXIT"
}
```

**Result**: Holdings now match actual wallet. Cost basis unchanged (or manually reset if desired).

---

### Example 2: Closing a Position

**Scenario**: Zero out a closed trading position

**Current Holdings**:
```
Account: Trading
- ETH: 5.5 (want to close to 0)
```

**Reconciliation Request**:
```json
{
  "as_of": "2025-01-15T16:00:00Z",
  "targets": [
    { "account_id": 2, "asset_id": 7, "target_quantity": "0" }
  ],
  "mode": "COMMIT"
}
```

**Result**:
- Creates RECONCILIATION entry: `-5.5 ETH`
- Position quantity becomes 0
- Cost basis becomes 0 (clean closure)
- No "sale" transaction created

---

### Example 3: Quantity Correction

**Scenario**: Ledger shows 10.5 ETH, but actual wallet has 10.49543

**Reconciliation Request**:
```json
{
  "as_of": "2025-01-15T17:00:00Z",
  "targets": [
    { "account_id": 1, "asset_id": 7, "target_quantity": "10.49543" }
  ],
  "epsilon": 0.00001,
  "mode": "COMMIT"
}
```

**Result**:
- Creates RECONCILIATION entry: `-0.00457 ETH`
- Holdings now match actual balance
- Cost basis unchanged

---

### Example 4: Multi-Project Transfer with IL

**Scenario**: LP exit → transfer to new project → reconcile

**Step 1**: Exit LP with IL (wallet now has different ratios)

**Step 2**: Transfer to new project:
```json
// These would be TRANSFER entries
[
  { account_id: 1, asset_id: 5, quantity: -1.2, tx_type: 'TRANSFER' },  // From Main
  { account_id: 3, asset_id: 5, quantity: +1.2, tx_type: 'TRANSFER' },  // To Project B
]
```

**Step 3**: Reconcile Project B to actual deployment:
```json
POST /api/ledger/reconcile

{
  "as_of": "2025-01-15T18:00:00Z",
  "targets": [
    { "account_id": 3, "asset_id": 5, "target_quantity": "1.15" },  // Some used for fees
    { "account_id": 3, "asset_id": 6, "target_quantity": "79500" }  // Some used for gas
  ],
  "mode": "COMMIT"
}
```

**Result**: Clean ledger across both accounts.

---

### Example 5: Reconciliation + Cost Basis Reset

**Scenario**: After IL reconciliation, want to reset cost basis to current value

**Step 1**: Reconcile quantities (as shown in Example 1)

**Step 2**: Run cost basis recalculation:
```json
POST /api/ledger/cost-basis-recalc

{
  "as_of": "2025-01-15T14:30:00Z",
  "mode": "HONOR_RESETS"
}
```

**Result**:
- Quantities correct (from reconciliation)
- Cost basis reset to current market value (from recalc)
- Unrealized PnL accurate going forward

---

## Future Enhancements

### Short-Term Improvements

1. **Batch Operations**
   - Reconcile multiple accounts at once
   - Import targets from CSV/JSON

2. **Enhanced Validation**
   - Warn if delta > 10% of current (possible error)
   - Suggest corrections based on historical patterns

3. **Audit Trail**
   - UI showing all reconciliation entries by external_reference
   - Diff view: "before vs after" for holdings

4. **Automation**
   - Auto-detect discrepancies via external balance sync
   - Scheduled reconciliation (e.g., daily at midnight)

### Long-Term Features

1. **Option A: LP Token Assets**
   - Represent LP tokens as separate assets
   - Multi-leg trades (3+ legs)
   - Native LP position tracking

2. **Realized PnL Tracking**
   - Track realized gains/losses explicitly
   - Generate tax reports
   - Tie realized events to specific transactions

3. **Advanced Cost Basis Methods**
   - FIFO (first-in, first-out)
   - LIFO (last-in, first-out)
   - Specific lot identification

4. **Reconciliation Workflow Engine**
   - Multi-step approval process
   - Require confirmation for large deltas
   - Integration with external audit systems

---

## Appendix

### A. Transaction Type Comparison Matrix

| tx_type | Quantity | Cost Basis | Basis Known | Use Case |
|---------|----------|------------|-------------|----------|
| DEPOSIT | + | Adjusts | May become unknown | External deposit |
| WITHDRAWAL | - | Adjusts | May become unknown | External withdrawal |
| TRADE | ± | Adjusts | May become unknown | Exchange trade |
| YIELD | + | Adjusts | May become unknown | Rewards/interest |
| COST_BASIS_RESET | 0 | **Override** | Set | Manual basis correction |
| TRANSFER | ± | Adjusts | May become unknown | Move between accounts |
| **RECONCILIATION** | ± | **Unchanged** | **Unchanged** | **Quantity true-up** |

### B. Error Code Reference

| Code | Message | Cause | Solution |
|------|---------|-------|----------|
| 400 | Invalid as_of timestamp | Malformed date string | Use ISO 8601 format |
| 400 | targets must not be empty | Empty targets array | Provide at least 1 target |
| 400 | Accounts not found: {ids} | Invalid account IDs | Verify accounts exist |
| 400 | Assets not found: {ids} | Invalid asset IDs | Verify assets exist |
| 500 | Database error | Prisma/query failure | Check logs, retry |

### C. Performance Considerations

**Time Complexity**:
- Preview: O(n) where n = number of targets (groupBy aggregation)
- Commit: O(n) create + O(m) delete where m = existing entries for batch
- Holdings replay: O(t) where t = total transactions (unchanged)

**Database Load**:
- groupBy query: Single aggregation (efficient)
- deleteMany: Indexed on tx_type + external_reference + date_time
- createMany: Bulk insert (single transaction)

**Optimization Tips**:
- Use indexes on `external_reference` and composite `[tx_type, external_reference, date_time]`
- Batch reconciliations (process multiple targets in single API call)
- Run recalculation after reconciliation (not before)

---

## Conclusion

This specification provides a complete implementation plan for **Option B: Quantity True-ups + Cost Basis Resets** to handle impermanent loss and ledger reconciliation scenarios.

### Key Benefits

1. ✅ **Minimal Code Changes**: New tx_type + API endpoint + UI card
2. ✅ **Backward Compatible**: Existing transactions and logic unchanged
3. ✅ **Idempotent**: Safe to re-run with same parameters
4. ✅ **Composable**: Works with existing cost basis reset and transfer features
5. ✅ **User-Friendly**: Preview → commit workflow with clear feedback

### Implementation Order

**Phase 1** (1-2 hours):
- Add RECONCILIATION to allowed types
- Implement replay semantics in holdings.ts
- Implement replay semantics in costBasisRecalc.ts

**Phase 2** (2-3 hours):
- Create `/api/ledger/reconcile` endpoint
- Implement validation, preview, and commit modes
- Add error handling and idempotency

**Phase 3** (2-3 hours):
- Create ReconciliationCard UI component
- Integrate into Settings page
- Update LedgerForm with new tx_type label

**Phase 4** (1 hour):
- Update documentation
- Add optional database indexes
- Testing and QA

**Total Estimated Time**: 6-9 hours

### Next Steps

1. Review and approve this specification
2. Begin Phase 1 implementation
3. Test replay semantics thoroughly
4. Proceed to Phase 2 (API)
5. Build UI in Phase 3
6. Document and polish in Phase 4

---

**Document Version**: 1.0
**Last Updated**: 2025-01-15
**Status**: Ready for Implementation
