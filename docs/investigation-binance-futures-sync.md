# Investigation: Binance Futures Sync Produces No New Hedges/Trades

## Summary
Root cause confirmed: futures trade ingestion was effectively capped to the first page (`limit=200`) per symbol with no pagination, so high-activity symbols stopped producing new rows after the first page had already been deduped. A secondary UX issue also contributed: manual sync defaulted to `balances`, which never imports trades/HEDGE rows.

## Symptoms
- Binance sync runs but often yields no new futures/HEDGE ledger rows.
- Users observe long sync times and still see no new hedges.
- Investigation constrained to 7-day lookback.

## Investigation Log

### 2026-02-10 17:53 ET — Phase 1 / Context Build
**Hypothesis:** Breakpoint exists in fetch/filter/dedup/persistence path.
**Findings:** Context builder flagged likely failure points: sync mode default, futures profile gating, silent fetch errors, dedupe keying.
**Evidence:**
- `app/(authenticated)/accounts/[id]/exchange/ExchangeConnectionClient.tsx`
- `lib/ccxt/sync.ts`
- `app/api/prices/refresh/route.ts`
- `lib/ccxt/client.ts`
- `CCXT_INTEGRATION_SPEC.md`
**Conclusion:** Proceed to runtime validation with 7-day window.

### 2026-02-11 11:45 ET — Runtime configuration and data-path validation
**Hypothesis:** Futures profile may be disabled or not mapped to HEDGE.
**Findings:** Runtime env includes futures profile and code maps futures to HEDGE.
**Evidence:**
- Env: `CCXT_BINANCE_TRADE_TYPES=spot,future`
- HEDGE mapping: `lib/ccxt/sync.ts:892-894` (`future|futures` → `txType: 'HEDGE'`)
**Conclusion:** Profile gating is not the primary blocker.

### 2026-02-11 11:49 ET — Unified vs raw derivatives fetch comparison (7 days)
**Hypothesis:** Futures trades are fetched incompletely by unified path.
**Findings:** Large discrepancy between unified and raw derivatives responses.
**Evidence (command output):**
- `node scripts/debug/binance-sync-throwaway.js --account 44 --sinceDays 7 --quote USDT --maxTargets 400 --profiles future`
- Unified symbol probe: `totalTradesReturned=404`
- Raw derivatives probe: `totalTradesReturned=2638`
**Conclusion:** Unified fetch strategy is missing a substantial portion of futures trades.

### 2026-02-11 12:00 ET — Single-symbol proof of paging gap
**Hypothesis:** Fixed `limit=200` returns only earliest slice and misses later fills.
**Findings:** Confirmed on `LIT/USDT:USDT`.
**Evidence (command output):**
- Unified (`fetchMyTrades`, limit 200):
  - count=200
  - min=`2026-02-07T05:55:51.643Z`
  - max=`2026-02-07T11:00:31.234Z`
- Raw (`fapiPrivateGetUserTrades`, limit 1000):
  - count=854
  - min=`2026-02-07T05:55:51.643Z`
  - max=`2026-02-10T18:51:33.584Z`
- Pre-fix code path used single call per symbol (`fetchMyTrades(symbol, sinceTs, 200)`) in `lib/ccxt/sync.ts` (previous implementation of `fetchTradesForSync`).
**Conclusion:** Primary root cause confirmed.

### 2026-02-11 12:44 ET — Manual mode behavior validation
**Hypothesis:** Users trigger sync in `balances` mode and expect futures rows.
**Findings:** `balances` mode returns `created: 0` by design.
**Evidence:**
- API call returned: `{"created":0,"updated":0,"reconciled":54,...}`
- UI default before fix was `balances`: `app/(authenticated)/accounts/[id]/exchange/ExchangeConnectionClient.tsx` (pre-fix state)
- Trades import only executes when mode is `trades|full`: `lib/ccxt/sync.ts:855`
**Conclusion:** Secondary contributor to “sync ran, no hedges.”

### 2026-02-11 12:50 ET — Fixes implemented
**Hypothesis:** Pagination + safer UI default resolves the issue class.
**Findings:** Implemented bounded pagination and changed manual default mode.
**Evidence:**
- Paginated per-symbol trade fetch in `lib/ccxt/sync.ts:502-605`
  - New env controls:
    - `CCXT_SYNC_TRADE_PAGE_LIMIT`
    - `CCXT_SYNC_TRADE_MAX_PAGES_PER_SYMBOL`
- Manual sync default changed to `trades` in `app/(authenticated)/accounts/[id]/exchange/ExchangeConnectionClient.tsx:38`
- `.env.example` updated with new controls.
- Build green: `npm run build` completed successfully.
**Conclusion:** Root cause addressed and UX trap reduced.

## Root Cause
1. **Primary:** Futures ingestion fetched only a single page (`limit=200`) per symbol with no pagination. In high-frequency futures symbols, this captured only earliest trades in the 7-day window. Once those were already imported, dedupe filtered them out, producing repeated zero-new-row runs despite newer fills existing.
2. **Secondary:** Manual sync UI defaulted to `balances`, which does not run the trades pipeline at all, so users frequently observed successful syncs with zero futures/HEDGE rows.

## Eliminated Hypotheses
- **Futures profile disabled**: Eliminated (runtime env includes `future`, and mapping to `HEDGE` exists).
- **Persistence path broken for HEDGE**: Eliminated (HEDGE rows were successfully inserted when futures trades were fetched).
- **Schema/type disallowing HEDGE**: Eliminated (`HEDGE` is valid and consumed by hedges page).

## Recommendations
1. Keep pagination controls and tune for environment:
   - Start with `CCXT_SYNC_TRADE_PAGE_LIMIT=200`, `CCXT_SYNC_TRADE_MAX_PAGES_PER_SYMBOL=5`.
2. Keep manual default sync mode at `trades` for exchange pages.
3. Add sync diagnostics per profile/symbol:
   - symbols scanned, pages fetched, trades fetched, rows deduped, rows inserted.
4. Add regression test for >200 trades/symbol in lookback window.

## Preventive Measures
- Add instrumentation to detect truncation risk (`result.length === pageLimit` repeatedly).
- Alert when runs are `created=0` but fetched trades > 0 and dedupe hit-rate is high.
- Document operator guidance: use `trades/full` for hedge generation; `balances` is reconciliation-only.
