-- CreateTable
CREATE TABLE "TradeStationConnection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "account_id" INTEGER NOT NULL,
    "ts_account_id" TEXT,
    "access_token" TEXT,
    "refresh_token" TEXT NOT NULL,
    "token_expires_at" DATETIME,
    "scopes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "last_sync_at" DATETIME,
    "last_order_sync_at" DATETIME,
    "last_order_next_token" TEXT,
    "metadata_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "TradeStationConnection_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TradeStationConnection_account_id_key" ON "TradeStationConnection"("account_id");

-- CreateIndex
CREATE INDEX "TradeStationConnection_ts_account_id_idx" ON "TradeStationConnection"("ts_account_id");
