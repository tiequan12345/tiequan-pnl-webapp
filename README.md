# TieQuan P&L Webapp

![App screenshot](./app-example-012126.png)

A Next.js-based portfolio and P&L tracking application with automated price fetching, rate limiting, and robust authentication.

## Overview

This webapp provides a comprehensive solution for tracking investment portfolios, including:
- Portfolio holdings and P&L calculations
- Historical P&L snapshots with filtered charts and a dedicated `/pnl` view
- Automated price fetching for crypto (CoinGecko) and equities (Finnhub)
- Rate-limited API calls with monitoring
- SQLite database with Prisma ORM
- Authentication via middleware
- Settings management for auto-refresh intervals

## Architecture

- **Framework**: Next.js 14 with App Router
- **Database**: SQLite with Prisma ORM
- **Authentication**: Single-user session-based auth via middleware
- **API**: RESTful endpoints for data management and price refreshing
- **Rate Limiting**: Custom rate limiter for CoinGecko API (30 calls/minute)
- **Deployment**: Oracle VPS (or any Linux host) with PM2 for the Next.js server + `crontab` for scheduled jobs (see `scripts/cron/`)

## Quick Start

### Installing pnpm

If you don't have pnpm installed, you can install it using one of the following methods:

**Option 1: Using npm (recommended)**
```bash
npm install -g pnpm
```

**Option 2: Using curl**
```bash
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

**Option 3: Using Homebrew (macOS)**
```bash
brew install pnpm
```

For more installation options, visit [pnpm.io/installation](https://pnpm.io/installation)

### Prerequisites

- Node.js 18+
- pnpm
- Git

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd tiequan-pnl-webapp
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Configure your environment variables (see [Environment Setup](#environment-setup))

5. Set up the database:
```bash
pnpm run prisma:generate
pnpm run prisma:migrate
```

6. Start the development server:
```bash
pnpm run dev
```

The application will be available at `http://localhost:1373`.

**TradeStation note:** TradeStation's default localhost callback allowlist typically includes port `3000` (but not `1373`). For TradeStation OAuth flows, run the dev server on port 3000:
```bash
pnpm run dev:ts
```
Then use `http://localhost:3000`.

## Environment Setup

Create a `.env.local` file in the root directory with the following variables:

