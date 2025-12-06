1. Product Overview

Single‑user portfolio tracking web app to replace an existing Google Sheet. The app tracks multi‑asset holdings (crypto, stocks, NFTs, offline ventures, cash), supports simple transaction capture (manual + CSV import), and provides a clear portfolio overview (allocation + value).

Target user: you (or another power user) running this locally or on a private server, single login, no public sign‑ups.

Tech stack (fixed):
	•	Frontend: Next.js (App Router).
	•	Backend: Next.js API routes within same codebase.
	•	DB: SQLite.
	•	ORM: Recommended (assume Prisma).
	•	Auth: Minimal, single user, env-configured.

UI / UX Baseline and Aesthetic Constraints:
	•	The existing `app/page.tsx` implementation and layout (sidebar, top bar, cards, typography, spacing, and general visual styling) are the canonical design baseline.
	•	All future phases (including routing, auth, and data wiring) must preserve this aesthetic as closely as possible.
	•	Enabling functionality (auth, DB, APIs, routing) should be done by wiring real data and flows under or around the existing shell, not by replacing it with a new visual design.
	•	When refactoring for URL-based routing (e.g., `/`, `/assets`, `/accounts`, `/ledger`, `/holdings`, `/settings`), extract and reuse components from `app/page.tsx` so that the signed-in experience looks and feels the same as the current mock.

⸻

2. Goals and Non‑Goals

Goals (MVP)
	•	Replace the existing Google Sheet with a functioning web app that:
	•	Stores assets, accounts, transactions.
	•	Computes holdings and valuations from ledger + prices.
	•	Displays a usable, correct dashboard and holdings view.
	•	Allows manual transaction entry and CSV import.
	•	Supports basic settings and backups.
	•	Preserves the existing dashboard shell aesthetic as the primary UX, adding functionality behind it.

Explicit Non‑Goals (MVP)
	•	Multi‑user support or roles.
	•	AI features (classification, NL queries).
	•	Tax reporting, tax lots.
	•	Direct broker/CEX/wallet integrations.
	•	Complex performance metrics (IRR, drawdowns, risk metrics).
	•	Historical pricing and time‑series performance.
	•	Major visual redesign of the dashboard shell; layout changes should be incremental and in service of functionality, not aesthetics.

⸻

3. Core User Flows (MVP)
	1.	Define assets (coins, stocks, NFTs, offline, cash), including pricing mode.
	2.	Define accounts (CEX, wallets, brokers, bank, offline).
	3.	Record transactions:
	•	Manually add trades, transfers, deposits/withdrawals, fees, etc.
	•	Bulk import ledger from CSV, including mapping and preview.
	4.	Refresh prices for auto‑priced assets.
	5.	View holdings:
	•	Per account and consolidated.
	•	Cost basis, quantity, market value, unrealized PnL.
	6.	View dashboard:
	•	Total portfolio value, allocation by type and volatility bucket.
	•	Top holdings, recent transactions.
	7.	Configure base currency/timezone and export data as CSV/DB for backup.

⸻

4. Functional Requirements

4.1 Data Model (DB Schema)

Implementation note (current schema / SQLite):
	•	All enum-like fields described below are stored as `String` columns in SQLite via Prisma rather than native DB enums.
	•	The allowed values still follow the enum sets listed in this PRD and are enforced in the application/API layer (validation in API handlers and forms).
	•	`assets.metadata_json` is implemented as a nullable `String` column that stores JSON text when used, rather than a native JSON column.

assets
	•	id (PK)
	•	symbol (string, indexed)
	•	name (string)
	•	type (enum): CRYPTO, EQUITY, STABLE, NFT, OFFLINE, CASH, OTHER
	•	volatility_bucket (enum): CASH_LIKE, VOLATILE
	•	chain_or_market (string) — e.g., ETH, SOL, NASDAQ, OFFLINE
	•	pricing_mode (enum): AUTO, MANUAL
	•	manual_price (decimal, nullable)
	•	metadata_json (JSON, nullable)
	•	created_at, updated_at

Behavior:
	•	If pricing_mode = AUTO, use prices_latest.price_in_base (if present).
	•	If MANUAL, use manual_price.
	•	If neither available, asset is "unpriced"; holdings using it should be flagged and either excluded from totals or clearly marked as unpriced in UI and dashboard.

accounts
	•	id (PK)
	•	name (string)
	•	platform (string)
	•	account_type (enum): CEX, DEX_WALLET, BROKER, BANK, NFT_WALLET, OFFLINE, OTHER
	•	chain_or_market (string, nullable)
	•	status (enum): ACTIVE, INACTIVE
	•	notes (string, nullable)
	•	created_at, updated_at

