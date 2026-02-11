-- CreateTable
CREATE TABLE "CcxtConnection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "account_id" INTEGER NOT NULL,
    "exchange_id" TEXT NOT NULL,
    "api_key_enc" TEXT NOT NULL,
    "api_secret_enc" TEXT NOT NULL,
    "passphrase_enc" TEXT,
    "options_json" TEXT,
    "sandbox" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "last_sync_at" DATETIME,
    "last_trade_sync_at" DATETIME,
    "last_trade_cursor" TEXT,
    "metadata_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "CcxtConnection_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CcxtConnection_account_id_key" ON "CcxtConnection"("account_id");

-- CreateIndex
CREATE INDEX "CcxtConnection_exchange_id_idx" ON "CcxtConnection"("exchange_id");

-- CreateIndex
CREATE INDEX "CcxtConnection_status_idx" ON "CcxtConnection"("status");
