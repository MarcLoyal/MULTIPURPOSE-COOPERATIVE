-- CreateEnum
CREATE TYPE "MembershipClass" AS ENUM ('regular', 'associate');

-- CreateEnum
CREATE TYPE "DepositType" AS ENUM ('savings', 'time');

-- CreateEnum
CREATE TYPE "DepositComputationBasis" AS ENUM ('daily_balance', 'average_daily_balance', 'lowest_monthly_balance', 'month_end_balance');

-- CreateEnum
CREATE TYPE "DepositAccountStatus" AS ENUM ('active', 'closed');

-- CreateEnum
CREATE TYPE "DepositTxnType" AS ENUM ('deposit', 'withdrawal', 'interest_credit', 'pretermination_penalty');

-- CreateEnum
CREATE TYPE "FiscalYearStatus" AS ENUM ('open', 'closed');

-- AlterTable
ALTER TABLE "members" ADD COLUMN     "membership_class" "MembershipClass" NOT NULL DEFAULT 'regular';

-- CreateTable
CREATE TABLE "deposit_products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DepositType" NOT NULL,
    "interest_rate" DECIMAL(7,4) NOT NULL,
    "computation_basis" "DepositComputationBasis" NOT NULL DEFAULT 'month_end_balance',
    "crediting_frequency_months" INTEGER NOT NULL DEFAULT 1,
    "minimum_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "term_months" INTEGER,
    "pre_termination_penalty_rate" DECIMAL(7,4),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposit_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_accounts" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "deposit_product_id" TEXT NOT NULL,
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "DepositAccountStatus" NOT NULL DEFAULT 'active',
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposit_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_transactions" (
    "id" TEXT NOT NULL,
    "deposit_account_id" TEXT NOT NULL,
    "type" "DepositTxnType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "balance_after" DECIMAL(18,2) NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_years" (
    "id" TEXT NOT NULL,
    "year_end_date" TIMESTAMP(3) NOT NULL,
    "status" "FiscalYearStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- RA 9520 Art. 86 bounds enforced as CHECK constraints — the actual
-- percentages stay bylaws-set (no row can be inserted at all until
-- Phase 5 builds the allocation engine, since nothing posts to this
-- table yet), but the legal floors/ceilings can't be silently violated
-- even by a future bug. The first-five-years >=50% reserve floor is
-- conditional on registration date and isn't expressible as a static
-- CHECK; left for Phase 5's allocation engine to enforce.
CREATE TABLE "statutory_fund_allocations" (
    "id" TEXT NOT NULL,
    "fiscal_year_id" TEXT NOT NULL,
    "reserve_fund_percent" DECIMAL(5,2) NOT NULL,
    "cetf_percent" DECIMAL(5,2) NOT NULL,
    "community_dev_fund_percent" DECIMAL(5,2) NOT NULL,
    "optional_fund_percent" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "statutory_fund_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "statutory_fund_allocations_reserve_fund_floor" CHECK ("reserve_fund_percent" >= 10),
    CONSTRAINT "statutory_fund_allocations_cetf_ceiling" CHECK ("cetf_percent" >= 0 AND "cetf_percent" <= 10),
    CONSTRAINT "statutory_fund_allocations_community_dev_floor" CHECK ("community_dev_fund_percent" >= 3),
    CONSTRAINT "statutory_fund_allocations_optional_ceiling" CHECK ("optional_fund_percent" >= 0 AND "optional_fund_percent" <= 7)
);

-- CreateIndex
CREATE UNIQUE INDEX "deposit_products_name_key" ON "deposit_products"("name");

-- CreateIndex
CREATE UNIQUE INDEX "statutory_fund_allocations_fiscal_year_id_key" ON "statutory_fund_allocations"("fiscal_year_id");

-- AddForeignKey
ALTER TABLE "deposit_accounts" ADD CONSTRAINT "deposit_accounts_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_accounts" ADD CONSTRAINT "deposit_accounts_deposit_product_id_fkey" FOREIGN KEY ("deposit_product_id") REFERENCES "deposit_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_deposit_account_id_fkey" FOREIGN KEY ("deposit_account_id") REFERENCES "deposit_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statutory_fund_allocations" ADD CONSTRAINT "statutory_fund_allocations_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
