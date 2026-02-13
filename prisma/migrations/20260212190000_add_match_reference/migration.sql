-- Add match_reference column to LedgerTransaction
ALTER TABLE "LedgerTransaction" ADD COLUMN "match_reference" TEXT;

-- Create index on match_reference for efficient lookups
CREATE INDEX IF NOT EXISTS "LedgerTransaction_match_reference_idx" ON "LedgerTransaction"("match_reference");