ledger_transactions
	•	id (PK)
	•	date_time (timestamp, UTC)
	•	account_id (FK → accounts.id)
	•	asset_id (FK → assets.id)
	•	quantity (decimal; **signed**; positive = asset quantity increases in the account, negative = decreases)
	•	tx_type (enum): DEPOSIT, WITHDRAWAL, TRADE, YIELD, NFT_TRADE, OFFLINE_TRADE, OTHER
	•	external_reference (string, nullable)
	•	notes (text, nullable)
	•	created_at, updated_at

Indexes:
	•	Keep the existing indexes on date_time, account_id, asset_id, tx_type as-is (these are still valid).

Behavior:
	•	`quantity` is the only numeric field describing how holdings change; pricing and value are derived from separate price tables (e.g. prices_latest) when needed.
	•	Trade-like events (TRADE, NFT_TRADE, OFFLINE_TRADE) are represented as two rows (double-entry) for a given account: one positive row for the asset received, one negative row for the asset spent.

prices_latest
	•	id (PK)
	•	asset_id (FK → assets.id, unique)
	•	price_in_base (decimal)
	•	source (string)
	•	last_updated (timestamp)

Index: asset_id unique.

settings
	•	key (string, PK)
	•	value (string or JSON)

Required keys:
	•	base_currency (e.g., "USD")
	•	timezone (e.g., "America/Los_Angeles")
	•	price_auto_refresh (e.g., "ON"/"OFF")
	•	price_auto_refresh_interval_minutes (stringified int, optional)

Optional: Single row JSON, but key-value is simpler and explicit.

positions (optional, can be a view or materialized later)
For MVP you can compute holdings on the fly; positions table can be deferred. If implemented:
	•	id (PK)
	•	account_id (FK)
	•	asset_id (FK)
	•	quantity (decimal)
	•	total_cost_basis (decimal)
	•	average_cost (decimal)
	•	updated_at (timestamp)

⸻

4.2 Pages / Screens

Routing & layout (current implementation):
	•	The signed‑in experience is implemented using a Next.js `(authenticated)` route group under `app/(authenticated)`.
	•	Routes `/`, `/assets`, `/accounts`, `/ledger`, `/holdings`, and `/settings` all render inside a shared `AppShell` layout provided by `app/(authenticated)/layout.tsx`, which wraps pages with the sidebar, top bar, and content shell extracted from the original `app/page.tsx` mock.
	•	The original monolithic `app/page.tsx` has been superseded by this route‑group layout; it no longer owns the signed‑in experience directly.

4.2.1 Dashboard (/)
Displays:
	•	Total portfolio value (sum of all priced holdings in base currency).
	•	Allocation by asset type:
	•	Group holdings by assets.type, sum market_value.
	•	Allocation by volatility bucket:
	•	Group by assets.volatility_bucket.
	•	Top 10 holdings by market value:
	•	Consolidated across accounts.
	•	Recent 10 transactions:
	•	Sorted by date_time desc.

Rules:
	•	All valuations use:
	•	current_price = manual_price if MANUAL, else prices_latest.price_in_base.
	•	market_value = quantity * current_price.
	•	Unpriced holdings:
	•	Excluded from total value/allocations or clearly flagged and shown separately (but do not silently include them at 0 without UI warning).
	•	No historical chart in MVP.
	•	Should show "Prices stale" if:
	•	Any AUTO assets have prices_latest.last_updated older than configured threshold (e.g., 24h or refresh interval * 3).
	•	The look and feel of the dashboard (sidebar, typography, cards, charts) should remain consistent with the existing `app/page.tsx` mock; wiring real data must respect this visual design.

4.2.2 Assets (/assets)
Table:
	•	Columns: symbol, name, type, volatility bucket, chain/market, pricing mode, manual price (if applicable), last price (from prices_latest if AUTO), last updated, status icon for "unpriced".

Actions:
	•	Create asset:
	•	Required: symbol, name, type, volatility_bucket, pricing_mode.
	•	Optional: chain_or_market, manual_price, metadata_json.
	•	Edit asset:
	•	All fields editable except id.
	•	Set manual price:
	•	Only enabled if pricing_mode = MANUAL.
	•	Validation:
	•	Symbol required, unique (case-insensitive).
	•	If MANUAL and manual_price empty, allowed but asset considered unpriced.

4.2.3 Accounts (/accounts)
Table:
	•	Columns: name, platform, account_type, chain/market, status, notes (truncated).

Actions:
	•	Add account.
	•	Edit account.
	•	Deactivate/activate (toggle status).

Behavior:
	•	Transactions referencing an INACTIVE account still work; account remains in history but can be filtered.

4.2.4 Ledger (/ledger)
List view:
	•	Columns: Date/Time, Account, Asset, Tx Type, signed Quantity, Notes, Actions.
	•	Pagination: 50–100 rows per page.
	•	Filters:
	•	Date range (from/to).
	•	Account (multi-select).
	•	Asset (multi-select).
	•	tx_type (multi-select).

