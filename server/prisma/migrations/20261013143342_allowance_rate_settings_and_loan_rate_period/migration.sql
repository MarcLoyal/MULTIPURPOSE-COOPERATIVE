-- AlterTable
ALTER TABLE "loan_accounts" ADD COLUMN     "rate_period" "RatePeriod" NOT NULL DEFAULT 'monthly';

-- CreateTable
-- rate_percent bound 0-100 enforced at the DB level, same pattern as
-- statutory_fund_allocations — a percentage can never be silently
-- invalid even if application code has a bug.
CREATE TABLE "allowance_rate_settings" (
    "id" TEXT NOT NULL,
    "bucket_label" TEXT NOT NULL,
    "min_days_past_due" INTEGER NOT NULL,
    "max_days_past_due" INTEGER,
    "rate_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "allowance_rate_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "allowance_rate_settings_rate_percent_bound" CHECK ("rate_percent" >= 0 AND "rate_percent" <= 100)
);

-- CreateIndex
CREATE UNIQUE INDEX "allowance_rate_settings_bucket_label_key" ON "allowance_rate_settings"("bucket_label");

-- Seed the six Portfolio-at-Risk buckets with rate_percent = 0 — an
-- inert default (posting at 0% is a no-op, see allowance.ts) until the
-- cooperative's auditor confirms real numbers. The bucket boundaries
-- (30/90/180/365 days) mirror the only numeric schedule the research
-- report found (MC 2020-18, a COVID relief circular, not a confirmed
-- general rule) — treat the boundaries themselves as provisional too.
INSERT INTO "allowance_rate_settings" ("id", "bucket_label", "min_days_past_due", "max_days_past_due", "rate_percent", "sort_order", "updated_at") VALUES
(gen_random_uuid(), 'Current', 0, 0, 0, 0, CURRENT_TIMESTAMP),
(gen_random_uuid(), '1-30 days past due', 1, 30, 0, 1, CURRENT_TIMESTAMP),
(gen_random_uuid(), '31-90 days past due', 31, 90, 0, 2, CURRENT_TIMESTAMP),
(gen_random_uuid(), '91-180 days past due', 91, 180, 0, 3, CURRENT_TIMESTAMP),
(gen_random_uuid(), '181-365 days past due', 181, 365, 0, 4, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'Over 365 days past due', 366, NULL, 0, 5, CURRENT_TIMESTAMP);
