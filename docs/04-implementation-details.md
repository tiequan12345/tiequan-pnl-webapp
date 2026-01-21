# Implementation Details & Technical Specifications

## Table of Contents
1. [Current Implementation Status](#current-implementation-status)
2. [Issue Resolution](#issue-resolution)
3. [Technical Architecture](#technical-architecture)
4. [Database Schema](#database-schema)
5. [API Implementation](#api-implementation)
6. [Frontend Implementation](#frontend-implementation)
7. [Migration Notes](#migration-notes)
8. [Testing Strategy](#testing-strategy)

## Current Implementation Status

All core phases (0-6) are complete with the following key features implemented:

### ✅ Phase 0 – Project Setup & Skeleton
- Next.js App Router with authenticated layout under `app/(authenticated)/`
- Prisma + SQLite configured with `DATABASE_URL="file:./dev.db"`
- Single-user auth via `APP_PASSWORD` environment variable
- Authenticated routes `/`, `/assets`, `/accounts`, `/ledger`, `/holdings`, `/settings`

### ✅ Phase 1 – Assets & Accounts CRUD
- Full CRUD for assets and accounts with validation
- Schema models for `Asset`, `Account`, and `Setting` in `prisma/schema.prisma`
- Forms (`AssetForm`, `AccountForm`) with POST/PUT to API endpoints
- Validation of required fields and enum-like string constraints

### ✅ Phase 2 – Ledger: Manual Transactions & List View
- Manual transaction entry with double-entry for trades and transfers
- Ledger list with pagination and filtering
- Support for all transaction types (DEPOSIT, WITHDRAWAL, TRADE, TRANSFER, etc.)
- Hedges page for net exposure calculation
- **Transfer Support**: Move assets between accounts while preserving cost basis and valuation
- **CSV Export**: Filtered export of ledger transactions
- **Live Totals**: Dynamic column footers showing transaction counts and quantity sums
- **Bulk Selection**: Shift-click and drag-to-select support for efficient multi-row management

### ✅ Phase 3 – Holdings Calculation & Valuation
- Cost basis computation with average cost method
- Holdings API with PnL calculations
- Price refresh functionality with manual and auto pricing
- Valuation fields: `unit_price_in_base`, `total_value_in_base`, `fee_in_base`
- Valuation guardrails: DEPOSIT, YIELD, and trade-like entries require unit price or total value (zero cost basis must be explicit)

### ✅ Phase 4 – Dashboard
- Live portfolio totals and allocations
- Top holdings and recent activity
- Stale price indicators
- Charts within existing design shell

### ✅ Phase 5 – CSV Import
- Full import workflow with mapping, validation, and inline entity creation
- `/ledger/import` page with upload and preview
- `/api/ledger/import/commit` for bulk transaction creation

### ✅ Phase 6 – Settings, Exports, and Backup
- Settings persistence for currency/timezone/pricing preferences
- CSV and DB export functionality via `/api/export/*` endpoints
- Manual price refresh trigger
- Cost basis recalculation trigger in Settings (calls `/api/ledger/cost-basis-recalc`)

### ✅ Additional Features
- **USD Currency Lock**: Base currency fixed to USD across UI and backend
- **Price Refresh System**: Automated hourly refresh via GitHub Actions with rate limiting
- **Snapshot Persistence**: Portfolio snapshots for historical PnL tracking
- **Backup System**: Automated SQLite backups to S3 with configurable schedule
- **Transfer Transaction Type**: Move assets between accounts with cost basis preservation

### ✅ Phase 7 – Ledger Reconciliation
- **RECONCILIATION Transaction Type**: Adjust quantities without affecting cost basis
- **Batch Reconciliation API**: Preview and commit true-ups across accounts/assets
- **Settings UI**: `ReconciliationCard` for batch true-up workflows
- **Auto-Zero Logic**: `LedgerForm` support for zeroing out entire accounts with one click
- **Deterministic Playback**: Transaction engine sorting by `date_time` then `id`

## Issue Resolution

### Issue 1: Holdings Valuation (Cost Basis & PnL) ✅
**Problem**: Ledger stored only quantities; no execution price or base value.

**Solution**: Adopted explicit trade valuation capture with schema extension:
- Added `unit_price_in_base`, `total_value_in_base`, `fee_in_base` to `LedgerTransaction`
- API validation ensures consistency (total = unit * qty within tolerance)
- Holdings computation uses average cost method
- UI displays cost basis and PnL with "Unknown cost basis" fallback

### Issue 2: Base Currency Setting Is Unsafe ✅
**Problem**: `baseCurrency` setting only changed formatting, causing incorrect displays.

**Solution**: Locked base currency to USD:
- Backend hard lock in `lib/settings` defaults and getters
- UI shows non-editable "USD (fixed)" in settings
- All API responses hardcode USD in currency fields

### Issue 3: Refresh Scheduling vs Interval Setting ✅
**Problem**: `priceAutoRefreshIntervalMinutes` affected staleness only; actual scheduler was hourly.

**Solution**: Implemented interval enforcement with `PriceRefreshRun` model:
- Tracks execution time, status, and metadata
- Enforces interval for scheduled runs via GitHub Actions
- Manual refreshes bypass interval check
- Concurrency guard prevents overlapping refreshes

### Issue 4: Staleness and "Updated At" Semantics ✅
**Problem**: Manual-priced assets showed `updatedAt = null`, causing "stale" warnings.

**Solution**: Improved staleness logic:
- Compute auto-price freshness from AUTO assets only
- Show "Manual pricing (no auto refresh)" for manual-only portfolios
- Separate tracking of `autoUpdatedAt` vs `updatedAt`

### Issue 5: Public Access Mismatch for Health Endpoint ✅
**Problem**: `/api/prices/health` was auth-gated despite docs claiming it was public.

**Solution**: Added to `PUBLIC_PATHS` in `middleware.ts`:
- Health endpoint now accessible without authentication
- Updated documentation to reflect public status
- Ensured payload contains no sensitive information

### Issue 6: Ledger API vs UI Semantics ✅
**Problem**: `/api/ledger` POST created single row; UI expected double-entry for trades.

**Solution**: Enhanced API contract:
- Trade transactions create two rows atomically server-side
- Validation of tx_type semantics
- UI aligned with updated contract

### Issue 7: Holdings Filtering Gap ✅
**Problem**: `lib/holdings` supported `volatilityBuckets`, but API didn't expose it.

**Solution**: API enhancement:
- Parse `volatilityBuckets` from query string in `/api/holdings`
- Pass through to `getHoldings` function
- UI filters now properly utilize the parameter

### Issue 8: Docs vs Reality (Vercel Cron vs GitHub Actions) ✅
**Problem**: README referenced Vercel cron; actual scheduling was via GitHub Actions.

**Solution**: Documentation alignment:
- Updated README to state GitHub Actions hourly workflow
- Removed references to `vercel.json` cron configuration
- Clarified scheduler story in all documentation

### Issue 9: Rate Limiting Scope ✅
**Problem**: In-memory limiter was process-local; ineffective in multi-instance setups.

**Solution**: Documented limitation and recommendations:
- Added note about single-runner requirement
- Recommended Redis for multi-instance deployments
- Current implementation suitable for single-instance deployment

### Issue 10: Transfer Transaction Support ✅
**Problem**: No way to move assets between accounts while preserving cost basis and valuation.

**Solution**: Implemented comprehensive transfer functionality:
- Added `TRANSFER` to `ALLOWED_TX_TYPES` for system-wide recognition
- Extended API to support per-leg `account_id` for multi-account transactions
- Added transfer validation: exactly 2 legs, same asset, opposite quantities, different accounts
- Created transfer-specific UI with source/destination account selection
- Ensured valuation consistency between transfer legs to preserve cost basis
- Holdings calculations automatically handle transfer legs per account

### Issue 11: Unmatched Transfer Resolution ✅
**Problem**: Cost basis recalculation could fail to pair transfer legs if dates/quantities mismatches occurred (e.g. from disparate csv imports or timezones), resulting in "UNMATCHED" warnings.

**Solution**: Implemented interactive resolution workflow:
- **Enriched Diagnostics**: API now returns full leg details (account, asset, date, qty) for unmatched items.
- **Interactive UI**: New `UnmatchedDiagnosticsViewer` in Settings allows users to "Match Together" or "Treat as Separate" directly.
- **Match Logic**: 
  - Syncs timestamps of selected legs.
  - Applies a unique `MATCH:<uuid>` external reference.
  - Cost basis engine respects `MATCH:` prefix to force-group legs even if quantities differ (handling fee discrepancies).
- **Separate Logic**: Converts legs to independent `DEPOSIT` / `WITHDRAWAL` entries.

### Issue 11B: Missing Valuation Guardrails ✅
**Problem**: Users could create DEPOSIT/YIELD/trade entries with null valuation fields, which silently poisoned cost basis and propagated "Unknown" status.

**Solution**:
- API validation requires `unit_price_in_base` or `total_value_in_base` for DEPOSIT, YIELD, and trade-like entries.
- `LedgerForm` enforces valuation input and adds a "Zero cost basis" toggle for DEPOSIT/YIELD.
- Repair script `scripts/repair-null-yield-valuation.js` backfills missing totals when needed.

### Feature 12: Enhanced Ledger Selection (Drag-to-Select) ✅
**Problem**: Selecting multiple contiguous rows in the ledger required repeated clicking or precise Shift-clicking, which could be cumbersome for large ranges.

**Solution**: implemented intuitive mouse-drag selection:
- **Drag Interaction**: Users can click and drag across rows to select a range.
- **State Management**: Uses `onMouseDown` and `onMouseEnter` events to track standard drag gestures.
- **Visual Feedback**: Dragged rows invoke a `cursor-grabbing` state and immediate visual highlighting.
- **Compatibility**: Retains existing checkbox and Shift-click behavior alongside the new drag gesture.

### Feature 13: Ledger Reconciliation (Impermanent Loss & True-Ups) ✅
**Problem**: Impermanent loss from LP positions or other external factors causes ledger quantities to drift from actual wallet balances. Previous transfer/trade logic required equal-and-opposite value, which IL violates.

**Solution**: Implemented `RECONCILIATION` transaction type:
- **Quantity-Only**: Adjusts holdings counts without affecting cost basis. If quantity becomes zero, cost basis is also zeroed.
- **Idempotent API**: `/api/ledger/reconcile` supports preview/commit workflows with `external_reference` tracking.
- **UI Tooling**: 
  - Dedicated **Reconciliation Card** in Settings for batch multi-account true-ups.
  - **Single-Click Zero-Out** in `LedgerForm`: Selecting Reconciliation type hides fields and zeros out the entire account balance upon submission.
- **Use Case**: Allows precise quantity correction (e.g. +1.2 BTC, -2000 USDC) to match external reality without distorting historical cost.

## Technical Architecture

### Authentication & Middleware
- Single-user auth via `APP_PASSWORD` environment variable
- Session management via HTTP-only `app_session` cookie
- `middleware.ts` enforces authentication for non-public routes
- Public allow-list includes login, API login, health endpoints, and static assets

### Database Layer
- Prisma ORM with SQLite database
- Schema migrations tracked in `prisma/migrations/`
- Connection via `DATABASE_URL` environment variable
- Indexes optimized for common query patterns

### API Architecture
- Co-located routes in `app/api/` following Next.js App Router
- RESTful design with JSON responses
- Comprehensive error handling with appropriate HTTP status codes
- Input validation and sanitization
- Multi-leg transaction support for trades and transfers

### Frontend Architecture
- Server components for data fetching with direct Prisma access
- Client components for interactivity and forms
- Shared `AppShell` layout for authenticated experience
- Tailwind CSS for styling consistency
- Transfer-specific UI components for account-to-account movements

### External Integrations
- CoinGecko API for crypto pricing with rate limiting
- Finnhub API for equity pricing
- AWS S3 for database backups
- GitHub Actions for scheduled price refresh

## Database Schema

### Key Tables

#### assets
- Core asset definitions with pricing modes
- Supports crypto, equity, NFT, offline, and cash types
- Volatility bucket classification for risk analysis

#### accounts
- Account definitions with platform and type classification
- Status tracking for active/inactive accounts
- Support for various custody types (CEX, wallet, broker, etc.)

#### ledger_transactions
- Transaction records with signed quantities
- Valuation fields for cost basis calculation
- Support for all transaction types including trades and transfers
- Double-entry pattern for trade-like and transfer transactions

#### prices_latest
- Current price cache for all assets
- Source tracking for price provenance
- Timestamp for freshness tracking

#### settings
- Key-value configuration storage
- Supports user preferences and system settings
- JSON values for complex configuration

#### PortfolioSnapshot & PortfolioSnapshotComponent
- Historical portfolio value snapshots
- Component breakdowns by type, volatility, and account
- Enables PnL time-series analysis

#### PriceRefreshRun
- Execution tracking for price refresh operations
- Status monitoring (RUNNING, SUCCESS, PARTIAL, FAILED)
- Metadata storage for performance metrics

## API Implementation

### Core Endpoints

#### Asset Management
- `GET /api/assets` - List with optional search and pagination
- `POST /api/assets` - Create with validation
- `PUT /api/assets/:id` - Update with existence checks

#### Account Management
- `GET /api/accounts` - List all accounts
- `POST /api/accounts` - Create with validation
- `PUT /api/accounts/:id` - Update with existence checks

#### Ledger Operations
- `GET /api/ledger` - List with pagination and filtering
- `POST /api/ledger` - Create transactions (single, double-entry trades, or transfers)
- `PUT /api/ledger/:id` - Update existing transactions
- `DELETE /api/ledger/:id` - Remove transactions
- `POST /api/ledger/cost-basis-recalc` - Recompute cost basis by replaying ledger transactions and persist results as COST_BASIS_RESET rows.
  - Valuation required for DEPOSIT, YIELD, and trade-like entries (unit price or total value; zero must be explicit).
  - Request body: `{ "as_of": "ISO-8601", "mode": "PURE|HONOR_RESETS", "external_reference": "string", "notes": "string" }`
  - Modes:
    - `PURE` ignores existing COST_BASIS_RESET records.
    - `HONOR_RESETS` applies existing resets during replay.
  - Response includes `created`, `skippedUnknown`, `skippedZeroQuantity`, and `diagnostics` for transfer pairing issues.
  - Diagnostics are also logged server-side with a `[cost-basis-recalc]` prefix for quick visibility.
- **Transfer Support**: Multi-leg POST with per-leg `account_id` for account-to-account movements
- `POST /api/ledger/resolve-transfer` - Resolve unmatched diagnostics.
  - Request: `{ "legIds": [id1, id2], "action": "MATCH|SEPARATE" }`
  - `MATCH`: Syncs timestamps and sets `external_reference="MATCH:<uuid>"`.
  - `SEPARATE`: Changes type to DEPOSIT/WITHDRAWAL.

#### Import/Export
- `POST /api/ledger/import/parse` - CSV parsing and validation
- `POST /api/ledger/import/commit` - Bulk transaction creation
- `GET /api/export/assets` - Asset data export
- `GET /api/export/accounts` - Account data export
- `GET /api/export/ledger` - Transaction data export
- `GET /api/ledger/export` - Filtered CSV export
- `GET /api/export/db` - Database file export

#### Pricing & Monitoring
- `POST /api/prices/refresh` - Batch price update
- `POST /api/prices/refresh/[assetId]` - Single asset update
- `GET /api/prices/health` - System health check
- `GET /api/prices/rate-limit` - Rate limit status

#### Settings & Configuration
- `GET /api/settings` - Retrieve all settings
- `POST /api/settings` - Update configuration
- `GET /api/pnl` - Historical PnL data

### Transfer API Contract

#### POST /api/ledger (Transfer)
**Request Format:**
```json
{
  "date_time": "2025-12-23T21:00:00Z",
  "account_id": 1,
  "tx_type": "TRANSFER",
  "external_reference": "transfer-001",
  "notes": "Moving BTC between accounts",
  "legs": [
    {
      "account_id": 1,
      "asset_id": 1,
      "quantity": "-0.5",
      "unit_price_in_base": "50000",
      "total_value_in_base": "-25000",
      "fee_in_base": "0"
    },
    {
      "account_id": 2,
      "asset_id": 1,
      "quantity": "0.5",
      "unit_price_in_base": "50000",
      "total_value_in_base": "25000",
      "fee_in_base": "0"
    }
  ]
}
```

**Validation Rules:**
- Exactly 2 legs required
- Both legs must specify `account_id`
- Accounts must be distinct
- Both legs must reference the same `asset_id`
- Quantities must be opposites (sum to zero)
- Valuation fields must be consistent between legs
- All referenced accounts and assets must exist

**Response:**
```json
{
  "ids": [123, 124],
  "date_time": "2025-12-23T21:00:00.000Z",
  "legs": 2,
  "type": "TRANSFER"
}
```

### Error Handling Patterns
- 400 Bad Request for validation errors
- 401 Unauthorized for authentication failures
- 404 Not Found for missing resources
- 409 Conflict for concurrency violations
- 500 Internal Server Error for unexpected failures
- 207 Multi-Status for partial success operations

## Frontend Implementation

### Page Structure
- `app/(authenticated)/layout.tsx` - Shared authenticated shell
- Individual pages under route groups (assets, accounts, ledger, etc.)
- Consistent navigation and styling across all pages

### Key Components

#### Data Tables
- `DataTable` - Reusable table component with pagination
- `HoldingsTable` - Holdings-specific table with PnL columns
- `LedgerTable` - Transaction history with filtering
- `AssetsTable` & `AccountsTable` - Entity management tables

#### Forms
- `AssetForm` & `AccountForm` - Entity creation/editing
- `LedgerForm` - Transaction entry with trade and transfer support
- `LedgerBulkEditModal` - Bulk transaction operations

#### Transfer-Specific UI
- Transfer mode detection in `LedgerForm`
- Source and destination account selectors
- Asset and quantity inputs for transfer
- Valuation fields shared across both legs
- Validation to prevent same-account transfers

#### Settings & Diagnostics
- `UnmatchedDiagnosticsViewer` - Interactive component for cost basis issues
- Support for multi-select matching and resolution actions
- Real-time status feedback during resolution


#### Charts & Visualization
- `HoldingsAllocationCharts` - Portfolio allocation pie charts
- `PnlTimeSeriesChart` - Historical PnL visualization
- Dashboard charts integrated with existing design shell

#### Import/Export
- CSV import workflow with column mapping
- Preview and validation before commit
- Export buttons with proper file formatting

## Migration Notes

### Schema Evolution
- Valuation fields added via `20251218004753_add_ledger_valuation` migration
- Price refresh tracking via `20251218045457_add_price_refresh_run` migration
- Portfolio snapshots via `20260101000000_create_portfolio_snapshot` migration
- Transfer type support added via `ALLOWED_TX_TYPES` extension (no schema change required)

### Backward Compatibility
- All new fields are nullable to support existing data
- API contracts maintain backward compatibility
- UI gracefully handles missing valuation data
- Transfer functionality is additive - existing flows unaffected

### Data Migration Strategies
- Existing transactions without valuation show "Unknown cost basis"
- Settings migration coerces non-USD currencies to USD
- Snapshot data requires migration before PnL history is available
- Transfer functionality works with existing account/asset data

## Testing Strategy

### Unit Testing
- Cost basis calculations with various transaction patterns including transfers
- Rate limiting behavior under different scenarios
- Settings validation and normalization
- API endpoint input validation including transfer validation
- Transfer-specific validation logic (same asset, opposite quantities, distinct accounts)

### Integration Testing
- End-to-end transaction flows (create, edit, delete) including transfers
- CSV import with various data formats
- Price refresh with mock external APIs
- Backup and restore procedures
- Transfer creation and validation workflows

### End-to-End Testing
- Complete user workflows from asset creation to portfolio viewing
- Multi-step processes like trade entry, transfer execution, and double-entry verification
- Settings changes and their impact across the application
- Cross-account holdings movements and cost basis preservation

### Performance Testing
- Large dataset handling (thousands of transactions including transfers)
- Concurrent user operations
- Price refresh performance with many assets
- Database query optimization verification
- Multi-leg transaction performance

## Security Considerations

### Authentication
- Secure session management with HTTP-only cookies
- Password hashing and environment variable storage
- CSRF protection via same-site cookie attributes

### Data Protection
- Input sanitization and validation
- SQL injection prevention via parameterized queries
- Rate limiting to prevent API abuse
- Transfer validation to prevent unauthorized cross-account movements

### External API Security
- Secure API key storage in environment variables
- Request timeouts to prevent resource exhaustion
- Error handling that doesn't expose sensitive information

## Production Deployment

### Environment Configuration
- Environment-specific settings via `.env` files
- Database connection with absolute paths
- Backup configuration with proper AWS credentials
- SSL/TLS configuration for HTTPS

### Monitoring & Observability
- Structured logging with operation prefixes
- Health endpoints for monitoring systems
- Performance metrics tracking
- Error rate monitoring and alerting
- Transfer operation monitoring for audit trails

### Scaling Considerations
- Database connection pooling
- API rate limiting and caching strategies
- Horizontal scaling considerations for multi-instance deployments
- CDN configuration for static assets
- Transfer validation performance with large account/asset datasets

This implementation provides a complete, production-ready portfolio tracking application with all MVP requirements fulfilled, additional enterprise-grade features for reliability and maintainability, and comprehensive transfer and reconciliation functionality.

---

## 🛑 Pending & Technical Debt

### Database Performance: Reconciliation Indexes
- **Status**: ⚠️ Postponed
- **Context**: Added `external_reference` and compound `[tx_type, external_reference, date_time]` indexes to the schema, but migration was skipped due to a local environment sync issue (missing legacy migrations).
- **Action Required**: Once environment is synced, run `npx prisma migrate dev` to apply these indexes for optimal performance during large batch reconciliation deletions.
