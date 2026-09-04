/**
 * Minimal proposed chart of accounts for the MVP. No existing chart of
 * accounts was supplied for this cooperative (see open question in README
 * / spec section 8.2) — this is a reasonable minimal set for a
 * multipurpose cooperative and should be reconciled with the
 * cooperative's actual books before this leaves prototype stage.
 */
export const ACCOUNTS = {
  CASH_ON_HAND: "1000",
  CASH_IN_BANK: "1010",
  LOANS_RECEIVABLE: "1100",
  MEMBERS_SHARE_CAPITAL: "2000",
  INTEREST_INCOME: "4000",
  PENALTY_INCOME: "4100",
  PETTY_CASH_FUND: "1020",
  CASH_ADVANCES: "1030",
  OTHER_INCOME: "4900",
  OTHER_EXPENSE: "6000",
} as const;

export const ACCOUNT_LABELS: Record<string, string> = {
  [ACCOUNTS.CASH_ON_HAND]: "Cash on Hand",
  [ACCOUNTS.CASH_IN_BANK]: "Cash in Bank",
  [ACCOUNTS.LOANS_RECEIVABLE]: "Loans Receivable",
  [ACCOUNTS.MEMBERS_SHARE_CAPITAL]: "Members' Share Capital",
  [ACCOUNTS.INTEREST_INCOME]: "Interest Income on Loans",
  [ACCOUNTS.PENALTY_INCOME]: "Penalty Income",
  [ACCOUNTS.PETTY_CASH_FUND]: "Petty Cash Fund",
  [ACCOUNTS.CASH_ADVANCES]: "Cash Advances",
  [ACCOUNTS.OTHER_INCOME]: "Other/Sundry Income",
  [ACCOUNTS.OTHER_EXPENSE]: "Other/Sundry Expense",
};
