-- Disbursement vouchers for money going OUT (loan releases, share
-- capital withdrawals, deposit withdrawals) — the outflow counterpart
-- to receipts, built the same audit-safe way: a gap-free sequence
-- number (disbursement_voucher_sequence_counter, incremented inside
-- the same transaction as the insert), no delete route anywhere, void
-- instead of delete. See DisbursementVoucher's doc comment in
-- schema.prisma.

-- CreateEnum
CREATE TYPE "DisbursementVoucherSourceType" AS ENUM ('loan_release', 'deposit_withdrawal', 'share_capital_withdrawal');

-- CreateEnum
CREATE TYPE "DisbursementVoucherStatus" AS ENUM ('active', 'void');

-- CreateTable
CREATE TABLE "disbursement_vouchers" (
    "id" TEXT NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "source_type" "DisbursementVoucherSourceType" NOT NULL,
    "loan_transaction_id" TEXT,
    "deposit_transaction_id" TEXT,
    "share_capital_transaction_id" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "member_id" TEXT NOT NULL,
    "status" "DisbursementVoucherStatus" NOT NULL DEFAULT 'active',
    "void_reason" TEXT,
    "voided_by" TEXT,
    "voided_at" TIMESTAMP(3),
    "print_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disbursement_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disbursement_voucher_sequence_counter" (
    "id" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "disbursement_voucher_sequence_counter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "disbursement_vouchers_sequence_number_key" ON "disbursement_vouchers"("sequence_number");

-- CreateIndex
CREATE UNIQUE INDEX "disbursement_vouchers_loan_transaction_id_key" ON "disbursement_vouchers"("loan_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "disbursement_vouchers_deposit_transaction_id_key" ON "disbursement_vouchers"("deposit_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "disbursement_vouchers_share_capital_transaction_id_key" ON "disbursement_vouchers"("share_capital_transaction_id");

-- AddForeignKey
ALTER TABLE "disbursement_vouchers" ADD CONSTRAINT "disbursement_vouchers_loan_transaction_id_fkey" FOREIGN KEY ("loan_transaction_id") REFERENCES "loan_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursement_vouchers" ADD CONSTRAINT "disbursement_vouchers_deposit_transaction_id_fkey" FOREIGN KEY ("deposit_transaction_id") REFERENCES "deposit_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursement_vouchers" ADD CONSTRAINT "disbursement_vouchers_share_capital_transaction_id_fkey" FOREIGN KEY ("share_capital_transaction_id") REFERENCES "share_capital_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursement_vouchers" ADD CONSTRAINT "disbursement_vouchers_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed the single counter row the same way receipt_sequence_counter's
-- own migration did, so issueVoucher() always finds exactly one row.
INSERT INTO "disbursement_voucher_sequence_counter" ("id", "last_number") VALUES (gen_random_uuid(), 0);
