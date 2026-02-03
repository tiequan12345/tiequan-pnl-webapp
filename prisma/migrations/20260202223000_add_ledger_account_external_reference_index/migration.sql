-- Index for idempotent imports (per account)
CREATE INDEX "LedgerTransaction_account_id_external_reference_idx" ON "LedgerTransaction"("account_id", "external_reference");
