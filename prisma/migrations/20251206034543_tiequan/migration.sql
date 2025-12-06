-- CreateTable
CREATE TABLE "Asset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "volatility_bucket" TEXT NOT NULL,
    "chain_or_market" TEXT NOT NULL,
    "pricing_mode" TEXT NOT NULL,
    "manual_price" DECIMAL,
    "metadata_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Account" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "account_type" TEXT NOT NULL,
    "chain_or_market" TEXT,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date_time" DATETIME NOT NULL,
    "account_id" INTEGER NOT NULL,
    "asset_id" INTEGER NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "direction" TEXT,
    "base_price" DECIMAL NOT NULL,
    "base_value" DECIMAL NOT NULL,
    "tx_type" TEXT NOT NULL,
    "fee_asset_id" INTEGER,
    "fee_quantity" DECIMAL,
    "external_reference" TEXT,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "LedgerTransaction_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LedgerTransaction_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LedgerTransaction_fee_asset_id_fkey" FOREIGN KEY ("fee_asset_id") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriceLatest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "asset_id" INTEGER NOT NULL,
    "price_in_base" DECIMAL NOT NULL,
    "source" TEXT NOT NULL,
    "last_updated" DATETIME NOT NULL,
    CONSTRAINT "PriceLatest_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Asset_symbol_idx" ON "Asset"("symbol");

-- CreateIndex
CREATE INDEX "Account_name_idx" ON "Account"("name");

-- CreateIndex
CREATE INDEX "LedgerTransaction_date_time_idx" ON "LedgerTransaction"("date_time");

-- CreateIndex
CREATE INDEX "LedgerTransaction_account_id_idx" ON "LedgerTransaction"("account_id");

-- CreateIndex
CREATE INDEX "LedgerTransaction_asset_id_idx" ON "LedgerTransaction"("asset_id");

-- CreateIndex
CREATE INDEX "LedgerTransaction_tx_type_idx" ON "LedgerTransaction"("tx_type");

-- CreateIndex
CREATE UNIQUE INDEX "PriceLatest_asset_id_key" ON "PriceLatest"("asset_id");
