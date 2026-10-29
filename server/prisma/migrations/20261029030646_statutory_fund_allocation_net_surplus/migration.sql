-- Persists the net surplus figure at fiscal-year-close time on
-- StatutoryFundAllocation, so a closed fiscal year's page can show what
-- the surplus actually WAS — a live income-statement query for a closed
-- period always nets to zero (the closing entries zero out that
-- period's revenue/expense accounts by design), so there is no way to
-- re-derive this after the fact without storing it.
--
-- NOT NULL with no default — safe because statutory_fund_allocations
-- has never had any rows in production (this whole feature is new in
-- this PR); nothing existing needs a backfill.

-- AlterTable
ALTER TABLE "statutory_fund_allocations" ADD COLUMN     "net_surplus" DECIMAL(18,2) NOT NULL;