Manual entry form:
	•	Required fields: date/time, account, tx_type, and appropriate asset + quantity inputs:
	•	For non-trade types (DEPOSIT, WITHDRAWAL, YIELD, OTHER): a single asset and a positive quantity magnitude.
	•	For trade types (TRADE, NFT_TRADE, OFFLINE_TRADE): two legs – "Asset In + Quantity In" (asset being acquired) and "Asset Out + Quantity Out" (asset being spent) – which the app converts into two ledger rows.
	•	Optional: notes, external_reference.
	•	On submit:
	•	Create ledger_transactions row(s) according to tx_type semantics:
	•	DEPOSIT/YIELD/OTHER → single row with positive quantity.
	•	WITHDRAWAL → single row with negative quantity.
	•	TRADE / NFT_TRADE / OFFLINE_TRADE → two rows (double-entry): one positive row for the acquired asset and one negative row for the spent asset, both tied to the same account and date_time.
	•	UI elements (filters, table, buttons) should be aligned with the current Ledger section styling in the authenticated shell.

Notes on pricing:
	•	The ledger does not store a base currency value per row (no base_price or base_value columns).
	•	When holdings or valuations are displayed, prices are derived from cached prices (e.g. prices_latest) at view time when available; if no price is present, the position remains unpriced rather than forcing a synthetic base_value.

Table view:
	•	Columns: Date/Time, Account, Asset, Tx Type, signed Quantity, Notes, Actions.
	•	Quantity is rendered with its sign (e.g. +10.0 for an inflow, -5.0 for an outflow).
	•	Actions provide per-row Edit and Delete controls for quick adjustments.
	•	Remove any references here to "Direction", "Base price", "Base value", or fee-related columns in the ledger table.

CSV import: separate page (/ledger/import) – see 4.2.5.

4.2.5 CSV Import (/ledger/import)
Flow:
	1.	Upload CSV:
	•	Accept .csv file.
	•	Infer delimiter, header row.
	2.	Column mapping:
	•	User maps CSV columns to canonical fields:
	•	date/time, account name, asset symbol, quantity (signed), tx_type, notes, external_reference.
	•	Show a sample of first N rows to help mapping.
	3.	Validation / mapping:
	•	For each row:
	•	Resolve account_id via account name.
	•	Resolve asset_id via asset symbol.
	•	If account or asset missing:
	•	MVP approach (per spec: Option 2 is "MVP‑friendly"):
	•	Show list of unknown accounts/assets with inline creation UI:
	•	For accounts: name, platform, account_type, status default ACTIVE.
	•	For assets: symbol, name, type, volatility_bucket, pricing_mode (default MANUAL).
	•	After user confirms, re‑run mapping.
	4.	Preview:
	•	Show parsed rows in a table:
	•	Highlight errors (invalid date, non-numeric quantity, unknown tx_type).
	•	Allow bulk ignore of selected rows.
	5.	Commit:
	•	Persist all valid rows as ledger_transactions.
	•	Show success summary: rows created, rows skipped, any errors.

No AI classification: user must map tx_type, or you require that CSV contains a tx_type column.

4.2.6 Holdings (/holdings)
Two modes:
	•	By account (grouped).
	•	Consolidated (single list).

Columns:
	•	Asset.
	•	Account (for per-account view; for consolidated, "All accounts" or aggregated row).
	•	Quantity.
	•	Average cost (per unit).
	•	Total cost basis.
	•	Current price.
	•	Market value.
	•	Unrealized PnL.
	•	PnL %.

Filters:
	•	Account (multi-select).
	•	Asset type (from assets.type).
	•	Optional: search by symbol/name.

Holdings logic:
	•	For each (account_id, asset_id):
	•	quantity:
	•	Sum of signed quantities (positive = inflows, negative = outflows).
	•	Cost basis: average cost method:
	•	Maintain total_cost_basis and quantity.
	•	For buys/IN:
	•	new_total_cost_basis = old_total_cost_basis + base_value (or quantity * base_price).
	•	new_quantity = old_quantity + quantity.
	•	average_cost = new_total_cost_basis / new_quantity.
	•	For sells/OUT:
	•	Realized PnL = (sell_base_price - average_cost) * quantity_sold.
	•	total_cost_basis reduced by average_cost * quantity_sold.
	•	average_cost unchanged for the remaining units.
	•	For MVP, you can either:
	•	Recompute from ledger on demand (for each request).
	•	Or maintain a positions table updated on each ledger change.
	•	Valuation:
	•	current_price: as in dashboard (AUTO price or manual_price).
	•	market_value = quantity * current_price.
	•	unrealized_pnl = market_value - total_cost_basis.
	•	pnl_pct = unrealized_pnl / total_cost_basis (handle 0 cost: show N/A or 0%).

Unpriced assets: mark clearly; show quantity and cost basis, but blank or "Unpriced" for current price, market value, and PnL.

