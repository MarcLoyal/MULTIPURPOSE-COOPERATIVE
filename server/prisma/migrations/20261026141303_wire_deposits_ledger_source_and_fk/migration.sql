-- Wires up deposits (dormant since Phase 0) for the new
-- deposits.routes.ts module: ledger entries need to be able to drill
-- down to a DepositTransaction the same way they already can for
-- share-capital, loan, and cash transactions.
--
-- Both changes are purely additive:
-- - A new enum value never removes or renames an existing one.
-- - A new nullable FK column defaults to NULL on every existing row and
--   is never read by code that predates this migration.
-- Safe to apply to production before this PR merges (expand/contract).

-- AlterEnum
ALTER TYPE "LedgerSourceType" ADD VALUE 'deposit';

-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN     "deposit_transaction_id" TEXT;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_deposit_transaction_id_fkey" FOREIGN KEY ("deposit_transaction_id") REFERENCES "deposit_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
