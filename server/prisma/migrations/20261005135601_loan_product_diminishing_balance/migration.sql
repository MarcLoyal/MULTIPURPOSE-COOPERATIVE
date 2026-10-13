-- CreateEnum
CREATE TYPE "RatePeriod" AS ENUM ('monthly', 'annual');

-- CreateEnum
CREATE TYPE "LoanComputationMethod" AS ENUM ('diminishing_balance', 'flat');

-- CreateEnum
CREATE TYPE "AmortizationStyle" AS ENUM ('equal_payment', 'equal_principal');

-- AlterTable
ALTER TABLE "loan_accounts" ADD COLUMN     "computation_method" "LoanComputationMethod" NOT NULL DEFAULT 'diminishing_balance',
ADD COLUMN     "loan_product_id" TEXT;

-- Loans that already existed before this migration were actually computed
-- flat (loanSchedule.ts had no other method until now) — pin them to
-- 'flat' explicitly rather than letting the new column default silently
-- reinterpret their already-posted release/repayment ledger history under
-- a different method. Only loans created from here on get the new
-- diminishing-balance default.
UPDATE "loan_accounts" SET "computation_method" = 'flat';

-- CreateTable
CREATE TABLE "loan_products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "interest_rate" DECIMAL(7,4) NOT NULL,
    "rate_period" "RatePeriod" NOT NULL DEFAULT 'monthly',
    "computation_method" "LoanComputationMethod" NOT NULL DEFAULT 'diminishing_balance',
    "amortization_style" "AmortizationStyle" NOT NULL DEFAULT 'equal_payment',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "loan_products_name_key" ON "loan_products"("name");

-- Seed a default product so the table isn't empty on day one. Rate/term
-- are still entered per loan application today (the client has no product
-- picker yet — out of scope for Phase 0, see gap analysis item 2); this
-- row exists for future UI wiring and to document the default method.
INSERT INTO "loan_products" ("id", "name", "description", "interest_rate", "rate_period", "computation_method", "amortization_style", "is_active", "updated_at")
VALUES (gen_random_uuid(), 'Regular Loan', 'Default product seeded by migration pending board-approved product catalog (report Q21).', 0.0200, 'monthly', 'diminishing_balance', 'equal_payment', true, CURRENT_TIMESTAMP);

-- AddForeignKey
ALTER TABLE "loan_accounts" ADD CONSTRAINT "loan_accounts_loan_product_id_fkey" FOREIGN KEY ("loan_product_id") REFERENCES "loan_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