4.2.7 Settings (/settings)
Controls:
	•	Base currency (drop-down or free text with validation).
	•	Timezone selector.
	•	Price refresh:
	•	Toggle AUTO_REFRESH_ON/OFF.
	•	Interval configuration (e.g., 5/15/60 min).
	•	Button: "Refresh Prices Now".
	•	Backups / exports:
	•	Buttons to export:
	•	Assets as CSV.
	•	Accounts as CSV.
	•	Ledger as CSV.
	•	Optional: Download raw SQLite DB file.

⸻

4.3 Pricing Engine

Endpoint: POST /api/prices/refresh

Behavior:
	•	Query all assets with pricing_mode = AUTO.
	•	For each:
	•	Determine which provider to call (crypto vs equity).
	•	Call external API with:
	•	Crypto: symbol + chain_or_market (if needed).
	•	Equity: ticker + market.
	•	On success:
	•	Upsert row into prices_latest with price_in_base, source, last_updated = now.
	•	On failure:
	•	Leave old price.
	•	Log error.
	•	After refresh, dashboard and holdings must use updated prices.

There is no historical price table for MVP.

⸻

4.4 Security and Auth
	•	Single-user auth:
	•	Password stored as hash in env, or a small config file.
	•	Simple session cookie.
	•	No registration or password reset flows.
	•	App assumed to run behind VPN / private network. Still:
	•	Use HTTPS if exposed.
	•	Rate limiting and brute-force protection are nice-to-have, not required for MVP.
	•	Auth and routing changes must integrate with the existing `app/page.tsx` shell so that the post-login experience retains the current layout and styling.

Current implementation (Phase 0):
	•	Single-user auth is implemented via an `APP_PASSWORD` environment variable that the `/api/login` route validates against the submitted password.
	•	The `/login` page presents a password form that POSTs to `/api/login`; on success, the handler issues an `app_session` HTTP‑only cookie used to identify the active session.
	•	`middleware.ts` enforces authentication for all non‑public routes, redirecting unauthenticated requests to `/login?redirect=...` while allowing `/login`, `/api/login`, Next.js internals (e.g. `/_next`), static assets, and `/api/health` to remain publicly accessible.

⸻

4.5 Non‑Functional Requirements
	•	Performance:
	•	Ledger size up to a few hundred thousand rows should remain usable.
	•	Server‑side pagination and filtering on /api/ledger.
	•	Use DB indexes as defined.
	•	Reliability:
	•	DB backups via exports.
	•	If price refresh fails, "Prices stale" warning should be visible.
	•	Observability (MVP‑light):
	•	Log API errors.
	•	Show user‑visible error toasts where sensible.
	•	UX consistency:
	•	Major layout changes should be avoided; new functionality should be slotted into or around the existing dashboard shell where possible.
	•	Refactors for routing or state management should preserve the current aesthetic and interaction patterns.

⸻

5. API Endpoints (MVP)

All endpoints are authenticated.

Current implementation (Phase 1 – assets & accounts):
	•	`GET /api/assets` and `GET /api/accounts` return ordered lists of assets/accounts from Prisma (no search or pagination yet), used by the `/assets` and `/accounts` pages.
	•	`POST /api/assets` and `POST /api/accounts` create new records with explicit validation of required fields and return 400 responses with informative error messages when input is missing, invalid, or (for assets) when a duplicate symbol is detected.
	•	`PUT /api/assets/:id` and `PUT /api/accounts/:id` update existing records by numeric id, returning 404 JSON responses when the target asset or account does not exist.
	•	Enum‑like string fields such as `type`, `volatility_bucket`, `pricing_mode`, `account_type`, and `status` are validated in these handlers against the allowed value sets defined in Section 4.1, even though they are stored as plain `String` columns in SQLite.

Planned / not yet implemented endpoints:
	•	GET /api/assets – list, with optional search.
	•	POST /api/assets – create.
	•	PUT /api/assets/:id – update.
	•	GET /api/accounts
	•	POST /api/accounts
	•	PUT /api/accounts/:id
	•	GET /api/ledger
	•	Query params: page, pageSize, dateFrom, dateTo, accountIds, assetIds, txTypes.
	•	POST /api/ledger – create one or many transactions.
	•	POST /api/ledger/import/parse – accept CSV, return parsed rows + inferred headers.
	•	POST /api/ledger/import/commit – accept normalized rows, create transactions.
	•	GET /api/holdings
	•	Query params: groupBy=account|asset, filters for account, asset type.
	•	POST /api/prices/refresh
	•	GET /api/settings
	•	POST /api/settings – update.
	•	GET /api/export/assets
	•	GET /api/export/accounts
	•	GET /api/export/ledger
	•	(Optional) GET /api/export/db – returns DB file.

⸻

