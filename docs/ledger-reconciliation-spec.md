# Ledger Reconciliation Guide

This guide explains how to use the ledger reconciliation feature to true-up holdings to actual balances while keeping cost-basis math internally consistent. It is written for someone downloading and using the repo for the first time.

## What reconciliation does

- Creates **RECONCILIATION** ledger transactions.
- Adjusts quantity and updates cost basis according to asset class:
  - **Cash-like assets**: quantity and basis move together (near 1:1).
  - **Non-cash assets**: average cost per unit is preserved by scaling basis with the quantity change.
- If an adjustment brings quantity to zero, cost basis is zeroed.
- If non-cash quantity changes from a zero baseline, cost basis is marked unknown (reconciliation rows have no valuation fields).
- Provides an idempotent workflow by using an external reference.

This is designed for situations like LP impermanent loss, wallet drift, or manual balance corrections where you want holdings to match reality without rewriting historical trade records.

## When to use reconciliation

Use reconciliation when:
- Your ledger balance drifts from on-chain or broker balances.
- You need to true-up quantities after a large import.
- You need to close out or resize a position while preserving coherent basis math.

Do **not** use reconciliation for normal transfers or trades—use standard ledger entries for those.

## UI workflow (recommended)

Go to **Settings → Reconciliation** and follow these steps:

1. **Prepare target balances** for each account/asset you want to reconcile.
2. **Preview** the reconciliation to review deltas.
3. **Commit** the reconciliation to create RECONCILIATION entries.
4. Re-run the preview or holdings view to verify results.

The UI uses an external reference under the hood so the same reconciliation can be re-run safely.

## API usage

All endpoints are authenticated.

### POST /api/ledger/reconcile

Payload:
```json
{
  "as_of": "2025-12-31T23:59:59Z",
  "targets": [
    {
      "account_id": 1,
      "asset_id": 2,
      "target_quantity": "0.75",
      "notes": "Wallet true-up"
    }
  ],
  "epsilon": 0.000000001,
  "external_reference": "RECONCILE:2025-12-31",
  "notes": "Month-end reconciliation",
  "mode": "PREVIEW",
  "replace_existing": true
}
```

- **mode**: `PREVIEW` (default) or `COMMIT`.
- **epsilon**: Ignore tiny deltas below this threshold.
- **replace_existing**: If `true`, removes prior reconciliation entries with the same `external_reference` and `as_of` before committing.

Preview response example:
```json
{
  "as_of": "2025-12-31T23:59:59.000Z",
  "external_reference": "RECONCILE:2025-12-31",
  "epsilon": 1e-9,
  "replace_existing": true,
  "rows": [
    {
      "account_id": 1,
      "asset_id": 2,
      "current_quantity": "1.0",
      "target_quantity": "0.75",
      "delta_quantity": "-0.25",
      "will_create": true
    }
  ],
  "mode": "PREVIEW"
}
```

Commit response includes `created` count:
```json
{
  "mode": "COMMIT",
  "created": 1
}
```

## Best practices

- Back up your DB before large reconciliations.
- Use a consistent `external_reference` so you can re-run the same batch safely.
- Prefer a single `as_of` timestamp for a reconciliation run.
- If you also need to fix cost basis, run cost basis recalculation after reconciliation.

## Troubleshooting

- **No rows created**: Your deltas are below `epsilon` or targets match current quantities.
- **Unexpected deltas**: Verify you’re using the correct account and asset IDs.
- **Cost basis looks wrong**: Reconciliation now rebalances basis with quantity. If basis is still off, run cost basis recalculation and inspect transfer/reconciliation history.
