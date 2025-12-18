# Implementation Plan: Portfolio App Gaps and Remediations

## Objectives
- Provide a concrete, scoped plan to close the gaps identified in the current implementation.
- Lock base currency to USD in both UI and backend to eliminate incorrect multi-currency formatting (Issue #2).
- Clarify deliverables, sequencing, and migration considerations.

## Current Constraints and Invariants
- Runtime: Next.js App Router with co-located API routes (`app/api/*`), Prisma + SQLite.
- Auth: Single-session cookie enforced via `middleware.ts` (public allow-list limited).
- Pricing: CoinGecko (crypto, USD) + Finnhub (equity, USD) with in-memory rate limiter.
- Snapshots: Recorded after price refresh; PNL chart depends on snapshots, not live ledger changes.
- Ledger: Signed quantity only; no execution price/value; no cost basis data captured.
- Settings: `baseCurrency`, `timezone`, `priceAutoRefresh`, `priceAutoRefreshIntervalMinutes`, `priceRefreshEndpoint`.

---

## Issue 1: Holdings Valuation (Cost Basis & PnL) Not Implemented
**Problem**
- Ledger stores only signed quantities; no execution price or base value.
- Holdings API/UI cannot compute average cost, total cost basis, unrealized PnL, or PnL%.

**Decision**
- Adopt **explicit trade valuation capture** on ledger writes (preferred minimal honest path).

**Plan**
1. **Schema Extension**
   - Add columns to `LedgerTransaction` (or a related table) to capture trade valuation:
     - `unit_price_in_base` (Decimal, nullable)
     - `total_value_in_base` (Decimal, nullable; mutually consistent with unit price * quantity)
     - Optional: `fee_in_base` (Decimal, nullable) or `fee_asset_id` + `fee_quantity`.
   - Migration adds indexes as needed; keep backward compatibility (nullable fields).
2. **API Contract Updates**
   - `/api/ledger` POST/PUT: accept and validate valuation fields; enforce consistency (total = unit * qty within tolerance).
   - CSV import mapping: add optional column mappings for unit price / total value / fee; default to null if absent.
3. **Cost Basis Computation**
   - Implement cost basis + running PnL in backend service:
     - Recompute on read (per account/asset) or maintain a `positions` table updated on ledger mutations.
     - Use average cost method per PRD.
   - Extend holdings result shape to include:
     - `averageCost`, `totalCostBasis`, `unrealizedPnl`, `unrealizedPnlPct`.
4. **UI Changes**
   - Holdings table: add the new columns, with clear "Unpriced/Unknown" labels when valuation inputs are missing.
   - Dashboard top holdings: reflect PnL-aware values or explicitly mark when unavailable.
5. **Data Backfill Strategy**
   - For existing rows without valuation: display "Unknown cost basis" and omit PnL to avoid misleading numbers.
6. **Testing**
   - Unit tests for cost basis math (buys, sells, partial sells, zero-cost, fees).
   - Integration tests: ledger POST/PUT with valuation fields → holdings/PnL correctness.

---

## Issue 2: Base Currency Setting Is Unsafe — Lock to USD (Requested)
**Problem**
- Pricing providers return USD; `baseCurrency` setting only changes formatting, causing incorrect displays if set to non-USD.
- Need to lock base currency to USD across UI + backend.

**Plan**
1. **Backend Hard Lock**
   - Force `baseCurrency` to `'USD'` in `lib/settings` default and getters; ignore/strip writes of other currencies in `/api/settings`.
   - Ensure `/api/holdings`, `/api/pnl`, `/api/prices/*`, snapshots always emit `baseCurrency: 'USD'`.
2. **UI Lock**
   - Settings page: remove/disable editing of base currency; display non-editable "USD (fixed)".
   - Any currency labels in UI (Dashboard, Holdings, PNL) should read from the enforced USD constant, not from user input.
3. **Documentation & Warnings**
   - Add explicit note to Settings page and README that USD is the fixed base currency.
4. **Migration Safety**
   - If any non-USD setting exists in DB, override to USD on read (one-way).

---

## Issue 3: Refresh Scheduling vs Interval Setting
**Problem**
- `priceAutoRefreshIntervalMinutes` affects only staleness; actual scheduler is hourly (GitHub Actions). UI implies interval-based scheduling.

**Plan**
1. **Clarify Behavior**
   - Update copy in Settings and Dashboard to say "Scheduled hourly" unless true interval enforcement is built.
2. **Optional Enforcement (if desired)**
   - Add `price_refresh_runs` (id, started_at, ended_at, status) or `settings.last_refresh_at`.
   - Gate `/api/prices/refresh` to skip if a run occurred within `priceAutoRefreshIntervalMinutes` (except manual runs).
   - Add simple mutex/lock (DB row or advisory flag) to avoid concurrent overlaps.
3. **Scheduler Alignment**
   - Either keep hourly GH Action and adjust UI messaging, or align cron to the configured interval (requires secrets update).

---

## Issue 4: Staleness and "Updated At" Semantics
**Problem**
- Manual-priced assets yield `summary.updatedAt = null`, causing "Awaiting price data"/"Stale" even when values exist.

**Plan**
1. **Dashboard Stale Logic**
   - Derive staleness from AUTO assets only:
     - Compute `latestAutoPriceUpdatedAt`; stale if `isPriceStale(latestAutoPriceUpdatedAt, refreshInterval)`.
   - If portfolio has only manual assets, show "Manual pricing (no auto refresh)" instead of stale/awaiting.
2. **Holdings Summary**
   - Track `summary.autoUpdatedAt` separately from `summary.updatedAt` or return a dedicated `autoPricesUpdatedAt` field.
3. **UI Copy**
   - Adjust badge/label text to clarify manual vs auto pricing freshness.

---

## Issue 5: Public Access Mismatch for Health Endpoint
**Problem**
- Docs say `/api/prices/health` is public; middleware allow-list does not include it, so it’s auth-gated.

**Plan**
1. **Allow-list Fix**
   - Add `/api/prices/health` (or `/api/health*` if desired) to `PUBLIC_PATHS` in `middleware.ts`.
2. **Docs Alignment**
   - Clarify in README/PRICE_REFRESH_IMPROVEMENTS that health is intentionally public (or explicitly require auth if preferred).
3. **Security Note**
   - If public, ensure payload contains no secrets; current payload is safe (stats + settings toggles only).

---

## Issue 6: Ledger API vs UI Semantics (Trades / Double-Entry)
**Problem**
- `/api/ledger` POST creates a single row; UI may create double-entry for trades, but contract doesn’t enforce it.

**Plan**
1. **Backend Contract**
   - Add `mode` or explicit payload for trade legs (asset_in/qty_in, asset_out/qty_out) to create two rows atomically.
   - Validate tx_type semantics server-side.
2. **UI Alignment**
   - Ensure LedgerForm/CSV import call the updated contract; remove client-only orchestration assumptions.
3. **Testing**
   - Integration tests for trade double-entry (both legs written, consistent signs).

---

## Issue 7: Holdings Filtering Gap (Volatility Buckets)
**Problem**
- `lib/holdings` supports `volatilityBuckets`, but `/api/holdings` does not parse/expose it.

**Plan**
1. **API Enhancement**
   - Parse `volatilityBuckets` from query string and pass to `getHoldings`.
2. **UI**
   - Ensure HoldingsFilters and any consumers include the parameter when present.

---

## Issue 8: Docs vs Reality (Vercel Cron vs GitHub Actions)
**Problem**
- README references Vercel cron; actual scheduling is via GitHub Actions.

**Plan**
1. **Docs Cleanup**
   - Update README to state GitHub Actions hourly workflow as the shipped scheduler.
   - Remove/adjust references to `vercel.json` cron unless reintroduced.

---

## Issue 9: Rate Limiting Scope
**Problem**
- In-memory limiter is process-local; ineffective in multi-instance/serverless setups.

**Plan (inform/optional)**
1. Document limitation and recommend single-runner or persisted rate limit (Redis) if multi-instance deployment is planned.

---

## Deliverables and Sequencing
1. **USD Lock (Backend + UI)**
   - Enforce USD in settings read/write; adjust UI to non-editable; update docs.
2. **Staleness Semantics Fix**
   - AUTO-only freshness; manual pricing messaging.
3. **Health Endpoint Allow-list Fix**
   - Middleware change + doc alignment.
4. **Holdings Filter Completion**
   - Wire volatilityBuckets through API.
5. **Docs Cleanup (Scheduler story)**
   - README/PRICE_REFRESH_IMPROVEMENTS alignment.
6. **Ledger Double-Entry Contract**
   - API + UI alignment; tests.
7. **Cost Basis Schema & Computation**
   - Schema migration; API validation; holdings extension; UI columns; tests; backfill handling.
8. **(Optional) Refresh Interval Enforcement & Concurrency Guard**
   - Persistent last-run; skip logic; lock.

---

## Testing Strategy
- **Unit Tests**: pricing staleness calc, cost basis math, settings normalization (USD lock).
- **Integration Tests**: ledger POST/PUT (single + trade), holdings API with volatilityBuckets, health endpoint public access.
- **E2E/UX Checks**: Dashboard stale badge behavior, Settings page copy, holdings PnL columns visibility and fallbacks.

---

## Migration Notes
- New nullable ledger valuation fields: safe to deploy; existing rows remain valid.
- On settings load, coerce any stored non-USD `baseCurrency` to USD; no backward toggle.
- Snapshot data remains USD; no conversion required.

---

## Definition of Done (per issue)
- **USD Lock**: No UI control to change base currency; APIs return USD only; any non-USD in DB is ignored/overridden.
- **Staleness Fix**: Manual-only portfolios never show "stale"; AUTO stale derived from latest auto price.
- **Health Public**: `/api/prices/health` reachable without auth if intended; middleware allow-list updated.
- **Holdings Filters**: Volatility filter works end-to-end.
- **Ledger Contract**: Trade tx_type creates two rows server-side; CSV import honors; tests passing.
- **Cost Basis**: Holdings API/UI emits cost basis + PnL with correct math when valuation data is present; unknown when absent.
- **Docs Alignment**: Scheduler story and public endpoints accurately described.

# Phased PRD: TieQuan Portfolio Enhancements

## 1. Overview
This document extends the original PRD with a phased implementation plan that makes each chunk of work verifiable through human-checkable criteria. The goal is to stabilize the dashboard (stale logic, holdings math), protect the base currency assumption (USD-only), and clearly document gaps in refresh scheduling, health monitoring, and ledger semantics.

## 2. Goals
- Lock the entire experience (UI + backend) to USD so reporting cannot drift when users change base currency.
- Surface correct holdings metrics (cost basis, unrealized PnL) once the ledger captures valuation inputs.
- Align scheduling, staleness indicators, and health monitoring assumptions with observable behavior.
- Provide clear, testable acceptance criteria per phase so reviewers can tick off completion.

## 3. Assumptions & Constraints
- Next.js App Router with `/app/(authenticated)` shell and co-located API routes.
- Prisma + SQLite persistence.
- Pricing providers (CoinGecko + Finnhub) always quote USD prices.
- Settings currently permit arbitrary base currencies but pricing assumes USD.
- Ledger rows contain only quantities; no trade valuation data exists today.
- Price refresh scheduling is hourly via GH Actions; UI indicates a configurable interval.

---

## 4. Phase Definitions

### Phase 0 – Baseline Lock & Visibility (UI + Backend)
**Objective:** Ensure every exposed currency value is USD and prevent users from selecting another base.

- **Backend**
  - Enforce `baseCurrency = 'USD'` in `lib/settings` defaults.
  - `getAppSettings()` coerces any stored value to USD before returning.
  - `POST /api/settings` silently ignores attempts to write a different currency.
  - All downstream responses (`/api/holdings`, `/api/pnl`, price endpoints, snapshots) hardcode USD in their responses.

- **UI**
  - Settings page renders "Base Currency: USD (fixed)" as read-only text.
  - Any currency labels (dashboard totals, holdings table, PnL page) derive from a shared USD constant rather than user input.
  - Add a callout explaining the fixed USD assumption so users understand why the control is disabled.

- **Validation**
  - Manually edit the settings table (if needed) to a non-USD value and confirm GET `/api/settings` still returns USD and UI still shows USD.
  - Settings save button should not break now that base currency isn’t editable.
  - Dashboard, holdings table, PnL page should still render and display USD symbols even if the stored row had "EUR".

### Phase 1 – Pricing Freshness & Health Transparency
**Objective:** Fix stale indicators, expose health publicly, and align docs.

- **Stale badge**
  - Compute auto-price freshness using the latest `priceLatest.last_updated` across AUTO assets.
  - If there are no AUTO assets, show "Manual pricing only" instead of "stale".
  - Dashboard wording should say "Scheduled hourly (configurable staleness only)" or similar to avoid implying interval enforcement.

- **Health endpoint**
  - Add `/api/prices/health` to `PUBLIC_PATHS` so it is reachable without auth.
  - Confirm `middleware.ts` now allows that path (current allow-list lacks it).
  - Update README/PRICE_REFRESH_IMPROVEMENTS to describe the GitHub Actions hourly cron (not Vercel), mention the health endpoint is public, and note the limited interval guarantees.

- **Validation**
  - Visit `/api/prices/health` without a session cookie and confirm it returns 200.
  - Use a manual portfolio with only MANUAL assets and ensure the dashboard no longer shows "Prices stale."

### Phase 2 – Holdings Filter & Ledger Semantics
**Objective:** Close the gap between backend filters and UI expectations, and enforce ledger trade contracts server-side.

- **Holdings filter**
  - Parse `volatilityBuckets` from `/api/holdings` query parameters and forward them to `getHoldings`.
  - Ensure UI filters (HoldingsFilters + PNL filters) append the parameter when the user selects a volatility bucket.

- **Ledger API**
  - Extend `/api/ledger` POST (and CSV import) to support trade legs or enforce double-entry semantics:
    - Accept `legs` array or explicit `asset_in/asset_out` payload so the backend can create both +/- rows atomically.
    - Document expectations in the PRD (e.g., TRADE creates two rows with opposite signs).
  - Keep single-leg creation for non-trade tx types but validate semantics on the backend.

- **Validation**
  - Submit a TRADE via API (or CSV) and confirm two ledger rows are created as expected.
  - Apply volatility filters in the UI and verify `/api/holdings` receives and respects the parameter.

### Phase 3 – Holdings Valuation & Cost Basis Wiring
**Objective:** Capture valuation inputs and expose cost basis + PnL metrics.

**Status: Fully implemented**
- **Schema**: `unit_price_in_base`, `total_value_in_base`, `fee_in_base` now exist on `LedgerTransaction` and are tracked via `20251218004753_add_ledger_valuation`.
- **API**: `/api/ledger` POST/PUT (single-leg and trade legs) plus the CSV import commit flow accept the valuation trio, validate consistency, persist them, and return them when requested.
- **Engine**: `lib/holdings` consumes the new columns to compute average cost, total cost basis, and unrealized PnL/percent; summaries now show “Unknown cost basis” whenever valuations are incomplete.
- **UI**: Ledger create/edit forms expose the valuation inputs (per leg for trades), the holdings table renders Avg Cost/Cost Basis/Unrealized PnL/PnL %, and the dashboard hero card surfaces the valuation summary with explicit missing-data messaging.

- **Schema & migrations**
  - Added nullable valuation columns via the `20251218004753_add_ledger_valuation` migration.
  - Migration history is kept consistent so new dev environments apply the schema in order.

- **API contracts**
  - `/api/ledger` POST/PUT: accept `unit_price_in_base`, `total_value_in_base`, `fee_in_base`, validate them against quantity, and persist or clear the fields per request.
  - `/api/ledger/import/commit`: allows those columns and defaults them to `null` when absent so older CSVs keep working.

- **Cost basis engine**
  - Holdings rows now include `averageCost`, `totalCostBasis`, `unrealizedPnl`, `unrealizedPnlPct` computed from valuation-aware ledger history.
  - Summary logic tags the overall valuation as “Unknown cost basis” when any required data is missing rather than displaying inaccurate PnL.

- **UI**
  - Ledger forms show dedicated valuation inputs for single entries and each leg of a trade, prefilling values during edits.
  - Holdings table now surfaces the new Avg Cost/Cost Basis/Unrealized PnL/PnL % columns with fallback placeholders when data is missing.
  - Dashboard hero card renders the total Unrealized PnL + Cost Basis block and clearly labels the “Unknown cost basis” state, even during privacy mode or missing valuations.

- **Validation**
  - Verified that ledger entries created/edited with valuations propagate through `/api/holdings`, the holdings page, and the dashboard (avg cost / cost basis / PnL columns display correctly).
  - Confirmed the UI shows “Unknown cost basis” when valuations are absent, matching the original requirement.

### Phase 4 – Scheduling Guarantees & Monitoring
**Objective:** (Optional) Align actual refresh scheduler with configured interval and harden concurrent runs.

- **Scheduling metadata**
  - Introduce `price_refresh_runs` or `settings.last_refresh_at` to persist last execution time.
  - `/api/prices/refresh` checks this metadata and `priceAutoRefreshIntervalMinutes` before executing scheduled runs.
  - Manual runs (via UI button) bypass the guard.

- **Concurrency guard**
  - Use a DB lock or mutex flag to prevent concurrent refreshes.
  - Rate limiter stays per-process but document multi-instance limitations in README.

- **Validation**
  - Attempt to trigger two overlapping refreshes; ensure the second run is skipped or waits.
  - Check that scheduled runs respect the configured interval (if you adopt the guard).

---

## 5. Documentation & Verification
Each phase should end with a human-checkable checklist:

- Base currency locked = settings UI readonly, API always returns USD.
- Health endpoint public + docs updated.
- Holdings filters + ledger trade contract testable via API calls.
- Valuation columns reachable through holdings API/UI with known input sets.
- Scheduler guard (if implemented) observable through logs/results.

Include acceptance tests for each phase in polyglot doc or a QA checklist.

---

## 6. Dependencies & Rollout Notes
- Phase 0 must ship before dashboards rely on the USD lock.
- Phase 3 depends on schema migration; plan for db migrations/backwards compatibility.
- Keep README/PRICE_REFRESH_IMPROVEMENTS aligned with live behavior (GitHub Actions schedule, public endpoints).
- Provide rollout notes for clearing non-USD settings (coerce to USD on read) and instruct users to re-enter valuation data where necessary.

---