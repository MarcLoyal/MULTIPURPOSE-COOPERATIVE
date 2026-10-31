-- Opening balances import (PR D). opening_balance_imports is the
-- permanent "this has already run once" lock (its existence, checked by
-- openingBalances.routes.ts, same pattern as cooperative_profile). The
-- new account 30900 is the one clearing/suspense line every opening
-- entry's other side posts to — not a CDA MC 2022-24 code, flagged
-- needs_review like the app's other two invented codes (49900/79900).
-- See OpeningBalanceImport's doc comment in schema.prisma for why this
-- isn't derived from existing data.

-- CreateTable
CREATE TABLE "opening_balance_imports" (
    "id" TEXT NOT NULL,
    "cutoff_date" TIMESTAMP(3) NOT NULL,
    "members_imported" INTEGER NOT NULL,
    "share_capital_imported" INTEGER NOT NULL,
    "loans_imported" INTEGER NOT NULL,
    "deposits_imported" INTEGER NOT NULL,
    "other_lines_imported" INTEGER NOT NULL,
    "suspense_balance" DECIMAL(18,2) NOT NULL,
    "performed_by" TEXT NOT NULL,
    "performed_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opening_balance_imports_pkey" PRIMARY KEY ("id")
);

-- New account: Opening Balance Equity (import suspense)
INSERT INTO "accounts" ("code","label","element","normal_balance","is_contra","is_active","needs_review","review_note","updated_at") VALUES
('30900','Opening Balance Equity','equity','credit',false,true,true,'Not a CDA MC 2022-24 code — added as the clearing/suspense line for the opening-balances import (see OpeningBalanceImport in schema.prisma). Should net to zero once every opening account, including the ''Other GL opening balances'' template, has been imported; a nonzero balance after that means the audited opening trial balance was not fully entered.',CURRENT_TIMESTAMP);