```env
# Required: Password for application authentication
APP_PASSWORD=your-secure-password

# Required: Database connection string (SQLite)
DATABASE_URL="file:prisma/dev.db"

# --- TradeStation OAuth / Brokerage API (optional) ---
# Used to import orders into the ledger and (best-effort) price options from positions.
TRADESTATION_CLIENT_ID=your-tradestation-client-id
TRADESTATION_CLIENT_SECRET=your-tradestation-client-secret

# Redirect URI must match your TradeStation API key configuration.
# For local dev, TradeStation commonly only whitelists localhost roots (no path):
#   http://localhost:3000
# This app rewrites `/?code=...&state=...` to `/api/tradestation/auth/callback` internally.
TRADESTATION_REDIRECT_URI=http://localhost:3000

# Defaults to https://api.tradestation.com
TRADESTATION_BASE_URL=

# Space-separated scopes
# Recommended:
#   "openid offline_access profile MarketData ReadAccount Trade"
TRADESTATION_SCOPE=

# Required: Finnhub API key for equity price fetching
FINNHUB_API_KEY=your-finnhub-api-key

# Required: CoinGecko API key for crypto price fetching
# Get your free API key from: https://www.coingecko.com/en/api/documentation
COINGECKO_API_KEY=your-coingecko-api-key

# Optional: CCXT exchange sync tuning
# How far back automated trade sync looks during scheduled price refresh
CCXT_AUTO_TRADE_LOOKBACK_HOURS=24
# Cursor overlap to avoid missing fills near sync boundaries
CCXT_AUTO_TRADE_OVERLAP_MINUTES=15
# Overlap used by queue worker incremental sync fallback
CCXT_SYNC_TRADE_OVERLAP_MINUTES=15
# Binance market segments included in trade import
# Futures-like segments (future/delivery/swap) are imported as tx_type=HEDGE by default.
CCXT_BINANCE_TRADE_TYPES=spot,margin,future
# Optional cap for markets scanned per profile during trade sync (0 = no cap)
CCXT_SYNC_MAX_MARKETS_PER_PROFILE=0
CCXT_SYNC_TRADE_PAGE_LIMIT=200
CCXT_SYNC_TRADE_MAX_PAGES_PER_SYMBOL=5
CCXT_SYNC_MOVEMENT_PAGE_LIMIT=1000
CCXT_SYNC_MOVEMENT_MAX_PAGES=5
# For derivatives profiles, include all quote currencies by default.
# Set true to only scan markets matching CCXT_DEFAULT_QUOTE.
CCXT_DERIVATIVES_DEFAULT_QUOTE_ONLY=false
# Queue worker behavior
CCXT_SYNC_JOB_MAX_PER_RUN=1
CCXT_SYNC_JOB_RUNNING_TIMEOUT_MINUTES=30
CCXT_SYNC_JOB_MAX_RETRY_ATTEMPTS=3
CCXT_SYNC_JOB_RETRY_BASE_SECONDS=30
CCXT_SYNC_JOB_RETRY_MAX_SECONDS=900
CCXT_SYNC_JOB_HEARTBEAT_SECONDS=10
# Cron auth + endpoints
CCXT_CRON_SYNC_TOKEN=your-random-token
CCXT_SYNC_AUTH_HEADER="Authorization: Bearer your-random-token"
CCXT_SYNC_ENDPOINT_URL=http://localhost:1373/api/cron/ccxt/sync
CCXT_SYNC_WORKER_ENDPOINT_URL=http://localhost:1373/api/cron/ccxt/sync-jobs
# Binance wallet segments included in balance reconciliation
# Includes spot balances plus futures wallet collateral (walletBalance only, excludes unrealized PnL).
# Add others only if needed (e.g. spot,future,margin or spot,untyped).
CCXT_BINANCE_BALANCE_TYPES=spot,future
# Ignore Binance balances whose estimated USD value is below this threshold.
CCXT_BINANCE_MIN_USD_VALUE=1

# Optional: S3 backup configuration (required if you run backup scripts)
S3_BUCKET_NAME=your-s3-bucket-name
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
BACKUP_SCHEDULE="0 2 * * *"
BACKUP_RETENTION_DAYS=60
```

### Getting API Keys

**TradeStation API Key (Client ID/Secret):**
1. Request a TradeStation API Key from TradeStation Client Experience / Developer portal.
2. Ensure your API key has access to the scopes you need (commonly: `MarketData`, `ReadAccount`, `Trade`).
3. Ensure the key's **Allowed Callback URLs** include your local dev URL. Many keys include `http://localhost:3000` by default.

