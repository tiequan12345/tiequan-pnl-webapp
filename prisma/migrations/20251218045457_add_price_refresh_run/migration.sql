-- CreateTable
CREATE TABLE "PriceRefreshRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" DATETIME,
    "status" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "metadata" TEXT
);

-- CreateIndex
CREATE INDEX "PriceRefreshRun_started_at_idx" ON "PriceRefreshRun"("started_at");

-- CreateIndex
CREATE INDEX "PriceRefreshRun_status_idx" ON "PriceRefreshRun"("status");
