-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('cashier', 'credit_officer', 'manager', 'accountant', 'admin');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('active', 'inactive', 'resigned', 'deceased', 'terminated');

-- CreateEnum
CREATE TYPE "ShareCapitalTxnType" AS ENUM ('subscription', 'additional_purchase', 'withdrawal', 'transfer', 'dividend');

-- CreateEnum
CREATE TYPE "ShareCapitalTxnStatus" AS ENUM ('pending', 'approved', 'rejected', 'posted');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('applied', 'under_review', 'approved', 'released', 'active', 'past_due', 'restructured', 'closed', 'rejected');

-- CreateEnum
CREATE TYPE "LoanTxnType" AS ENUM ('release', 'repayment', 'penalty', 'restructure');

-- CreateEnum
CREATE TYPE "CashTxnType" AS ENUM ('collection', 'disbursement', 'petty_cash', 'cash_advance', 'bank_deposit');

-- CreateEnum
CREATE TYPE "LedgerSourceType" AS ENUM ('share_capital', 'loan', 'cash', 'manual');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('create', 'update', 'approve', 'reject', 'delete_attempt');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "member_number" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "date_joined" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "MemberStatus" NOT NULL DEFAULT 'active',
    "beneficiary_name" TEXT,
    "beneficiary_relationship" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_capital_accounts" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "share_capital_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_capital_transactions" (
    "id" TEXT NOT NULL,
    "share_capital_account_id" TEXT NOT NULL,
    "type" "ShareCapitalTxnType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "ShareCapitalTxnStatus" NOT NULL DEFAULT 'pending',
    "created_by" TEXT NOT NULL,
    "approved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),

    CONSTRAINT "share_capital_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_accounts" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "loan_product" TEXT NOT NULL,
    "principal_amount" DECIMAL(18,2) NOT NULL,
    "interest_rate" DECIMAL(7,4) NOT NULL,
    "term_months" INTEGER NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'applied',
    "review_notes" TEXT,
    "release_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_transactions" (
    "id" TEXT NOT NULL,
    "loan_account_id" TEXT NOT NULL,
    "type" "LoanTxnType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "balance_after" DECIMAL(18,2) NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_transactions" (
    "id" TEXT NOT NULL,
    "type" "CashTxnType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reference_type" TEXT,
    "loan_transaction_id" TEXT,
    "share_capital_transaction_id" TEXT,
    "official_receipt_number" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "entry_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "account_code" TEXT NOT NULL,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "source_type" "LedgerSourceType" NOT NULL,
    "share_capital_transaction_id" TEXT,
    "loan_transaction_id" TEXT,
    "cash_transaction_id" TEXT,
    "batch_id" TEXT NOT NULL,
    "memo" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "previous_value" JSONB,
    "new_value" JSONB,
    "performed_by" TEXT NOT NULL,
    "performed_by_name" TEXT NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "members_member_number_key" ON "members"("member_number");

-- CreateIndex
CREATE UNIQUE INDEX "share_capital_accounts_member_id_key" ON "share_capital_accounts"("member_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_capital_accounts" ADD CONSTRAINT "share_capital_accounts_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_capital_transactions" ADD CONSTRAINT "share_capital_transactions_share_capital_account_id_fkey" FOREIGN KEY ("share_capital_account_id") REFERENCES "share_capital_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_accounts" ADD CONSTRAINT "loan_accounts_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_transactions" ADD CONSTRAINT "loan_transactions_loan_account_id_fkey" FOREIGN KEY ("loan_account_id") REFERENCES "loan_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_loan_transaction_id_fkey" FOREIGN KEY ("loan_transaction_id") REFERENCES "loan_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_share_capital_transaction_id_fkey" FOREIGN KEY ("share_capital_transaction_id") REFERENCES "share_capital_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_loan_transaction_id_fkey" FOREIGN KEY ("loan_transaction_id") REFERENCES "loan_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_cash_transaction_id_fkey" FOREIGN KEY ("cash_transaction_id") REFERENCES "cash_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
