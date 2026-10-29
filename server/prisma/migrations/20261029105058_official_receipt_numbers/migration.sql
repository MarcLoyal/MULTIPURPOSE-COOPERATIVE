-- Official receipts (printable), for the three transaction kinds where
-- a member actually pays the cooperative: loan repayments, deposits,
-- and share-capital subscriptions/additional purchases. Each gets a
-- nullable, per-table-unique official_receipt_number column, set at
-- the point the payment is recorded/approved. See
-- lib/officialReceipt.ts for the cross-table uniqueness check (OR
-- booklets are one shared numbered sequence in practice) and the new
-- GET .../receipt endpoints on loans/deposits/share-capital that
-- render the printable page.
--
-- Purely additive — three new nullable columns, no existing row's
-- behavior changes. Safe to apply to production before this PR merges
-- (expand/contract).

-- AlterTable
ALTER TABLE "deposit_transactions" ADD COLUMN     "official_receipt_number" TEXT;

-- AlterTable
ALTER TABLE "loan_transactions" ADD COLUMN     "official_receipt_number" TEXT;

-- AlterTable
ALTER TABLE "share_capital_transactions" ADD COLUMN     "official_receipt_number" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "deposit_transactions_official_receipt_number_key" ON "deposit_transactions"("official_receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "loan_transactions_official_receipt_number_key" ON "loan_transactions"("official_receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "share_capital_transactions_official_receipt_number_key" ON "share_capital_transactions"("official_receipt_number");
