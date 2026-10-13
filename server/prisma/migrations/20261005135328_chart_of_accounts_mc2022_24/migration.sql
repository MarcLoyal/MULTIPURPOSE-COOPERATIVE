-- Replaces the prototype's invented 4-digit chart of accounts with
-- CDA MC 2022-24 "Revised Standard Chart of Accounts for Cooperatives".
-- See docs/research/Philippine_cooperative_system_rules.md for sourcing;
-- row-level provenance is on each account's review_note where relevant.

-- CreateEnum
CREATE TYPE "AccountElement" AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');

-- CreateEnum
CREATE TYPE "NormalBalance" AS ENUM ('debit', 'credit');

-- CreateTable
CREATE TABLE "accounts" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "element" "AccountElement" NOT NULL,
    "normal_balance" "NormalBalance" NOT NULL,
    "is_contra" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("code")
);

-- Seed: verified MC 2022-24 codes (asset/liability/equity ranges relevant to
-- a savings-and-credit module), plus two codes this app had to invent
-- because the report's curated table has no generic other-income/expense
-- line item — those two are loudly flagged via needs_review/review_note,
-- not presented as confirmed circular codes.
INSERT INTO "accounts" ("code","label","element","normal_balance","is_contra","is_active","needs_review","review_note","updated_at") VALUES
('11110','Cash on Hand','asset','debit',false,true,false,NULL,CURRENT_TIMESTAMP),
('11130','Cash in Bank','asset','debit',false,true,false,NULL,CURRENT_TIMESTAMP),
('11150','Petty Cash Fund','asset','debit',false,true,false,NULL,CURRENT_TIMESTAMP),
('11160','Revolving Fund','asset','debit',false,true,false,NULL,CURRENT_TIMESTAMP),
('11190','E-wallet Fund','asset','debit',false,true,false,NULL,CURRENT_TIMESTAMP),
('11210','Loans Receivable - Current','asset','debit',false,true,false,NULL,CURRENT_TIMESTAMP),
('11220','Loans Receivable - Past Due','asset','debit',false,true,false,NULL,CURRENT_TIMESTAMP),
('11230','Loans Receivable Restructured','asset','debit',false,true,false,NULL,CURRENT_TIMESTAMP),
('11240','Loans Receivable - Loans in Litigation','asset','debit',false,true,false,NULL,CURRENT_TIMESTAMP),
('11241','Unearned Interests and Discounts','asset','credit',true,true,false,NULL,CURRENT_TIMESTAMP),
('11242','Allowance for Probable Losses - Loans','asset','credit',true,true,false,NULL,CURRENT_TIMESTAMP),
('11360','Advances to Officers, Employees and Members','asset','debit',false,true,false,NULL,CURRENT_TIMESTAMP),
('11370','Due from Accountable Officers, Employees and Members','asset','debit',false,true,false,NULL,CURRENT_TIMESTAMP),
('12160','Assets Acquired in Settlement of Loans/Accounts','asset','debit',false,true,false,NULL,CURRENT_TIMESTAMP),
('18100','Computerization Cost','asset','debit',false,true,true,'Report flags this code''s heading placement as inconsistent in the extracted MC 2022-24 PDF (printed under a "10000-17000" heading despite being an 18xxx code). Confirm classification against the primary PDF or the auditor before relying on it (report Q16/Q17).',CURRENT_TIMESTAMP),
('18200','Other Funds and Deposits','asset','debit',false,true,true,'Same heading-placement doubt as 18100 — see that row''s note (report Q16/Q17).',CURRENT_TIMESTAMP),
('21110','Saving Deposits','liability','credit',false,true,false,NULL,CURRENT_TIMESTAMP),
('21120','Time Deposits','liability','credit',false,true,false,NULL,CURRENT_TIMESTAMP),
('21130','Other Deposit Liabilities','liability','credit',false,true,false,NULL,CURRENT_TIMESTAMP),
('21440','Interest on Share Capital Payable','liability','credit',false,true,false,NULL,CURRENT_TIMESTAMP),
('21450','Patronage Refund Payable','liability','credit',false,true,false,NULL,CURRENT_TIMESTAMP),
('21460','Due to Union/Federation (CETF)','liability','credit',false,true,false,NULL,CURRENT_TIMESTAMP),
('22300','Revolving Capital Payable','liability','credit',false,true,false,NULL,CURRENT_TIMESTAMP),
('30110','Subscribed Share Capital-Common','equity','credit',false,true,false,NULL,CURRENT_TIMESTAMP),
('30120','Subscription Receivable - Common','equity','debit',true,true,false,NULL,CURRENT_TIMESTAMP),
('30130','Paid-up Share Capital - Common','equity','credit',false,true,false,NULL,CURRENT_TIMESTAMP),
('30131','Treasury Shares Capital - Common','equity','debit',true,true,false,NULL,CURRENT_TIMESTAMP),
('30210','Subscribed Share Capital-Preferred','equity','credit',false,true,false,NULL,CURRENT_TIMESTAMP),
('30220','Subscriptions Receivable-Preferred','equity','debit',true,true,false,NULL,CURRENT_TIMESTAMP),
('30230','Paid-up Share Capital-Preferred','equity','credit',false,true,false,NULL,CURRENT_TIMESTAMP),
('30231','Treasury Shares Capital - Preferred','equity','debit',true,true,false,NULL,CURRENT_TIMESTAMP),
('30300','Deposit for Share Capital Subscription','equity','credit',false,true,false,NULL,CURRENT_TIMESTAMP),
('30600','Undivided Net Surplus / Net Loss','equity','credit',false,true,true,'Report''s extraction shows this code printed for BOTH "Undivided Net Surplus" and "Net Loss" as separate line items. Confirm with the auditor which account the cooperative''s books actually use for which (report Q17).',CURRENT_TIMESTAMP),
('30810','Reserve Fund','equity','credit',false,true,false,NULL,CURRENT_TIMESTAMP),
('30820','Cooperative Education & Training Fund','equity','credit',false,true,false,NULL,CURRENT_TIMESTAMP),
('30830','Community Development Fund','equity','credit',false,true,false,NULL,CURRENT_TIMESTAMP),
('30840','Optional Fund','equity','credit',false,true,false,NULL,CURRENT_TIMESTAMP),
('40110','Interest Income from Loans','revenue','credit',false,true,false,NULL,CURRENT_TIMESTAMP),
('40120','Service Fees','revenue','credit',false,true,false,NULL,CURRENT_TIMESTAMP),
('40130','Filing Fees','revenue','credit',false,true,false,NULL,CURRENT_TIMESTAMP),
('40140','Fines, Penalties, Surcharges','revenue','credit',false,true,false,NULL,CURRENT_TIMESTAMP),
('40610','Income/Interest from Investment/Deposits','revenue','credit',false,true,false,NULL,CURRENT_TIMESTAMP),
('40620','Membership Fee','revenue','credit',false,true,false,NULL,CURRENT_TIMESTAMP),
('49900','Other/Sundry Income','revenue','credit',false,true,true,'NOT an MC 2022-24 code. The report''s curated code table has no generic other-income line item at all (the circular''s annexes and text after Section 7 weren''t read). This code only follows the report''s own element-digit convention (4 = revenue); replace once the auditor or the full circular text gives the real code (report Q16/Q17).',CURRENT_TIMESTAMP),
('71100','Interest Expense on Borrowings','expense','debit',false,true,false,NULL,CURRENT_TIMESTAMP),
('71200','Interest Expense on Deposits','expense','debit',false,true,false,NULL,CURRENT_TIMESTAMP),
('73320','Collection Expense','expense','debit',false,true,false,NULL,CURRENT_TIMESTAMP),
('73380','Probable Losses on Loan/Accounts/Installment Receivables','expense','debit',false,true,false,NULL,CURRENT_TIMESTAMP),
('79900','Other/Sundry Expense','expense','debit',false,true,true,'NOT an MC 2022-24 code — same gap as 49900''s note, follows element-digit 7 = expense only by convention. Replace once confirmed (report Q16/Q17).',CURRENT_TIMESTAMP);

