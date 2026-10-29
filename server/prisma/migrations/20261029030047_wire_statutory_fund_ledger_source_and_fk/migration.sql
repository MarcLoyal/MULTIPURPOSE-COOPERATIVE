-- Wires up statutory fund allocation (dormant since Phase 0) for the
-- new fiscalYears.routes.ts module: ledger entries need to be able to
-- drill down to the StatutoryFundAllocation that created them, the same
-- way they already can for share-capital/loan/cash/deposit transactions.
--
-- Both changes are purely additive:
-- - A new enum value never removes or renames an existing one.
-- - A new nullable FK column defaults to NULL on every existing row and
--   is never read by code that predates this migration.
-- Safe to apply to production before this PR merges (expand/contract).

-- AlterEnum
ALTER TYPE "LedgerSourceType" ADD VALUE 'fiscal_year_close';

-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN     "statutory_fund_allocation_id" TEXT;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_statutory_fund_allocation_id_fkey" FOREIGN KEY ("statutory_fund_allocation_id") REFERENCES "statutory_fund_allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
