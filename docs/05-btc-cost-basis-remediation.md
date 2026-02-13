# Cost Basis Remediation Guide

This guide explains how to repair or re-anchor cost basis using the built-in recalculation tooling. It is intended for someone running the app for the first time and needing to correct cost basis after imports, transfers, or historical data fixes.

## What this does

- Replays the ledger and writes **COST_BASIS_RESET** entries.
- Preserves quantities while re-anchoring cost basis to a specific point in time.
- Helps resolve "unknown cost basis" positions created by missing valuations or transfer mismatches.

The base currency is fixed to **USD**, so all valuations are in USD.

## When to run it

Run a cost basis recalculation when you:
- Import historical data or large CSVs.
- Fix or backfill missing valuation fields (`unit_price_in_base` / `total_value_in_base`).
- Resolve transfer pairing issues.
- Notice holdings with **unknown cost basis** even though trades/transfers should have known values.

## Before you start

1. **Back up your database** (`/api/export/db` or the backup scripts).
2. Ensure all required valuation fields are present for trade-like entries (DEPOSIT, YIELD, TRADE, NFT_TRADE, OFFLINE_TRADE, HEDGE). Zero cost basis must be explicit (`0`).
3. Verify your timezone setting if you’re using the `as_of` field.

## Recommended workflow (UI)

Go to **Settings → Cost Basis Recalculation** and follow these steps:

1. **Select Mode**
   - **PURE**: ignores existing resets and recomputes from the ledger.
   - **HONOR_RESETS**: uses existing resets as anchors while replaying.

2. **(Optional) As Of**
   - Set a cutoff datetime if you want resets anchored up to a point in time.
   - Leaving it empty recalculates through the full ledger.

3. **(Optional) External Reference / Notes**
   - Helps you tag resets for audit or future filtering.

4. **Run Recalculation**
   - The UI returns counts and any transfer pairing diagnostics.

## Resolving transfer diagnostics

If the recalculation reports transfer pairing issues, use the **Unmatched Diagnostics** panel in Settings:

- **Match Together**: Forces two legs to pair (syncs timestamps and assigns a `MATCH:<uuid>` `match_reference` pairing key while preserving any existing `external_reference`).
- **Treat as Separate**: Converts to independent DEPOSIT/WITHDRAWAL entries to clear warnings.

After resolving, run the recalculation again to verify diagnostics are cleared.

## API equivalents

All endpoints are authenticated.

- **POST /api/ledger/cost-basis-recalc**
  ```json
  {
    "mode": "PURE",
    "as_of": "2025-12-31T23:59:59Z",
    "external_reference": "RECALC:2025-12-31",
    "notes": "End-of-year reset"
  }
  ```

- **POST /api/ledger/resolve-transfer**
  ```json
  {
    "legIds": [123, 124],
    "action": "MATCH"
  }
  ```

- **GET /api/ledger/transfer-issues**
  Lists transfer diagnostics to resolve before recalculation.

## Tips and best practices

- Run recalculation after large imports or schema fixes.
- Add external references so resets are easy to identify.
- Keep backups for audit purposes.
- If cost basis remains unknown, check for missing valuation fields or unresolved transfer legs.

## Troubleshooting

- **Recalc returns zero created**: Ensure holdings exist at or before the `as_of` date.
- **Diagnostics won’t clear**: Resolve transfers, then rerun the recalculation.
- **Unknown basis persists**: Ensure valuation fields are present and non-null; use `0` for explicit zero-cost basis.
