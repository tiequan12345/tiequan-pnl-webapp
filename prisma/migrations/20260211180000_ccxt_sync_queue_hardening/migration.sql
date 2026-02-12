-- Add retry/progress fields to CCXT sync jobs
ALTER TABLE "CcxtSyncJob" ADD COLUMN "progress_json" TEXT;
ALTER TABLE "CcxtSyncJob" ADD COLUMN "heartbeat_at" DATETIME;
ALTER TABLE "CcxtSyncJob" ADD COLUMN "next_run_at" DATETIME;

-- Remove duplicate external references before enforcing uniqueness
DELETE FROM "LedgerTransaction"
WHERE "id" IN (
  SELECT newer."id"
  FROM "LedgerTransaction" AS newer
  JOIN "LedgerTransaction" AS older
    ON newer."account_id" = older."account_id"
   AND newer."external_reference" = older."external_reference"
   AND newer."id" > older."id"
  WHERE newer."external_reference" IS NOT NULL
);

DROP INDEX IF EXISTS "CcxtSyncJob_account_id_exchange_id_status_idx";
CREATE INDEX "CcxtSyncJob_status_next_run_at_created_at_idx"
  ON "CcxtSyncJob" ("status", "next_run_at", "created_at");
CREATE INDEX "CcxtSyncJob_account_id_exchange_id_mode_status_idx"
  ON "CcxtSyncJob" ("account_id", "exchange_id", "mode", "status");

DROP INDEX IF EXISTS "LedgerTransaction_account_id_external_reference_idx";
CREATE UNIQUE INDEX "LedgerTransaction_account_id_external_reference_key"
  ON "LedgerTransaction" ("account_id", "external_reference");
