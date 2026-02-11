-- CreateTable
CREATE TABLE "CcxtSyncJob" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "account_id" INTEGER NOT NULL,
    "exchange_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "since" DATETIME,
    "requested_by" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claim_token" TEXT,
    "result_json" TEXT,
    "error_message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "started_at" DATETIME,
    "finished_at" DATETIME,
    CONSTRAINT "CcxtSyncJob_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CcxtSyncJob_status_created_at_idx" ON "CcxtSyncJob"("status", "created_at");

-- CreateIndex
CREATE INDEX "CcxtSyncJob_account_id_exchange_id_status_idx" ON "CcxtSyncJob"("account_id", "exchange_id", "status");

-- CreateIndex
CREATE INDEX "CcxtSyncJob_created_at_idx" ON "CcxtSyncJob"("created_at");
