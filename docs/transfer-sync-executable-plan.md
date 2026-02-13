# Transfer Sync: Elegant Fix for Manual TRANSFER vs CCXT Auto-Sync Conflicts

**Context:** `TRANSFER_SYNC_PROBLEM.md`, `TRANSFER_FLOW_DIAGRAM.txt`  
**Primary failure mode:** the system currently uses **one field** (`external_reference`) to serve two unrelated purposes:

1. **Idempotency / source identity** (CCXT movement ID like `CCXT:bybit:DEPOSIT:...`)
2. **Transfer pairing key** (manual match refs like `MATCH:uuid`)

When users create a manual transfer that touches an auto-synced CEX account, CCXT later imports the same deposit/withdrawal and we end up with **double-counted balances** and **broken cost basis propagation**.

---

## Brainstorm → “Elegant” solution

### Key idea: Separate *source identity* from *pairing identity*

Introduce a dedicated, first-class **transfer pairing identifier** on `LedgerTransaction` (e.g. `match_reference` / `transfer_group_id`).

- `external_reference` stays **immutable**, and represents “where did this row come from?” (CCXT txid, bank ref, user spreadsheet ref, etc.)
- `match_reference` becomes the **only** thing used to pair transfer legs.

This unlocks a clean merge strategy:

- If a CCXT deposit corresponds to an already-entered destination TRANSFER leg, we **attach** the CCXT id to that leg (update its `external_reference`) instead of creating a new DEPOSIT.
- If a CCXT deposit exists and the user later creates a TRANSFER, we **convert** the CCXT DEPOSIT row into a TRANSFER leg by setting `tx_type='TRANSFER'` and `match_reference=...` (without touching `external_reference`).

### Why this is better than heuristics alone

Heuristics (“look ±1h for matching amount”) are still useful, but the architectural win is:

- CCXT idempotency remains correct because the CCXT reference stays present.
- Transfer matching becomes stable and does not depend on timestamps lining up.
- Reconcile UI no longer needs to overload `external_reference` with `MATCH:*`.

### Secondary must-fix

`/app/api/ledger/resolve-transfer/route.ts` currently **SEPARATE**s by only changing `tx_type`, but **does not clear the match ref**, which can keep unrelated legs grouped. With `match_reference`, the separate action becomes safe and explicit.

---

## Executable plan (implementation-ready)

### Phase 0 — Guardrails (same-day)

1. **Add a hotfix to resolve-transfer SEPARATE**
   - File: `app/api/ledger/resolve-transfer/route.ts`
   - Change: when separating, also clear the grouping key.
     - **Today:** clear `external_reference` if it starts with `MATCH:`
     - **After Phase 1:** clear `match_reference`

**Acceptance:** separating legs cannot leave them re-grouped by a lingering `MATCH:*` value.

---

### Phase 1 — Schema + pairing ref (1–2 days)

2. **DB: add `match_reference` to `LedgerTransaction`**
   - File: `prisma/schema.prisma`
   - Add:
     ```prisma
     model LedgerTransaction {
       // ...existing
       match_reference String?
       @@index([match_reference])
     }
     ```
   - Run:
     - `pnpm prisma:migrate`
     - `pnpm prisma:generate`

3. **Update cost basis transfer grouping to use `match_reference`**
   - File: `lib/costBasisRecalc.ts`
   - Update `RecalcTransaction` type to include `match_reference?: string | null`
   - Update `buildTransferKey()`:
     - If `match_reference` is present → group by `asset_id|match_reference`
     - Else fallback to legacy grouping (`asset_id|date_time|external_reference`)
   - Update `isManualMatch` logic to check `match_reference` (not `external_reference`).

4. **Update transfer-issues API to pass `match_reference`**
   - File: `app/api/ledger/transfer-issues/route.ts`

**Acceptance:** existing transfers still recalc; new code groups correctly when `match_reference` is set.

---

### Phase 2 — Make manual transfers always create a match_reference (0.5–1 day)

5. **Server-side: generate a `match_reference` for new TRANSFER creations**
   - File: `app/api/ledger/route.ts`
   - In the multi-leg create path for `txType === 'TRANSFER'`:
     - Generate `const matchRef = `MATCH:${crypto.randomUUID()}``
     - Persist both legs with `match_reference: matchRef`
   - Do **not** require UI to provide it.

**Acceptance:** every transfer created via the API is pair-stable even if timestamps drift.

---

### Phase 3 — CCXT movement merge (prevents duplicates) (1–2 days)

6. **CCXT sync: before inserting a movement row, try to merge it into an existing TRANSFER leg**
   - File: `lib/ccxt/sync.ts` (movement persist section around `toMovementLedgerRows` usage)
   - For each candidate movement row (deposit/withdrawal):

   **6.1 Find existing transfer leg on the same account**
   - Match conditions (initial heuristic):
     - `account_id === movement.account_id`
     - `asset_id === movement.asset_id`
     - `tx_type === 'TRANSFER'`
     - `quantity === movement.quantity` (exact string->Decimal match) or within tolerance
     - `date_time` within configurable window (env): `CCXT_TRANSFER_MERGE_WINDOW_MINUTES` default 360

   **6.2 If found, attach CCXT identity instead of creating a DEPOSIT/WITHDRAWAL**
   - If transfer leg has `external_reference` null/empty → set it to the CCXT `external_reference`
   - Else keep it, but still skip creating the duplicate movement row.

   **6.3 If not found → create movement row as before**

   Notes:
   - This keeps CCXT idempotency (we still have the CCXT ref on *some* row) and avoids duplicate balances.
   - Matching stays cheap if implemented as a single query per batch (group movements by `(asset_id, quantity)` and query existing transfers in one shot).