-- Data migration: remap existing ledger_entries from the prototype's
-- invented 4-digit codes to the MC 2022-24 codes above, before the FK
-- constraint below makes any unmapped code impossible to insert or keep.
UPDATE "ledger_entries" SET "account_code" = '11110' WHERE "account_code" = '1000';
UPDATE "ledger_entries" SET "account_code" = '11130' WHERE "account_code" = '1010';
UPDATE "ledger_entries" SET "account_code" = '11150' WHERE "account_code" = '1020';
UPDATE "ledger_entries" SET "account_code" = '11360' WHERE "account_code" = '1030';
UPDATE "ledger_entries" SET "account_code" = '11210' WHERE "account_code" = '1100';
-- Old 2000 "Members' Share Capital" mapped to Paid-up Share Capital - Common
-- (regular/common members only) as a Phase 0 simplification: the current
-- Member model has no membership-class or share-class concept yet, so this
-- is the closest single-bucket match. Revisit once share classes exist
-- (gap analysis item 3 / report Q10).
UPDATE "ledger_entries" SET "account_code" = '30130' WHERE "account_code" = '2000';
UPDATE "ledger_entries" SET "account_code" = '40110' WHERE "account_code" = '4000';
UPDATE "ledger_entries" SET "account_code" = '40140' WHERE "account_code" = '4100';
UPDATE "ledger_entries" SET "account_code" = '49900' WHERE "account_code" = '4900';
UPDATE "ledger_entries" SET "account_code" = '79900' WHERE "account_code" = '6000';

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_code_fkey" FOREIGN KEY ("account_code") REFERENCES "accounts"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
