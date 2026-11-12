-- IWMPC Phase 1 Step 1 (member profile) — three independent, purely
-- additive changes:
--   1. Personal-info fields on members (all nullable) + a new
--      member_beneficiaries table for multiple beneficiaries, kept
--      alongside (not replacing) the existing flat
--      beneficiary_name/beneficiary_relationship columns.
--   2. module_settings: the per-deployment module on/off switch (see
--      ModuleSetting's doc comment in schema.prisma). Seeded here with
--      every current module at enabled=true, so an existing deployment
--      sees zero behavior change.

-- CreateEnum
CREATE TYPE "CivilStatus" AS ENUM ('single', 'married', 'widowed', 'separated');

-- AlterTable
ALTER TABLE "members" ADD COLUMN     "birth_date" TIMESTAMP(3),
ADD COLUMN     "civil_status" "CivilStatus",
ADD COLUMN     "id_number" TEXT,
ADD COLUMN     "id_type" TEXT,
ADD COLUMN     "photo_url" TEXT;

-- CreateTable
CREATE TABLE "member_beneficiaries" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_beneficiaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_settings" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "module_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "member_beneficiaries_member_id_idx" ON "member_beneficiaries"("member_id");

-- AddForeignKey
ALTER TABLE "member_beneficiaries" ADD CONSTRAINT "member_beneficiaries_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed every current toggleable module, all enabled — existing
-- deployments keep seeing everything, exactly as today. Dashboard,
-- Members, Cash, and Loans are deliberately NOT rows here: they're
-- always on, never gated. Share Capital and Deposits ARE rows here
-- (so their standalone page/nav can be hidden), but — unlike the
-- other rows — their own transaction-recording/approve endpoints are
-- never blocked by requireModule, since the member profile's "Receive
-- Payment" action depends on them regardless of this flag.
INSERT INTO "module_settings" ("key", "label", "enabled", "updated_at") VALUES
  ('shareCapital', 'Share Capital', true, CURRENT_TIMESTAMP),
  ('deposits', 'Deposits', true, CURRENT_TIMESTAMP),
  ('generalLedger', 'General Ledger', true, CURRENT_TIMESTAMP),
  ('trialBalance', 'Trial Balance', true, CURRENT_TIMESTAMP),
  ('incomeStatement', 'Income Statement', true, CURRENT_TIMESTAMP),
  ('balanceSheet', 'Statement of Financial Condition', true, CURRENT_TIMESTAMP),
  ('cashFlowStatement', 'Statement of Cash Flows', true, CURRENT_TIMESTAMP),
  ('fiscalYears', 'Fiscal Years', true, CURRENT_TIMESTAMP),
  ('allowanceReport', 'Allowance for Losses', true, CURRENT_TIMESTAMP),
  ('cdaDataPack', 'CDA Report Data Pack', true, CURRENT_TIMESTAMP),
  ('advanced', 'Advanced (Settings, Staff Users, Opening Balances Import, Audit Log)', true, CURRENT_TIMESTAMP);
