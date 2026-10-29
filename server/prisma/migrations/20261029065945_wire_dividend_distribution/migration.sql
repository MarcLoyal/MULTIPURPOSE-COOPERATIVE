-- Dividend / patronage refund distribution (report gap-analysis item 4,
-- other half of statutory fund allocation): a settings-driven split of
-- a closed fiscal year's unallocated remainder between interest on
-- share capital and patronage refund, both credited to members' share
-- capital accounts. See fiscalYears.routes.ts's distribute handler.
--
-- All changes here are purely additive — two new tables, a new enum
-- value, and a new nullable FK column — no existing column, table, or
-- row is touched. Safe to apply to production before this PR merges
-- (expand/contract).

-- AlterEnum
ALTER TYPE "LedgerSourceType" ADD VALUE 'dividend_distribution';

-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN     "dividend_distribution_id" TEXT;

-- CreateTable
CREATE TABLE "dividend_distribution_settings" (
    "id" TEXT NOT NULL,
    "share_capital_interest_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "patronage_refund_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "dividend_distribution_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dividend_distributions" (
    "id" TEXT NOT NULL,
    "fiscal_year_id" TEXT NOT NULL,
    "share_capital_interest_percent" DECIMAL(5,2) NOT NULL,
    "patronage_refund_percent" DECIMAL(5,2) NOT NULL,
    "share_capital_interest_amount" DECIMAL(18,2) NOT NULL,
    "patronage_refund_amount" DECIMAL(18,2) NOT NULL,
    "member_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dividend_distributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dividend_distributions_fiscal_year_id_key" ON "dividend_distributions"("fiscal_year_id");

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_dividend_distribution_id_fkey" FOREIGN KEY ("dividend_distribution_id") REFERENCES "dividend_distributions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dividend_distributions" ADD CONSTRAINT "dividend_distributions_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed the single settings row at 0%/0%, same convention as
-- allowance_rate_settings: inert until the board sets real percentages.
INSERT INTO "dividend_distribution_settings" ("id", "share_capital_interest_percent", "patronage_refund_percent", "updated_at")
VALUES (gen_random_uuid(), 0, 0, CURRENT_TIMESTAMP);