6. Migration Plan (from Google Sheet)
	1.	Export from Google Sheets:
	•	Ledger tab → CSV.
	•	Assets tabs (coins/stocks/NFTs/offline) → CSV, then merge offline into one file.
	•	Accounts/wallets from sheet or recreate manually.
	2.	In the app:
	•	Create assets:
	•	Import CSV into a temporary tool or manual script.
	•	Deduplicate by symbol/name.
	•	Assign type and volatility_bucket.
	•	Create accounts manually via /accounts page.
	3.	Import ledger:
	•	Go to /ledger/import.
	•	Upload ledger CSV.
	•	Map columns.
	•	Create missing accounts/assets inline or fix data and reimport.
	•	Commit transactions.
	4.	Validate:
	•	Compute per-asset holdings in old sheet vs /holdings.
	•	Take a snapshot of prices in sheet and set same manual prices or run refresh as appropriate.
	•	Compare total portfolio value; investigate discrepancies.

⸻

7. Phase Plan with Verifiable Deliverables

Phase 0 – Project Setup & Skeleton

Objective: Have a running, authenticated Next.js app with DB connected and basic routing, while preserving the existing dashboard shell aesthetic defined in `app/page.tsx`.

Scope:
	•	Next.js App Router project initialized.
	•	Prisma (or ORM) configured with SQLite.
	•	DB connection and initial migration creating an empty schema (or partial).
	•	Minimal auth middleware:
	•	Simple login page that checks a single password from env.
	•	Authenticated layout; all app pages require login.
	•	Basic layout:
	•	Top-level navigation for Dashboard, Assets, Accounts, Ledger, Holdings, Settings is available via routes and/or shell state.
	•	The signed-in experience reuses the existing `app/page.tsx` UI shell (sidebar, top bar, cards, colors); refactors must not materially change the visual design, only how data and routing are wired underneath.
	•	Placeholder content on each page that fits naturally into the current design.

Status (current implementation):
	•	Implemented: Next.js App Router with a shared `AppShell` layout under `app/(authenticated)/layout.tsx`, SQLite database configured via `DATABASE_URL="file:./dev.db"`, and aligned Prisma 5.22.0 CLI/client.
	•	Implemented: `/login` page posting to `/api/login`, which validates `APP_PASSWORD` and sets an `app_session` HTTP‑only cookie; `middleware.ts` protects all non‑public routes and redirects unauthenticated users to `/login?redirect=...`.
	•	Implemented: Authenticated routes `/`, `/assets`, `/accounts`, `/ledger`, `/holdings`, and `/settings` all render inside the shared shell with the original dashboard aesthetic; `/ledger`, `/holdings`, and `/settings` currently host placeholder content inside this shell.

Deliverable: Deployed or locally running app where user can log in and click through empty pages that visually match the existing mock.

Verification steps:
	1.	Start app; attempt to access /:
	•	Expect redirect to /login if not authenticated.
	2.	Enter correct password:
	•	Expect redirect to / (Dashboard placeholder using the existing shell aesthetic).
	3.	Enter incorrect password:
	•	Expect visible error; stay on login page.
	4.	Navigate to /assets, /accounts, /ledger, /holdings, /settings:
	•	Each page loads without server errors, displays placeholder headings or cards inside the same visual shell.
	5.	Check DB:
	•	After running initial migrations, SQLite file exists.
	•	Running ORM client in a script can connect without error.

If any of these fail, Phase 0 is not done.

⸻

Phase 1 – Assets & Accounts CRUD

Objective: Fully functional CRUD for assets and accounts with data persisted in SQLite.

Scope:
	•	Implement full schema for assets, accounts, settings (basic keys).
	•	Build /assets:
	•	List table with pagination (even if unnecessary now).
	•	"Add asset" form (modal or separate page).
	•	"Edit asset" form.
	•	Validations for required fields and enums.
	•	Build /accounts:
	•	List table.
	•	Add/edit account.
	•	Activate/deactivate via toggle.
	•	UI should reuse and extend components extracted from the existing shell to keep the same aesthetic.

Status (current implementation):
	•	Implemented: Schema models for `Asset`, `Account`, and `Setting` exist in `prisma/schema.prisma`, with enum‑like fields stored as `String` columns and constrained by application‑level validation.
	•	Implemented: `/assets` and `/accounts` pages are server components that query Prisma directly, render Tailwind‑styled tables inside `AppShell`, and provide `+ Add Asset` / `+ Add Account` links to `/assets/new` and `/accounts/new` form pages as well as per‑row `Edit` links to `/assets/[id]` and `/accounts/[id]`.
	•	Implemented: Client‑side `AssetForm` and `AccountForm` components POST/PUT to `/api/assets`, `/api/assets/:id`, `/api/accounts`, and `/api/accounts/:id`, enforce required fields, validate enum‑like fields against allowed value sets, and redirect back to the list on success.
	•	Planned: Table pagination, advanced filtering/search, and a dedicated activate/deactivate toggle UX on `/accounts` are still to be added to fully meet the "pagination" and "status toggle" aspects of this phase.

