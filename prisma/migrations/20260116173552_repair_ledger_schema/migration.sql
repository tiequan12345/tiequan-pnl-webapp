-- Repair migration to fix the LedgerTransaction table schema
-- This recreates the table with proper column definitions
-- The columns already exist and contain data, we're just fixing the schema representation

PRAGMA foreign_keys=OFF;

-- Create new table with proper schema
CREATE TABLE "new_LedgerTransaction" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "date_time" DATETIME NOT NULL,
  "account_id" INTEGER NOT NULL,
  "asset_id" INTEGER NOT NULL,
  "quantity" DECIMAL NOT NULL,
  "tx_type" TEXT NOT NULL,
  "external_reference" TEXT,
  "notes" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  "fee_in_base" DECIMAL,
  "total_value_in_base" DECIMAL,
  "unit_price_in_base" DECIMAL,
  CONSTRAINT "new_LedgerTransaction_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "new_LedgerTransaction_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Copy all data from old table
INSERT INTO "new_LedgerTransaction" (
  "id",
  "date_time",
  "account_id",
  "asset_id",
  "quantity",
  "tx_type",
  "external_reference",
  "notes",
  "created_at",
  "updated_at",
  "fee_in_base",
  "total_value_in_base",
  "unit_price_in_base"
)
SELECT
  "id",
  "date_time",
  "account_id",
  "asset_id",
  "quantity",
  "tx_type",
  "external_reference",
  "notes",
  "created_at",
  "updated_at",
  "fee_in_base",
  "total_value_in_base",
  "unit_price_in_base"
FROM "LedgerTransaction";

-- Drop old table and rename new table
DROP TABLE "LedgerTransaction";
ALTER TABLE "new_LedgerTransaction" RENAME TO "LedgerTransaction";

-- Recreate indexes
CREATE INDEX "LedgerTransaction_date_time_idx" ON "LedgerTransaction"("date_time");
CREATE INDEX "LedgerTransaction_account_id_idx" ON "LedgerTransaction"("account_id");
CREATE INDEX "LedgerTransaction_asset_id_idx" ON "LedgerTransaction"("asset_id");
CREATE INDEX "LedgerTransaction_tx_type_idx" ON "LedgerTransaction"("tx_type");

PRAGMA foreign_keys=ON;
