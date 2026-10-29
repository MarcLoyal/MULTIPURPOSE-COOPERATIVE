-- Printable receipts (report gap-analysis item): official receipts for
-- loan repayments, deposits, and share capital subscriptions/additional
-- purchases. See the Receipt model's doc comment in schema.prisma for
-- the audit-safety design (atomic no-gap sequence counter, void instead
-- of delete, reprint detection via print_count).
--
-- Replaces the earlier free-text official_receipt_number columns this
-- PR's first draft added directly to loan_transactions/
-- deposit_transactions/share_capital_transactions — those were never
-- applied to production (this PR hasn't merged), so there's nothing to
-- migrate away from; this is the only migration that ever ships.
--
-- Purely additive — three new tables, no existing table, column, or
-- row is touched. Safe to apply to production before this PR merges
-- (expand/contract).

-- CreateEnum
CREATE TYPE "ReceiptSourceType" AS ENUM ('loan_repayment', 'deposit', 'share_capital');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('active', 'void');

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "document_label" TEXT NOT NULL,
    "source_type" "ReceiptSourceType" NOT NULL,
    "loan_transaction_id" TEXT,
    "deposit_transaction_id" TEXT,
    "share_capital_transaction_id" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "member_id" TEXT NOT NULL,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'active',
    "void_reason" TEXT,
    "voided_by" TEXT,
    "voided_at" TIMESTAMP(3),
    "print_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_sequence_counter" (
    "id" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "receipt_sequence_counter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_settings" (
    "id" TEXT NOT NULL,
    "document_label" TEXT NOT NULL DEFAULT 'Acknowledgment Receipt',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "receipt_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receipts_sequence_number_key" ON "receipts"("sequence_number");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_loan_transaction_id_key" ON "receipts"("loan_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_deposit_transaction_id_key" ON "receipts"("deposit_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_share_capital_transaction_id_key" ON "receipts"("share_capital_transaction_id");

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_loan_transaction_id_fkey" FOREIGN KEY ("loan_transaction_id") REFERENCES "loan_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_deposit_transaction_id_fkey" FOREIGN KEY ("deposit_transaction_id") REFERENCES "deposit_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_share_capital_transaction_id_fkey" FOREIGN KEY ("share_capital_transaction_id") REFERENCES "share_capital_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed the single counter row (starts at 0 — the first issued receipt
-- becomes sequence_number 1) and the single settings row (default
-- label "Acknowledgment Receipt", not "Official Receipt" — see
-- ReceiptSetting's schema comment).
INSERT INTO "receipt_sequence_counter" ("id", "last_number") VALUES (gen_random_uuid(), 0);
INSERT INTO "receipt_settings" ("id", "document_label", "updated_at") VALUES (gen_random_uuid(), 'Acknowledgment Receipt', CURRENT_TIMESTAMP);
