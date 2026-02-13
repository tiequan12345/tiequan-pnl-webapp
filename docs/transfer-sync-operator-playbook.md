# Transfer Sync Operator Playbook

Quick QA checklist after deploying transfer-sync matching changes.

## Goal

Prefer automatic matching whenever possible. Use manual reconcile only as fallback.

## Preconditions

- DB migration adding `LedgerTransaction.match_reference` is applied.
- App is deployed with transfer merge logic in:
  - `app/api/ledger/route.ts`
  - `lib/ccxt/sync.ts`
  - `app/api/ledger/resolve-transfer/route.ts`
- If needed, run one-off backfill:
  - `pnpm tsx scripts/backfill-match-reference.ts`

---

## Scenario 1: Manual transfer first, then CCXT sync (auto-merge expected)

1. Create a manual `TRANSFER` between two accounts for the same asset/size.
2. Run CCXT sync for the account that receives/sends the movement.
3. Verify results:
   - No duplicate `DEPOSIT`/`WITHDRAWAL` row is created for that movement.
   - Existing transfer leg is reused/linked.
   - Transfer appears as exactly two `TRANSFER` legs.

### SQL spot-check

```sql
-- Expect 2 rows for one match_reference group
SELECT match_reference, COUNT(*)
FROM "LedgerTransaction"
WHERE tx_type = 'TRANSFER' AND match_reference IS NOT NULL
GROUP BY match_reference
ORDER BY COUNT(*) DESC;
```

---

## Scenario 2: CCXT movement first, then manual transfer (reverse-order merge expected)

1. Let CCXT ingest a movement (`DEPOSIT` or `WITHDRAWAL`).
2. Create the corresponding manual `TRANSFER`.
3. Verify results:
   - Matching CCXT movement row is converted to `TRANSFER`.
   - Only the missing opposite leg is created.
   - Final state is exactly two `TRANSFER` legs in one `match_reference` group.

### API confirmation

`POST /api/ledger` transfer response may include:

- `convertedCcxtRows > 0` when a CCXT row was reused.
- `legs` should still represent final transfer leg count for the action (normally 2).

---

## Scenario 3: Manual reconcile fallback (MATCH/SEPARATE)

Use this only when auto-merge cannot infer safely.

1. Open Reconcile/Settings transfer diagnostics.
2. For true pairs: click **Match Together**.
3. For non-pairs: click **Treat as Separate**.
4. Verify:
   - `MATCH` sets `match_reference` and keeps existing `external_reference`.
   - `SEPARATE` sets `tx_type` to `DEPOSIT`/`WITHDRAWAL` and clears `match_reference`.
   - Legacy `external_reference` values that begin with `MATCH:` are cleared on separate.

---

## Fast troubleshooting

- **Still seeing duplicates:**
  - Check time window env: `CCXT_TRANSFER_MERGE_WINDOW_MINUTES`.
  - Confirm quantity sign alignment (+ for deposit leg, - for withdrawal leg).
- **Unexpected unpaired transfers:**
  - Run transfer diagnostics endpoint and reconcile manually.
  - Run backfill script for historical records.
- **CCXT ref not attached to transfer:**
  - If transfer already has non-empty `external_reference`, merge can still skip duplicate creation while preserving existing reference.

---

## Rollback-safe behavior

- `buildTransferKey()` still has legacy fallback path for transfers without `match_reference`.
- Manual reconcile remains available to correct edge cases without data loss.