Deliverable: After login, user can create, edit, and list assets and accounts, and data is persisted.

Verification steps:

Assets:
	1.	Go to /assets:
	•	Table shows "no assets" state.
	2.	Click "Add asset":
	•	Fill symbol, name, type, volatility bucket, pricing_mode.
	•	Submit.
	•	Expect new row in table with correct values.
	3.	Refresh browser:
	•	Asset still present with same values.
	4.	Click "Edit" on asset:
	•	Change name and pricing_mode.
	•	Save and confirm changes reflected.
	5.	Attempt invalid input:
	•	Missing symbol → error shown, no asset created.
	•	Duplicate symbol → error shown or duplicate prevented.

Accounts:
	1.	Go to /accounts:
	•	Table shows "no accounts" state.
	2.	Add an account:
	•	Fill name, platform, account_type, chain_or_market, status ACTIVE.
	•	Save and see row.
	3.	Refresh; confirm persistence.
	4.	Edit account; change status to INACTIVE; confirm UI shows inactive state.
	5.	Validate required fields:
	•	Empty name → error, cannot save.

DB checks:
	•	Query DB directly (or via ORM console):
	•	SELECT * FROM asset returns created asset row.
	•	SELECT * FROM account returns created account row.

Phase 1 is complete when all tests pass and no 500 errors occur during normal operations.

⸻

Phase 2 – Ledger: Manual Transactions & List View

Objective: Ability to record transactions manually and view/filter them.

Scope:
	•	Expose a /ledger page under the authenticated shell that lists ledger_transactions rows with filters (by date range, account, asset, tx_type) and simple pagination.
	•	Manual transaction entry form on /ledger:
	•	Required: date/time, account, tx_type, and either a single asset+quantity (for DEPOSIT/WITHDRAWAL/YIELD/OTHER) or Asset In/Quantity In and Asset Out/Quantity Out (for TRADE/NFT_TRADE/OFFLINE_TRADE).
	•	Optional: notes, external_reference.
	•	On submit, create one or two ledger_transactions rows with signed quantities based on tx_type (positive for inflows, negative for outflows).
	•	Table columns: Date/Time, Account, Asset, Tx Type, signed Quantity, Notes, Actions (Edit/Delete).
	•	No base_price / base_value or fee fields are captured at this stage; any valuation logic happens later using cached prices.

	•	Remove the prior Phase 2 bullet that said "Compute base_value when base_price present." – that logic is no longer applicable with the signed-quantity-only ledger.

Deliverable: User can create transactions via UI and see them in list, filtered.

Phase 2 – Verification: Ledger manual entry and filters

	1.	Create at least one Asset and one Account via /assets and /accounts.
	2.	Visit /ledger.
	3.	Add a deposit:
		•	Date: set a specific date/time.
		•	Account: select an existing account.
		•	Asset: select an existing asset.
		•	Quantity: 10.
		•	tx_type: DEPOSIT.
		•	Submit.
	4.	Confirm the new row appears in the ledger table:
		•	Quantity shows as +10 (signed quantity).
		•	Account and asset names match the selections.
	5.	Add a withdrawal:
		•	tx_type: WITHDRAWAL.
		•	Same account and asset as above.
		•	Quantity: 5.
	6.	Confirm the ledger table shows a second row with:
		•	Quantity = -5 for that asset/account.
	7.	Add a trade:
		•	tx_type: TRADE.
		•	Asset In: BTC, Quantity In: 2.
		•	Asset Out: USDT, Quantity Out: 200000.
	8.	Confirm the ledger table shows two new rows for the same date/account:
		•	One row with +2 BTC.
		•	One row with -200000 USDT.
	9.	Use the filters:
		•	Filter by account and verify only rows for that account remain.
		•	Filter by asset (e.g., BTC) and verify only that asset’s rows remain.
		•	Filter by tx_type = TRADE and verify only TRADE rows are shown (no legacy TRADE_BUY / TRADE_SELL types).
	10.	Use the per-row Delete action to remove a row and verify it disappears from the table and is no longer returned by the ledger API.

Phase 2 is complete when all these behaviors work consistently.

⸻

Phase 3 – Holdings Calculation & Valuation (with Pricing Engine)

Objective: Compute holdings from ledger and value them using manual and auto prices; display holdings table.

