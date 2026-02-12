# Release Note: CCXT Queue Hardening + Bybit/Binance Sync Reliability

Date: 2026-02-11  
Commit: `23af8d7`

## Summary
This release hardens CCXT sync operations for Binance/Bybit by routing sync execution through the queue, adding retries with backoff, improving progress visibility, and reducing long-running job risk with incremental sync windows.

## What changed

### 1) Queue-first execution
- `POST /api/ccxt/{exchange}/sync` now **enqueues** jobs (no inline sync execution).
- `POST /api/prices/refresh` now enqueues CCXT trade sync jobs instead of calling sync directly.

### 2) Retry/backoff + scheduling
- Added transient failure retries for network/timeout/rate-limit style errors.
- New `next_run_at` scheduling with exponential backoff.
- Added heartbeat/progress updates while jobs are running.

### 3) Observability improvements
- `GET /api/ccxt/sync-jobs/{id}` now returns:
  - `progress`
  - `heartbeat_at`
  - `next_run_at`
- Worker endpoint responses can include `retryScheduledFor`.

### 4) Runtime/timeout improvements
- API routes set `maxDuration = 1800`.
- Worker script default `CURL_MAX_TIME` increased to `1800` seconds.

### 5) Sync correctness/performance
- Incremental fallback sync window now uses:
  - `since` override when provided, else
  - `max(sync_since, last_trade_sync_at - overlap)`
- Bybit/all-scope symbol scanning no longer force-filters by default quote in `marketScope: all`.
- Movements now support pagination.

### 6) Dedupe/idempotency hardening
- Queue dedupe key now includes `(account_id, exchange_id, mode, since)` for `QUEUED/RUNNING` jobs.
- `force: true` can bypass dedupe when needed.
- Added unique DB constraint: `LedgerTransaction(account_id, external_reference)`.
- Trade/movement external references were strengthened.

### 7) UX alignment
- Manual sync UI default mode set to `trades`.
- Added UI hint that `balances` mode does not import trades.

## Operator rollout checklist (production)

1. **Deploy code**
   - Deploy commit `23af8d7`.

2. **Apply DB migration**
   - `pnpm prisma migrate deploy`

3. **Set/update environment variables**
   - Required/important:
     - `CCXT_CRON_SYNC_TOKEN`
     - `CCXT_SYNC_AUTH_HEADER`
     - `CCXT_SYNC_ENDPOINT_URL`
     - `CCXT_SYNC_WORKER_ENDPOINT_URL`
   - Queue/retry tuning:
     - `CCXT_SYNC_JOB_MAX_PER_RUN=1`
     - `CCXT_SYNC_JOB_RUNNING_TIMEOUT_MINUTES=30`
     - `CCXT_SYNC_JOB_MAX_RETRY_ATTEMPTS=3`
     - `CCXT_SYNC_JOB_RETRY_BASE_SECONDS=30`
     - `CCXT_SYNC_JOB_RETRY_MAX_SECONDS=900`
     - `CCXT_SYNC_JOB_HEARTBEAT_SECONDS=10`
   - Sync window/pagination tuning:
     - `CCXT_SYNC_TRADE_OVERLAP_MINUTES=15`
     - `CCXT_SYNC_TRADE_PAGE_LIMIT=200`
     - `CCXT_SYNC_TRADE_MAX_PAGES_PER_SYMBOL=5`
     - `CCXT_SYNC_MOVEMENT_PAGE_LIMIT=1000`
     - `CCXT_SYNC_MOVEMENT_MAX_PAGES=5`

4. **Cron/worker timeout confirmation**
   - Worker uses default `CURL_MAX_TIME=1800`.
   - If needed for large accounts, increase to `3600`.

5. **Smoke test**
   - Enqueue one manual trades sync from UI.
   - Confirm response includes `jobId` and status `QUEUED/RUNNING`.
   - Poll `GET /api/ccxt/sync-jobs/{id}` and verify `progress` + `heartbeat_at` updates.
   - Confirm final `SUCCESS` and expected ledger inserts.

## Monitoring recommendations
- Alert if queue depth grows continuously.
- Alert if jobs are `RUNNING` beyond timeout window.
- Track repeated retries for the same account/exchange.

## Rollback guidance
- Safe rollback path:
  1. Deploy previous app version.
  2. Keep DB migration (additive fields + index) in place.
  3. Reduce worker concurrency/disable worker temporarily if needed.
- If unique index introduces ingestion conflicts, inspect `external_reference` generation and duplicate rows before re-running jobs.
