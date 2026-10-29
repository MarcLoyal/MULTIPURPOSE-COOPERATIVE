-- Loanable-amount placeholder rule (report gap-analysis follow-up): a
-- member's loan limit is a multiple of their share capital balance
-- minus what they currently owe on active/past-due loans. See
-- loanLimit.ts and GET /api/loans/loan-limit/:memberId. Clearly marked
-- as unconfirmed in the UI until the cooperative's board sets a real
-- policy — the default multiplier below is a placeholder, not a rate
-- anyone approved.
--
-- Purely additive — one new table, no existing column, table, or row
-- is touched. Safe to apply to production before this PR merges
-- (expand/contract).

-- CreateTable
CREATE TABLE "loan_limit_settings" (
    "id" TEXT NOT NULL,
    "share_capital_multiplier" DECIMAL(6,2) NOT NULL DEFAULT 3,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "loan_limit_settings_pkey" PRIMARY KEY ("id")
);

-- Seed the single settings row at a 3x placeholder multiplier.
INSERT INTO "loan_limit_settings" ("id", "share_capital_multiplier", "updated_at")
VALUES (gen_random_uuid(), 3, CURRENT_TIMESTAMP);