Scope:
	•	Implement prices_latest table and /api/prices/refresh.
	•	Implement average‑cost holdings calculation (on demand or via positions table).
	•	Implement /holdings page:
	•	Table with quantity, average cost, total cost basis, current price, market value, PnL, PnL%.
	•	Filters for account and asset type.
	•	Implement "Refresh Prices Now" on Settings and wire it to /api/prices/refresh.
	•	Implement basic external price fetching for at least:
	•	Crypto by symbol or symbol+chain.
	•	Equities by ticker+market.
	•	If you want to avoid API key headaches, stub this in dev, but PRD assumes actual provider when deployed.
	•	Holdings UI should evolve from the existing Holdings section design in `app/page.tsx`, maintaining its table style and controls.

Deliverable: User can see holdings and valuations update when prices change.

Verification steps:

Setup:
	1.	Create assets:
	•	Asset A: BTC, type CRYPTO, pricing_mode AUTO.
	•	Asset B: USD, type CASH, pricing_mode MANUAL, manual_price 1.
	2.	Create an account, e.g., "Binance Main".
	3.	Create ledger transactions:
	•	BUY 1 BTC at 20,000.
	•	BUY 1 BTC at 30,000.
	•	DEPOSIT 10,000 USD (cash).
	•	These should give:
	•	BTC quantity = 2, total_cost_basis = 50,000, avg_cost = 25,000.
	•	USD quantity = 10,000, cost basis = 10,000.

Manual pricing:
	4.	Temporarily set manual_price for BTC:
	•	Set manual_price to 40,000 and pricing_mode = MANUAL.
	5.	Go to /holdings:
	•	Expect BTC:
	•	quantity = 2.
	•	total_cost_basis ≈ 50,000.
	•	average_cost ≈ 25,000.
	•	current_price = 40,000.
	•	market_value = 80,000.
	•	unrealized_pnl = 30,000.
	•	pnl_pct = 30,000 / 50,000 = 60%.
	•	Expect USD:
	•	quantity = 10,000.
	•	cost basis 10,000.
	•	current_price = 1.
	•	market_value = 10,000.
	•	pnl ~ 0.
	6.	Confirm filters:
	•	Filter by account shows correct subset.
	•	Filter by asset type shows crypto only or cash only.

Auto pricing:
	7.	Change BTC to pricing_mode = AUTO, clear manual_price.
	8.	Trigger "Refresh Prices Now" from /settings:
	•	Confirm API is called and prices_latest row for BTC updated.
	9.	Reload /holdings:
	•	BTC current_price should match fetched price.
	•	market_value and PnL recomputed accordingly.

Unpriced assets:
	10.	Create another asset C with pricing_mode = AUTO but intentionally use symbol that provider will not resolve.
	11.	Add a small position in C via ledger.
	12.	Run price refresh:
	•	On /holdings, asset C should show:
	•	Quantity present.
	•	Cost basis present.
	•	Current price/market value marked as "Unpriced" or blank with warning.
	13.	On Dashboard later, ensure unpriced assets are not silently counted.

Phase 3 is complete when holdings math is correct for simple test cases and prices refresh works end‑to‑end.

⸻

Phase 4 – Dashboard

Objective: Show a correct portfolio overview with allocations and activity, preserving the existing dashboard visual design.

Scope:
	•	Implement / dashboard:
	•	Total portfolio value (sum of market_value for priced holdings).
	•	Allocation by asset type (pie chart).
	•	Allocation by volatility bucket (pie chart).
	•	Top 10 holdings by market value (bar or table).
	•	Recent 10 transactions.
	•	"Prices stale" warning if appropriate.
	•	Reuse holdings and ledger APIs.
	•	Use the existing `DashboardView` layout and styling from `app/page.tsx` as the base; swap in live data and state without significantly altering the aesthetic.

Deliverable: Dashboard shows coherent, correct data for current state.

Verification steps:

Using data from Phase 3:
	1.	Ensure there are at least:
	•	2–3 asset types (e.g., CRYPTO, CASH, OFFLINE).
	•	2 volatility buckets (CASH_LIKE, VOLATILE).
	•	10+ transactions in ledger.

Total portfolio value:
	2.	Manually compute total:
	•	From /holdings, sum market_value for all priced assets.
	3.	Compare with dashboard’s "Total portfolio value":
	•	Values must match within rounding.

Allocation by asset type:
	4.	For each asset type:
	•	Sum market_value from holdings.
	•	Compute percent share of total.
	5.	Compare with dashboard pie segments (labels and percentages).

Allocation by volatility bucket:
	6.	Same as above but grouped by volatility_bucket.

Top holdings:
	7.	From holdings:
	•	Sort by market_value descending.
	•	Take top 10.
	8.	Compare with dashboard’s "Top holdings":
	•	Same ordering, same quantities and market values.

Recent transactions:
	9.	From /ledger:
	•	Sort by date_time desc.
	•	Take 10.
	10.	Compare with dashboard’s "Recent activity" table:
	•	Same 10 rows, same order and values.

