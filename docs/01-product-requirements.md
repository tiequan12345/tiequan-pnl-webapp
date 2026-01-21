# TieQuan Portfolio App - Product Requirements & Implementation

## Table of Contents
1. [Product Overview](#product-overview)
2. [Goals and Non-Goals](#goals-and-non-goals)
3. [Core User Flows](#core-user-flows)
4. [Data Model](#data-model)
5. [Pages and Screens](#pages-and-screens)
6. [API Endpoints](#api-endpoints)
7. [Phase Implementation Plan](#phase-implementation-plan)

## Product Overview

Single-user portfolio tracking web app to replace an existing Google Sheet. The app tracks multi-asset holdings (crypto, stocks, NFTs, offline ventures, cash), supports simple transaction capture (manual + CSV import), and provides a clear portfolio overview (allocation + value).

Target user: you (or another power user) running this locally or on a private server, single login, no public sign-ups.

Tech stack (fixed):
- Frontend: Next.js (App Router)
- Backend: Next.js API routes within same codebase
- DB: SQLite
- ORM: Prisma
- Auth: Minimal, single user, env-configured

UI / UX Baseline and Aesthetic Constraints:
- The existing `app/page.tsx` implementation and layout (sidebar, top bar, cards, typography, spacing, and general visual styling) are the canonical design baseline
- All future phases must preserve this aesthetic as closely as possible
- Enabling functionality should be done by wiring real data and flows under or around the existing shell, not by replacing it with a new visual design

## Goals and Non-Goals

### Goals (MVP)
- Replace the existing Google Sheet with a functioning web app that:
  - Stores assets, accounts, transactions
  - Computes holdings and valuations from ledger + prices
  - Displays a usable, correct dashboard and holdings view
  - Allows manual transaction entry and CSV import
  - Supports basic settings and backups
  - Preserves the existing dashboard shell aesthetic

### Explicit Non-Goals (MVP)
- Multi-user support or roles
- AI features (classification, NL queries)
- Tax reporting, tax lots
- Direct broker/CEX/wallet integrations
- Complex performance metrics (IRR, drawdowns, risk metrics)
- Historical pricing and time-series performance
- Major visual redesign of the dashboard shell

## Core User Flows (MVP)

1. Define assets (coins, stocks, NFTs, offline, cash), including pricing mode
2. Define accounts (CEX, wallets, brokers, bank, offline)
3. Record transactions:
   - Manually add trades, transfers, deposits/withdrawals, fees, etc.
   - Bulk import ledger from CSV, including mapping and preview
4. Refresh prices for auto-priced assets
5. View holdings:
   - Per account and consolidated
   - Cost basis, quantity, market value, unrealized PnL
6. View dashboard:
   - Total portfolio value, allocation by type and volatility bucket
   - Top holdings, recent transactions
7. Configure timezone and auto-refresh preferences (base currency is fixed to USD) and export data as CSV/DB for backup

## Data Model

### assets
- id (PK)
- symbol (string, indexed)
- name (string)
- type (enum): CRYPTO, EQUITY, STABLE, NFT, OFFLINE, CASH, OTHER
- volatility_bucket (enum): CASH_LIKE, VOLATILE
- chain_or_market (string) — e.g., ETH, SOL, NASDAQ, OFFLINE
- pricing_mode (enum): AUTO, MANUAL
- manual_price (decimal, nullable)
- metadata_json (JSON, nullable)
- created_at, updated_at

### accounts
- id (PK)
- name (string)
- platform (string)
- account_type (enum): CEX, DEX_WALLET, BROKER, BANK, NFT_WALLET, OFFLINE, OTHER
- chain_or_market (string, nullable)
- status (enum): ACTIVE, INACTIVE
- notes (string, nullable)
- created_at, updated_at

### ledger_transactions
- id (PK)
- date_time (timestamp, UTC)
- account_id (FK → accounts.id)
- asset_id (FK → assets.id)
- quantity (decimal; **signed**; positive = asset quantity increases, negative = decreases)
- tx_type (enum): DEPOSIT, WITHDRAWAL, TRADE, TRANSFER, YIELD, NFT_TRADE, OFFLINE_TRADE, HEDGE, RECONCILIATION, COST_BASIS_RESET, OTHER
- external_reference (string, nullable)
- notes (text, nullable)
- unit_price_in_base (Decimal, nullable)
- total_value_in_base (Decimal, nullable)
- fee_in_base (Decimal, nullable)
- created_at, updated_at

Notes:
- For DEPOSIT, YIELD, and trade-like entries, unit price or total value is required (use explicit `0` for zero-cost basis).

### prices_latest
- id (PK)
- asset_id (FK → assets.id, unique)
- price_in_base (decimal)
- source (string)
- last_updated (timestamp)

### settings
- key (string, PK)
- value (string or JSON)

Required keys:
- base_currency (e.g., "USD")
- timezone (e.g., "America/Los_Angeles")
- price_auto_refresh (e.g., "ON"/"OFF")
- price_auto_refresh_interval_minutes (stringified int, optional)
- price_refresh_endpoint (string, optional; default "/api/prices/refresh")

## Pages and Screens

### Dashboard (/)
Displays:
- Total portfolio value (sum of all priced holdings in base currency)
- Allocation by asset type and volatility bucket
- Top 10 holdings by market value
- Recent 10 transactions

### Assets (/assets)
Table with columns: symbol, name, type, volatility bucket, chain/market, pricing mode, manual price, last price, last updated, status icon

### Accounts (/accounts)
Table with columns: name, platform, account_type, chain/market, status, notes

### Ledger (/ledger)
List view with columns: Date/Time, Account, Asset, Tx Type, signed Quantity, Notes, Actions
Pagination: 50–100 rows per page
Filters: date range, account, asset, tx_type

### Holdings (/holdings)
Two modes: by account (grouped) and consolidated (single list)
Columns: Asset, Account, Quantity, Average cost, Total cost basis, Current price, Market value, Unrealized PnL, PnL %

### Settings (/settings)
Controls: Base currency (fixed to USD), timezone selector, price refresh toggle/interval, price refresh endpoint, "Refresh Prices Now" button, cost basis recalculation tools, export buttons

## API Endpoints

All endpoints are authenticated unless noted otherwise.

### Assets
- GET /api/assets – list, with optional search
- POST /api/assets – create
- PUT /api/assets/:id – update

### Accounts
- GET /api/accounts
- POST /api/accounts
- PUT /api/accounts/:id

### Ledger
- GET /api/ledger – with pagination and filters
- POST /api/ledger – create one or many transactions
- POST /api/ledger/import/commit – accept normalized rows, create transactions
- POST /api/ledger/cost-basis-recalc – replay ledger and persist COST_BASIS_RESET entries
- POST /api/ledger/cost-basis-reset – bulk cost basis reset allocations
- POST /api/ledger/reconcile – preview/commit reconciliation adjustments
- POST /api/ledger/resolve-transfer – resolve unmatched transfer legs
- GET /api/ledger/transfer-issues – list unmatched transfer diagnostics

### Holdings
- GET /api/holdings – with filters for account, asset type, volatility

### Pricing
- POST /api/prices/refresh – refresh all auto-priced assets (public)
- POST /api/prices/refresh/[assetId] – refresh specific asset (authenticated)
- GET /api/prices/health – system health status (public)
- GET /api/prices/rate-limit – current API usage (public)

### Settings
- GET /api/settings
- POST /api/settings – update

### Exports
- GET /api/export/assets
- GET /api/export/accounts
- GET /api/export/ledger
- GET /api/export/db – returns DB file

## Phase Implementation Plan

### Phase 0 – Project Setup & Skeleton ✅
- Next.js App Router with authenticated layout
- Prisma + SQLite configured
- Single-user auth via APP_PASSWORD
- Basic routing preserving dashboard aesthetic

### Phase 1 – Assets & Accounts CRUD ✅
- Full CRUD for assets and accounts
- Validation of required fields and enums
- Forms integrated with existing UI shell

### Phase 2 – Ledger: Manual Transactions & List View ✅
- Manual transaction entry form
- Double-entry for trades (two rows)
- Ledger list with pagination and filters
- Hedges page for net exposure

### Phase 3 – Holdings Calculation & Valuation ✅
- Cost basis computation with average cost method
- Holdings API with PnL calculations
- Price refresh functionality
- Manual vs auto pricing support

### Phase 4 – Dashboard ✅
- Live portfolio totals and allocations
- Top holdings and recent activity
- Stale price indicators
- Charts within existing design

### Phase 5 – CSV Import ✅
- File upload and column mapping
- Inline account/asset creation
- Preview and commit workflow
- Error handling and validation

### Phase 6 – Settings, Exports, and Backup ✅
- Settings persistence for currency/timezone/pricing
- CSV and DB export functionality
- Manual price refresh trigger

### Phase 7 – Migration Execution
- Process for migrating from Google Sheet
- Data validation and reconciliation
- Parity verification steps

## Current Implementation Status

All core phases (0-6) are complete with the following key features:

- **USD Currency Lock**: Base currency is fixed to USD across UI and backend
- **Cost Basis & PnL**: Holdings display accurate cost basis and unrealized PnL when valuation data is present
- **Price Refresh System**: Automated hourly refresh via GitHub Actions with rate limiting and retry logic
- **Snapshot Persistence**: Portfolio snapshots recorded after each price refresh for historical PnL tracking
- **CSV Import**: Full import workflow with mapping, validation, and inline entity creation
- **Backup System**: Automated SQLite backups to S3 with configurable schedule
- **Rate Limiting**: CoinGecko API rate limiting with batch processing and monitoring
- **Valuation Guardrails**: API/UI require explicit valuation for DEPOSIT, YIELD, and trade-like entries (zero cost basis must be `0`).

The application is fully functional for single-user portfolio tracking with all MVP requirements implemented.
