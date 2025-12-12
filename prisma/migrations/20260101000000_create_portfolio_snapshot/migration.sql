-- Create tables for portfolio snapshot history
PRAGMA foreign_keys=OFF;

CREATE TABLE "PortfolioSnapshot" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "snapshot_at" DATETIME NOT NULL,
  "base_currency" TEXT NOT NULL DEFAULT 'USD',
  "total_value" DECIMAL NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "PortfolioSnapshot_snapshot_at_key" ON "PortfolioSnapshot"("snapshot_at");
CREATE INDEX "PortfolioSnapshot_snapshot_at_idx" ON "PortfolioSnapshot"("snapshot_at");

CREATE TABLE "PortfolioSnapshotComponent" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "snapshot_id" INTEGER NOT NULL,
  "asset_id" INTEGER NOT NULL,
  "asset_symbol" TEXT NOT NULL,
  "asset_name" TEXT NOT NULL,
  "asset_type" TEXT NOT NULL,
  "volatility_bucket" TEXT NOT NULL,
  "account_id" INTEGER NOT NULL,
  "account_name" TEXT NOT NULL,
  "quantity" DECIMAL NOT NULL,
  "price_in_base" DECIMAL,
  "market_value" DECIMAL,
  CONSTRAINT "PortfolioSnapshotComponent_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "PortfolioSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PortfolioSnapshotComponent_snapshot_id_idx" ON "PortfolioSnapshotComponent"("snapshot_id");
CREATE INDEX "PortfolioSnapshotComponent_snapshot_id_asset_type_idx" ON "PortfolioSnapshotComponent"("snapshot_id", "asset_type");
CREATE INDEX "PortfolioSnapshotComponent_snapshot_id_volatility_bucket_idx" ON "PortfolioSnapshotComponent"("snapshot_id", "volatility_bucket");
CREATE INDEX "PortfolioSnapshotComponent_snapshot_id_account_id_idx" ON "PortfolioSnapshotComponent"("snapshot_id", "account_id");

PRAGMA foreign_keys=ON;