Prices stale warning:
	11.	Manually update DB to set last_updated for some AUTO asset to a very old date (or wait beyond threshold).
	12.	Reload dashboard:
	•	"Prices stale" or similar warning visible.
	13.	Set timestamps back to fresh (or re‑refresh prices):
	•	Warning disappears.

Phase 4 is complete when all these checks pass.

⸻

Phase 5 – CSV Import

Objective: Import transactions from CSV with mapping, inline creation of accounts/assets, preview, and commit.

Scope:
	•	Implement /ledger/import UI:
	•	File upload, mapping UI, preview table, error highlighting, bulk ignore, commit.
	•	Backend:
	•	Parse CSV.
	•	Normalize rows based on mapping.
	•	Resolve / create accounts and assets if missing.
	•	Insert into ledger_transactions.

Deliverable: User can import a CSV ledger into the app and see the resulting transactions.

Verification steps:

Prepare a CSV file with, e.g., 5–10 rows including:
	•	Column headers: date,account,asset,quantity,tx_type,notes.
	•	At least:
	•	2 rows referencing existing accounts/assets.
	•	2 rows referencing new accounts/assets.
	•	Mixed tx_types (e.g., TRADE, DEPOSIT).

Flow:
	1.	Go to /ledger/import.
	2.	Upload CSV:
	•	File accepted; first rows previewed.
	3.	Column mapping:
	•	Map CSV columns to canonical fields:
	•	date → date, account → account name, asset → asset symbol, etc.
	•	If required mapping missing, UI should show validation.
	4.	Unknown entities:
	•	After mapping, app should list unknown accounts/assets.
	•	Use inline UI to create them:
	•	Fill minimal required fields.
	•	Confirm that after creation, mapping resolves with no unknowns.
	5.	Preview:
	•	Preview table shows normalized rows with parsed dates, quantities, tx_types.
	•	Rows with invalid data (if any) are flagged; user can mark them to ignore.
	6.	Commit:
	•	Click "Import"/"Commit".
	•	Success message with counts: created rows, skipped rows.
	7.	/ledger view:
	•	Filter by date/account/asset to confirm imported transactions present and correct.
	•	Spot-check quantities, tx_types, and account/asset mappings.

Negative tests:
	8.	Upload CSV with wrong delimiter or malformed row:
	•	App should show a clear error, not crash.
	9.	Try committing with no mapped date or asset:
	•	Import should be blocked with message.

Phase 5 is complete when imports work end-to-end on a realistic file.

⸻

Phase 6 – Settings, Exports, and Backup

Objective: Configure global settings and export data for backup.

Scope:
	•	/settings:
	•	Set and persist base currency and timezone.
	•	Toggle auto price refresh and interval.
	•	"Refresh Prices Now" button (already wired).
	•	Export buttons for Assets, Accounts, Ledger, and optional DB.
	•	All values stored in settings table and used by relevant features (e.g., timezone for date display, base currency in labels).

Deliverable: Settings persist and exports generate correct CSV files.

Verification steps:

Settings:
	1.	Change base currency from default (e.g., USD) to another code (e.g., EUR).
	2.	Save; reload /settings:
	•	Base currency field retains new value.
	3.	Check dashboard and holdings:
	•	Labels should show new base currency code (values may still be USD until pricing engine supports FX; that’s acceptable as long as you’re explicit in implementation).
	4.	Change timezone setting:
	•	After saving, dates on /ledger and /holdings should display in configured timezone (check offset vs raw stored UTC).

Price settings:
	5.	Set auto refresh ON and choose interval.
	6.	Confirm that:
	•	Settings persisted in DB.
	•	If you have a background job, ensure it triggers; if not, this may be a planned future feature – in MVP, at least the flag is saved and inspectable.

Exports:
	7.	Click "Export Assets":
	•	Browser downloads a CSV.
	•	Open CSV:
	•	Contains header row and all asset columns.
	•	Row count matches SELECT COUNT(*) FROM assets.
	8.	Same for Accounts and Ledger exports:
	•	Confirm all non-sensitive fields included.
	9.	If DB export implemented:
	•	Click export DB.
	•	File downloads and can be opened by SQLite client.

Phase 6 is complete when settings survive reload and exports are accurate.

⸻

8. Phase 7 – Migration Execution (Optional but Practical)

Objective: Move from existing Google Sheet to new app and verify parity.

This is more process than code, but still needs verification.

Verification steps:
	1.	Run through Migration Plan (Section 6).
	2.	After ledger import and price refresh/manual price alignment:
	•	Export holdings snapshot from old Sheet and new app.
	•	Compare per-asset quantities and total values.
	3.	Any discrepancies:
	•	Check for mis-mapped tx_types, missing transactions, or rounding differences.

When the totals reconcile within expected rounding differences and user can operate solely in the app, migration is effectively complete.

⸻

You now have a complete PRD plus a phased delivery plan where every phase has a concrete, human‑verifiable deliverable and explicit steps to check that the code is complete and works.
