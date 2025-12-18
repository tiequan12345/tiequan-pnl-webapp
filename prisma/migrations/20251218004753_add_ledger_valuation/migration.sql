-- AlterTable
ALTER TABLE "LedgerTransaction" ADD COLUMN "fee_in_base" DECIMAL;
ALTER TABLE "LedgerTransaction" ADD COLUMN "total_value_in_base" DECIMAL;
ALTER TABLE "LedgerTransaction" ADD COLUMN "unit_price_in_base" DECIMAL;