**Acceptance:** create manual transfer first → CCXT sync later does not add a duplicate deposit/withdrawal.

---

### Phase 4 — “Reverse order” merge (CCXT first, manual transfer later) (1–2 days)

7. **Transfer creation should reuse an existing CCXT movement row when present**
   - File: `app/api/ledger/route.ts` (TRANSFER create path)

   Behavior:
   - User submits a new TRANSFER (two legs).
   - Server generates `match_reference` (Phase 2).
   - For each leg, attempt to find an existing CCXT movement row that represents that leg:
     - Destination (+qty): look for `tx_type='DEPOSIT'` + `external_reference startsWith 'CCXT:'`
     - Source (-qty): look for `tx_type='WITHDRAWAL'` + `external_reference startsWith 'CCXT:'`
     - Same `account_id`, `asset_id`, matching `quantity`, within time window.

   If found:
   - Update the CCXT row:
     - `tx_type = 'TRANSFER'`
     - `match_reference = matchRef`
     - Optionally align `date_time` to the max(date_time among legs) or to the CCXT timestamp.
   - Create only the missing opposite leg (the non-CCXT side).

**Acceptance:** CCXT sync first → user creates transfer later → system ends up with exactly two TRANSFER legs (no extra DEPOSIT/WITHDRAWAL).

---

### Phase 5 — Data backfill + cleanup (0.5–1 day + review)

8. **Backfill match_reference for existing transfers**

Create a one-off script (Node) under `scripts/`:

- If a transfer has `external_reference LIKE 'MATCH:%'`:
  - Set `match_reference = external_reference`
  - (Optional) clear `external_reference` if you want to reserve it purely for source ids; otherwise keep it.

- For transfer rows with `match_reference IS NULL`:
  - Group by legacy key: `asset_id + date_time + external_reference` (same as current `buildTransferKey` fallback)
  - If group size is exactly 2:
    - assign a generated `MATCH:*` to both as `match_reference`
  - If group size != 2: leave as-is so Reconcile UI can handle.

9. **Cleanup historical duplicates (optional but recommended)**

- Find CCXT movement rows that duplicate an existing transfer leg (same account/asset/qty/time window).
- Prefer:
  - attach the CCXT `external_reference` to the transfer leg (if empty)
  - delete the duplicate DEPOSIT/WITHDRAWAL row

**Acceptance:** transfer-issues diagnostics decrease; duplicate balances disappear for known historical conflicts.

---

### Phase 6 — UX + monitoring (0.5–1 day)

10. **UI warning when making transfers to auto-synced accounts**
- File: `app/(authenticated)/ledger/LedgerForm.tsx`
- Detect destination account has `ccxt_connection`.
- Show warning: “This account auto-syncs deposits/withdrawals. Transfers will be merged automatically.”

11. **Add basic monitoring logs**
- Log counts during CCXT sync:
  - movements created
  - movements merged into transfers
  - movements skipped due to existing transfer

**Acceptance:** Operators can confirm merges are happening and spot anomalous spikes.

---

## Implementation notes (current behavior)

- `POST /api/ledger/resolve-transfer` now sets `match_reference` (not `external_reference`) for `MATCH` and preserves source identity.
- `SEPARATE` now clears `match_reference` and also clears legacy `external_reference` values that start with `MATCH:`.
- CCXT movement merge in `lib/ccxt/sync.ts` is sign-aware (`DEPOSIT` ↔ positive leg, `WITHDRAWAL` ↔ negative leg), and only writes `external_reference` when the transfer leg does not already have one.
- Reverse-order merge in `POST /api/ledger` converts matching CCXT movement rows to `TRANSFER` and creates only missing legs so the final transfer group remains exactly two legs.
- `scripts/backfill-match-reference.ts` now uses the same legacy grouping fallback as runtime recalc logic and only auto-pairs groups with exactly two opposite-direction legs.

---

## Config knobs

- `CCXT_TRANSFER_MERGE_WINDOW_MINUTES` (default 360)
- (Optional) `CCXT_TRANSFER_MERGE_AMOUNT_REL_TOL` (default 0.001, planned/not wired yet)

---

## Rollout / safety

- Ship Phase 1–3 behind an env flag if desired: `ENABLE_TRANSFER_MATCH_REFERENCE=true`.
- Backfill script can be run after deploy; it should be idempotent.
- Rollback strategy: keep legacy fallback grouping in `buildTransferKey()` until confident.

---

## Done criteria (end-to-end)

A. Manual transfer → later CCXT sync: **no duplicate balance** on CEX account.

B. CCXT deposit exists → user creates transfer: CCXT row becomes a TRANSFER leg and is paired via `match_reference`; cost basis carries.

C. Reconcile SEPARATE action does not leave lingering match keys.