**Finnhub API Key:**
1. Sign up at [Finnhub](https://finnhub.io/)
2. Get your free API key from the dashboard
3. Add it to your `.env.local` file

**CoinGecko API Key:**
1. Sign up at [CoinGecko](https://www.coingecko.com/en/api/documentation)
2. Get your free API key (30 calls/minute limit)
3. Add it to your `.env.local` file

## Database Setup

The application uses SQLite with Prisma ORM. The database schema includes:

- **Asset**: Cryptocurrency and equity holdings
- **Account**: Trading accounts and platforms
- **LedgerTransaction**: Transaction history (signed quantities) plus valuation fields for cost basis (`unit_price_in_base`, `total_value_in_base`, `fee_in_base`). For DEPOSIT, YIELD, and trade-like entries, unit price or total value is required (use explicit `0` for zero-cost basis). `COST_BASIS_RESET` entries (quantity `0`) anchor cost basis as-of a timestamp, and CASH/STABLE assets are treated as 1:1 with the base currency so their cost basis can be inferred directly from quantity.
- **PriceLatest**: Latest price cache for assets
- **Setting**: Application configuration
- **PortfolioSnapshot**: History of tensile snapshots (timestamp, base currency, total value) plus denormalized components for asset/account breakdowns (see `PortfolioSnapshotComponent`).

### Initial Setup

1. Generate Prisma client:
```bash
pnpm run prisma:generate
```

2. Run database migrations:
```bash
pnpm run prisma:migrate
```

3. (Optional) Seed initial data through the application UI

### Database Schema

See [`prisma/schema.prisma`](prisma/schema.prisma) for the complete database schema definition.

## Authentication Flow

The application uses a simple single-user authentication system:

### Flow Overview

1. **Login Page**: User enters password at `/login`
2. **API Call**: Form POSTs to `/api/login`
3. **Validation**: Server compares password with `APP_PASSWORD`
4. **Session Creation**: Sets `app_session` cookie on success
5. **Middleware Protection**: All routes except `/login` and public API endpoints (`/api/login`, `/api/prices/refresh`, `/api/prices/health`, `/api/prices/rate-limit`) require a valid session
6. **Redirect**: Unauthenticated users are redirected to `/login`

### Key Components

- **Login Page**: [`app/login/page.tsx`](app/login/page.tsx)
- **Login API**: [`app/api/login/route.ts`](app/api/login/route.ts)
- **Middleware**: [`middleware.ts`](middleware.ts)
- **Authenticated Layout**: [`app/(authenticated)/layout.tsx`](app/(authenticated)/layout.tsx)

### Session Management

- Cookie-based sessions with `app_session` name
- Middleware enforces authentication on all protected routes
- Single-user system (no multi-user support)

## TradeStation Integration (OAuth + Sync)

This project supports importing recent TradeStation orders into the ledger and pricing option positions (best-effort) using the TradeStation API.

### Prerequisites

1. Set the TradeStation environment variables in `.env.local` (see [Environment Setup](#environment-setup)).
2. For local OAuth flows, run on port **3000** and set:
   - `TRADESTATION_REDIRECT_URI=http://localhost:3000`

TradeStation commonly whitelists only specific localhost callback URLs by default (often the *root* `http://localhost:3000`, not a path). This app supports that by rewriting:
- `GET /?code=...&state=...` → `/api/tradestation/auth/callback` (via `middleware.ts`).

### Connect a local Account to TradeStation

1. Log into the app at `/login` (required; most TS routes are authenticated).
2. Create a local account at `/accounts/new`:
   - `platform`: `TradeStation`
   - `account_type`: `BROKER`
   - `status`: `ACTIVE`
3. Note the local account id (`Account.id`).
4. Start OAuth:

   `GET /api/tradestation/auth/start?accountId=<LOCAL_ACCOUNT_ID>`

5. After approving in TradeStation you will be redirected back and a `TradeStationConnection` record will be created/updated.
6. Check status:

   `GET /api/tradestation/status?accountId=<LOCAL_ACCOUNT_ID>`

7. (Optional) If your TradeStation login has multiple brokerage accounts, list and link the correct one:

   - List: `GET /api/tradestation/accounts?accountId=<LOCAL_ACCOUNT_ID>`
   - Link: `POST /api/tradestation/accounts` with body:
     ```json
     { "accountId": 42, "tsAccountId": "11613055" }
     ```

### Sync orders into the ledger

- UI helper (recommended):

  `GET /api/tradestation/sync?accountId=<LOCAL_ACCOUNT_ID>`

  This page submits `POST /api/tradestation/sync`.

- The TradeStation **Historical Orders** endpoint has a **maximum 90-day lookback**. This means the automatic sync can only import the last ~90 calendar days of history unless TradeStation provides an alternative export method.

- Each imported trade creates **two ledger legs** (best effort):
  - The asset leg (stock/option)
  - A USD cash leg (quantity = `-(qty * price * contractMultiplier) - fee`)

### Daily cash reconciliation (TradeStation balances)

To account for dividends, interest, margin changes, and other cash activity not represented in orders, use the cash reconcile mode:

`POST /api/tradestation/sync` with body:
```json
{ "accountId": 42, "mode": "cash" }
```

This pulls the TradeStation **Balances** endpoint and creates/updates a single daily `RECONCILIATION` entry for USD (idempotent by date).

### Pricing options via TradeStation

`POST /api/prices/refresh` now also attempts to price `OPTION` assets by calling TradeStation **Positions** for the connected account and using a best-effort mark:
- Prefer **mid price** `(bid + ask) / 2`
- Fallback to `Last`
- Fallback to `MarkToMarketPrice`

This only prices option contracts that appear in **current positions**.

## CCXT Integration (Binance / Bybit)

CCXT routes are protected by the same session middleware used by the rest of the app (`app_session` cookie).

Release note / rollout checklist: [`docs/release-note-2026-02-11-ccxt-queue-hardening.md`](docs/release-note-2026-02-11-ccxt-queue-hardening.md)

### Sync window and UTC behavior

- `CcxtConnection.sync_since` is persisted as an absolute UTC timestamp.
- In the exchange connection UI, `Sync From` is entered via local `datetime-local`, then converted to UTC ISO before save.
- Status displays both local time and UTC (`.toISOString()`) for clarity.

#### How to set or change `Sync From`

**UI**
1. Go to `Accounts -> {account} -> Exchange`.
2. Set **Sync From (optional)**.
3. Click **Save Credentials**.

If the connection already exists, API key/secret fields are optional for this update (you can update `Sync From` without re-entering credentials).

**API**
Use `POST /api/ccxt/{exchange}/connect` with `syncSince` as timezone-qualified ISO:

```json
{
  "accountId": 42,
  "syncSince": "2026-02-11T13:30:00.000Z"
}
```

For first-time setup, `apiKey` and `secret` are required.

### Scheduling regular CCXT sync jobs (production)

CCXT sync now uses an async queue:
- `scripts/cron/run-ccxt-sync.sh` enqueues jobs
- `scripts/cron/run-ccxt-sync-worker.sh` processes queued jobs

Example:

```cron
# Worker every minute
* * * * * ENV_FILE=/etc/tiequan-pnl-webapp.env /bin/bash /path/to/repo/scripts/cron/run-ccxt-sync-worker.sh >> /var/log/tiequan-ccxt-worker.log 2>&1

# Enqueue Binance trades every 15 minutes
*/15 * * * * ENV_FILE=/etc/tiequan-pnl-webapp.env CCXT_SYNC_ACCOUNT_ID=4 CCXT_SYNC_EXCHANGE=binance CCXT_SYNC_MODE=trades /bin/bash /path/to/repo/scripts/cron/run-ccxt-sync.sh >> /var/log/tiequan-ccxt-binance-trades-enqueue.log 2>&1
```

Important:
- `/path/to/repo` must match the production machine path (it may differ from local dev).
- Set `CCXT_CRON_SYNC_TOKEN` in app env and send matching `Authorization: Bearer ...` in cron env (`CCXT_SYNC_AUTH_HEADER`).
- Configure `CCXT_SYNC_WORKER_ENDPOINT_URL` to `/api/cron/ccxt/sync-jobs`.
- Worker `curl` timeout defaults to `1800` seconds; override with `CURL_MAX_TIME` if needed.
- Worker now retries transient errors automatically (`network`/`timeout`/`rate limit`) using exponential backoff (`CCXT_SYNC_JOB_*` vars).
- Queue dedupe key is `(account_id, exchange_id, mode, since)` for `QUEUED/RUNNING` jobs; set `force: true` to bypass dedupe.

### Manual sync behavior

- `POST /api/ccxt/{exchange}/sync` enqueues an async sync job and returns `202` with `jobId`.
- UI default mode is `trades` (not `balances`) to avoid accidental “0 trades imported” runs.
- `balances` mode only reconciles balances; it does not import trades.
- The endpoint uses incremental fallback `since = max(sync_since, last_trade_sync_at - overlap)` when request `since` is not provided.
- You can override that cutoff per run by passing `since` in the request body.
- Pass `force: true` to enqueue a new job even when a matching queued/running job already exists.
- `since`/`syncSince` must be ISO 8601 with timezone (`Z` or `±HH:MM`) to avoid timezone ambiguity.

### Queue observability

- `GET /api/ccxt/sync-jobs/{id}` now includes:
  - `progress` (parsed `progress_json`)
  - `heartbeat_at`
  - `next_run_at` (when retry is scheduled)
- Worker endpoint (`POST /api/cron/ccxt/sync-jobs`) returns `retryScheduledFor` when a transient error is requeued.

### API checks and migration note

- CCXT `connect`, `status`, and `sync` routes validate account type (`BINANCE`/`BYBIT`) against route exchange.
- If `sync_since` column is missing (migration not applied), routes return `503` with a migration-required message.
- Deploy flow should run Prisma migrations before app startup (`pnpm run prisma:migrate:deploy`).

## Pricing API Endpoints

The application provides several endpoints for price management and monitoring:

### Price Refresh Endpoints

#### Batch Refresh: `POST /api/prices/refresh`

Refreshes prices for all assets with `AUTO` pricing mode.

**Response:**
```json
{
  "refreshed": [1, 2],
  "failed": [
    {
      "id": 3,
      "symbol": "INVALID",
      "type": "CRYPTO",
      "error": "No price data returned from API"
    }
  ],
  "rateLimitStats": {
    "currentCalls": 1,
    "maxCalls": 30,
    "remainingCalls": 29,
    "usagePercentage": 3,
    "status": "healthy",
    "timeWindowMs": 60000,
    "nextAvailableSlot": 1700000000000
  },
  "processed": {
    "crypto": 2,
    "equity": 0,
    "option": 0,
    "total": 2
  },
  "summary": {
    "successCount": 2,
    "failureCount": 1,
    "successRate": "66.7%",
    "duration": "2500ms"
  }
}
```

#### Single Asset Refresh: `POST /api/prices/refresh/[assetId]`

Refreshes price for a specific asset by ID.

**Response:**
```json
{
  "assetId": 123,
  "refreshed": true
}
```

#### Rate Limit Status: `GET /api/prices/rate-limit`

Returns current rate limiting statistics and recommendations.

**Response:**
```json
{
  "success": true,
  "data": {
    "currentCalls": 5,
    "maxCalls": 30,
    "remainingCalls": 25,
    "usagePercentage": 17,
    "status": "healthy",
    "timeWindowMs": 60000,
    "nextAvailableSlot": 1700000000000,
    "callHistory": [
      { "timestamp": 1700000000000, "timeAgo": "5s ago" }
    ],
    "recommendations": [
      "Rate limit usage is healthy."
    ]
  },
  "timestamp": "2025-12-31T23:59:59.999Z"
}
```

#### Health Check: `GET /api/prices/health`

Basic health check for pricing system.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-31T23:59:59.999Z",
  "responseTime": "120ms",
  "metrics": {
    "autoAssetsCount": 12,
    "totalAssetsWithPrices": 12,
    "recentUpdatesInLast2Hours": 10,
    "priceUpdateCoverage": "83.3%"
  },
  "rateLimit": {
    "currentCalls": 3,
    "maxCalls": 30,
    "remainingCalls": 27,
    "usagePercentage": 10,
    "status": "healthy",
    "timeWindowMs": 60000,
    "nextAvailableSlot": 1700000000000
  },
  "settings": {
    "priceAutoRefresh": true,
    "priceAutoRefreshIntervalMinutes": 60,
    "priceRefreshEndpoint": "/api/prices/refresh"
  },
  "checks": {
    "database": "connected",
    "apiKeys": {
      "coingecko": true,
      "finnhub": true
    },
    "responseTime": "pass",
    "rateLimit": "pass"
  }
}
```

#### PNL History: `GET /api/pnl`

Returns a time-series of portfolio snapshots recorded after each successful price refresh. Filters mirror the holdings view and support:
- `from` / `to` (ISO dates)
- `limit` (number of points, default ~60)
- `accountIds`, `assetTypes`, `volatilityBuckets` (comma-separated)

**Response:**
```json
{
  "baseCurrency": "USD",
  "timezone": "America/New_York",
  "points": [
    {
      "snapshotAt": "2025-08-20T14:00:00.000Z",
      "totalValue": 125000.5,
      "byType": { "CRYPTO": 100000, "EQUITY": 25000 },
      "byVolatility": { "VOLATILE": 90000, "CASH_LIKE": 35000 },
      "byAccount": {
        "1": { "name": "Binance", "value": 90000 },
        "2": { "name": "Interactive Brokers", "value": 35000 }
      }
    }
    // More snapshots...
  ]
}
```

## API Endpoints
### Cost Basis Recalculation

#### Recalculate & Persist: `POST /api/ledger/cost-basis-recalc`

Replays the ledger to recompute cost basis (transfer-aware) and persists results as `COST_BASIS_RESET` entries.

**Request:**
```json
{
  \"as_of\": \"2025-12-31T23:59:59Z\",
  \"mode\": \"PURE\",
  \"external_reference\": \"RECALC:2025-12-31\",
  \"notes\": \"Recalc (PURE) as of 2025-12-31\"
}
```

**Response:**
```json
{
  \"as_of\": \"2025-12-31T23:59:59.000Z\",
  \"mode\": \"PURE\",
  \"created\": 128,
  \"skippedUnknown\": 4,
  \"skippedZeroQuantity\": 2,
  \"external_reference\": \"RECALC:2025-12-31T23:59:59.000Z\",
  \"diagnostics\": []
}
```

**Modes:**
- `PURE` ignores existing cost basis resets.
- `HONOR_RESETS` applies existing resets during replay.

**Diagnostics:**
- Transfer pairing issues are returned in `diagnostics` and logged server-side for review.

### Ledger Valuation Requirements

- `DEPOSIT`, `YIELD`, `TRADE`, `NFT_TRADE`, `OFFLINE_TRADE`, and `HEDGE` require either `unit_price_in_base` or `total_value_in_base`.
- Zero-cost basis must be explicit (`0`), not `null`.

## CoinGecko Refresh Lifecycle

The application implements a robust price refresh system with rate limiting and error handling.

### Refresh Process

1. **Asset Query**: Finds all assets with `AUTO` pricing mode
2. **Batch Processing**: Groups assets by type (crypto vs equity)
3. **Rate Limiting**: Enforces 30 calls/minute limit for CoinGecko
4. **API Calls**: Fetches prices with exponential backoff retry
5. **Database Update**: Upserts to `PriceLatest` table
6. **Logging**: Comprehensive operation logging

### Rate Limiting

The custom rate limiter ([`lib/rateLimiter.ts`](lib/rateLimiter.ts)) provides:

- **30 calls/minute** limit for CoinGecko API
- **Exponential backoff** for failed requests
- **Call history tracking** for monitoring
- **Adaptive recommendations** based on usage patterns

### Error Handling

- **Retry Logic**: Up to 3 retries with exponential backoff
- **Graceful Degradation**: Failed assets don't block successful ones
- **Detailed Logging**: All operations logged with timestamps
- **Status Reporting**: Comprehensive success/failure reporting

### Symbol Normalization & CoinGecko Mapping

The pricing system resolves CoinGecko IDs in this order:

1. **Asset-level override**: `asset.metadata_json.coinGeckoId` (editable in `/assets/:id`)
2. **Built-in symbol map**: defaults from [`lib/coingecko.ts`](lib/coingecko.ts)
3. **Fallback**: lower-cased symbol

This allows exchange symbols (e.g. `DOT`) to map cleanly to CoinGecko slugs (e.g. `polkadot`) without renaming the tracked asset symbol.

Examples:

```typescript
resolveCoinGeckoIdFromSymbol({ symbol: 'DOT' }); // 'polkadot'
resolveCoinGeckoIdFromSymbol({ symbol: 'DOT', coinGeckoIdOverride: 'polkadot' }); // 'polkadot'
```

For UI usage, go to **Assets → Edit Asset → CoinGecko ID Override**.

## Automated Refresh

The application supports automated price refresh through a **server-side cron job** (Oracle VPS):

### Cron (recommended for Oracle VPS)

- **Schedule**: Run hourly at the top of the hour (`0 * * * *`)
- **Runner**: `scripts/cron/run-price-refresh.sh`
- **Endpoint**: Calls `POST /api/prices/refresh`
- **Mode Detection**: Includes `X-Refresh-Mode: auto` header to differentiate scheduled vs manual runs
- **Interval Enforcement**: Runs honor `priceAutoRefreshIntervalMinutes`; the system skips the run if the configured interval has not passed since the last successful or partial refresh
- **Settings Toggle**: Runs respect `priceAutoRefresh`; if disabled, the refresh is skipped
- **Concurrency Guard**: A built-in mutex prevents overlapping refreshes; if a run is already in progress, new requests are blocked with a `409 Conflict`
- **Execution History**: All refresh attempts (manual and auto) are recorded in the `PriceRefreshRun` table

See `scripts/cron/README.md` for the exact `crontab` entry and environment file setup.

### GitHub Actions workflow (manual only)

`.github/workflows/price-refresh.yml` is kept for manual triggering/debugging, but is **not scheduled**.

### Manual Refresh

Users can trigger manual refresh through:

- **Settings Page**: `/settings` includes a refresh button
- **Direct API Call**: POST to `/api/prices/refresh`
- **Individual Asset**: POST to `/api/prices/refresh/[assetId]`

### Monitoring

Monitor the refresh system through:

- **Rate Limit Endpoint**: `/api/prices/rate-limit`
- **Execution Logs**: Check `/var/log/...` (if you redirect cron output), PM2 logs, and your reverse proxy logs
- **Database**: Query `PriceLatest` table for freshness
- **Health Endpoint**: `/api/prices/health` (publicly accessible)

## Settings Management

The application includes a settings system for configuration:

### Available Settings

- **baseCurrency**: Base currency for portfolio (fixed to "USD")
  - Note: Base currency is locked to USD as all pricing providers (CoinGecko and Finnhub) return USD values
  - This setting is read-only in the UI to prevent incorrect currency formatting
- **timezone**: User timezone for date display
- **priceAutoRefresh**: Enable/disable automatic price refresh
- **priceAutoRefreshIntervalMinutes**: Interval for auto-refresh
- **priceRefreshEndpoint**: Custom endpoint for price refresh

### Settings API

- **GET /api/settings**: Retrieve current settings
- **POST /api/settings**: Update settings

### Settings UI

Access settings through the authenticated `/settings` page.
- Includes a cost basis recalculation trigger that calls `POST /api/ledger/cost-basis-recalc`.
- **Interactive Transfer Resolution**: Unmatched transfer legs are displayed with an interface to easy resolve them:
  - **Match Together**: Forces separate transactions to be treated as a single transfer by syncing timestamps and ID.
  - **Treat as Separate**: Converts generic transfers into independent Deposits/Withdrawals to clear warnings.

## Development

### Project Structure

```
app/
├── (authenticated)/          # Protected routes
│   ├── layout.tsx           # Authenticated layout wrapper
│   ├── page.tsx             # Dashboard
│   ├── accounts/            # Account management
│   ├── assets/              # Asset management
│   ├── holdings/            # Portfolio holdings
│   ├── pnl/                 # PNL time-series view with filters
│   ├── ledger/              # Transaction ledger
│   └── settings/            # Application settings
├── api/                     # API routes
│   ├── login/               # Authentication
│   ├── prices/              # Price management
│   ├── accounts/            # Account CRUD
│   ├── assets/              # Asset CRUD
│   └── settings/            # Settings management
└── login/                   # Login page

lib/
├── db.ts                    # Prisma client setup
├── pnlSnapshots.ts          # Portfolio snapshot persistence helpers
├── pricing.ts               # Price fetching logic
├── rateLimiter.ts           # Rate limiting implementation
└── settings.ts              # Settings management

prisma/
└── schema.prisma            # Database schema
```

### Key Libraries

- **Next.js 14**: React framework with App Router
- **Prisma**: Database ORM and migrations
- **Tailwind CSS**: Styling framework
- **Lucide React**: Icon library
- **Recharts**: Chart library for visualizations

### Development Scripts

```bash
pnpm run dev          # Start development server (port 1373)
pnpm run build        # Build for production
pnpm run start        # Start production server
pnpm run lint         # Run ESLint
pnpm run prisma:generate  # Generate Prisma client
pnpm run prisma:migrate   # Run database migrations
```

### Maintenance Scripts

```bash
node scripts/repair-null-yield-valuation.js           # Dry-run: report YIELD/DEPOSIT rows missing total_value_in_base
node scripts/repair-null-yield-valuation.js --apply   # Backfill missing totals (and unit price when absent)
```

## Deployment

### Oracle VPS Deployment (PM2)

High-level steps:

1. **Provision VPS**: Install Node.js + pnpm.
2. **Deploy code**: Clone/pull the repo on the server.
3. **Configure env**: Create `.env` (or `.env.local`) with production values.
4. **Migrate + build**:
   - `pnpm install`
   - `pnpm run prisma:generate`
   - `pnpm run prisma:migrate:deploy`
   - `pnpm run build`
5. **Run with PM2**: Use `ecosystem.config.js`.
6. **Schedule refresh**: Add the hourly `crontab` entry (see `scripts/cron/README.md`).

### Environment Variables for Production

Ensure all variables from `.env.example` are set in your hosting platform:

- `APP_PASSWORD`
- `DATABASE_URL`
- `FINNHUB_API_KEY`
- `COINGECKO_API_KEY`
- `S3_BUCKET_NAME` (required if you run backups)
- `S3_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `BACKUP_SCHEDULE`
- `BACKUP_RETENTION_DAYS`
 
When running on your own server with PM2, point the process at `ecosystem.config.js` (provided in the repo). That file loads `.env` using `dotenv`, sets `cwd` to the repo root, and exposes the same vars the rest of the app expects, so you do not need to pass every env var manually to `pm2`.

### Scheduler (cron)

This project runs the hourly refresh from the **Oracle VPS** using `crontab`.

- See `scripts/cron/README.md` for the server setup.
- The endpoint invoked is `/api/prices/refresh`.
- If your deployment requires auth, pass an auth header (e.g. `Authorization: Bearer ...`) via the cron env file.

> Note: `.github/workflows/price-refresh.yml` is kept only for **manual** triggering/debugging.

### Database Considerations

- **Production Database**: The app uses SQLite in all environments; ensure your Oracle VPS (or host) provides a persistent filesystem location for the database file and that your process user can read/write it.
- **Migrations**: Run migrations during deployment
- **Backups**: Set up regular database backups
- **SQLite Path Resolution**: The server now normalizes `DATABASE_URL` by searching upward from both the current working directory and the compiled module directory for the repo root before resolving relative `file:` URLs, so refer to `prisma/dev.db` only relative to the project root and let the helper turn it into an absolute path.

## Monitoring and Troubleshooting

### Common Issues

#### Authentication Problems

**Issue**: Can't log in despite correct password
**Solution**: 
- Check `APP_PASSWORD` environment variable
- Clear browser cookies
- Check browser console for errors
- The backend now checks `x-forwarded-proto` (and the referer) before applying `secure` to the `app_session` cookie, so HTTP deployments behind a proxy still receive the cookie when the password is valid. You only need to ensure `APP_PASSWORD` matches on the running server; the middleware keeps redirecting until that cookie exists.

#### Price Refresh Failures

**Issue**: Prices not updating
**Solution**:
- Check API keys are valid
- Monitor rate limit status at `/api/prices/rate-limit`
- Check server logs (PM2 logs / systemd journal / reverse proxy logs)
- Verify assets have `AUTO` pricing mode

#### Rate Limiting Issues

**Issue**: Hitting CoinGecko rate limits
**Solution**:
- Monitor usage at `/api/prices/rate-limit`
- Consider upgrading CoinGecko plan
- Adjust refresh intervals

#### Database Issues

**Issue**: Database connection problems
**Solution**:
- Check `DATABASE_URL` environment variable
- Run migrations: `pnpm run prisma:migrate`
- Check Prisma client generation

### Monitoring Endpoints

- **Health Check**: `GET /api/prices/health`
- **Rate Limit Status**: `GET /api/prices/rate-limit`
- **Settings**: `GET /api/settings`

### Logging

The application includes comprehensive logging:

- **Pricing Operations**: All price fetch operations are logged
- **Rate Limiting**: Rate limiter tracks call history
- **Errors**: Detailed error logging with context
- **Performance**: Operation duration tracking

### Performance Optimization

- **Batch Processing**: Crypto prices fetched in batches
- **Rate Limiting**: Prevents API abuse and optimizes usage
- **Caching**: Latest prices cached in database
- **Retry Logic**: Exponential backoff for failed requests

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Development Guidelines

- Follow existing code style
- Add appropriate error handling
- Update documentation
- Test rate limiting behavior
- Verify database migrations

## License

This project is licensed under the MIT License.

## Support

For issues and questions:

1. Check this README for common solutions
2. Review the troubleshooting section
3. Check existing GitHub issues
4. Create a new issue with detailed information

---

**Note**: This application is designed for single-user use. For multi-user scenarios, additional authentication and authorization logic would be required.
