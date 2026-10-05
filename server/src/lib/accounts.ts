/**
 * ============================================================================
 * TODO(chart-of-accounts): PLACEHOLDER — NOT the cooperative's real chart
 * of accounts. No existing chart of accounts was supplied (see README,
 * "Design decisions & open questions", item 2 / spec section 8.2). These
 * account codes/labels are a reasonable minimal set invented for this
 * prototype only.
 *
 * MUST be reconciled with the cooperative's actual books — real account
 * codes, numbering scheme, and any accounts missing here (e.g. equity,
 * retained earnings, specific income/expense lines the cooperative
 * already uses) — before this goes anywhere near a real deployment.
 * Every LedgerEntry posted by the app uses these codes directly, so a
 * wrong chart here means wrong GL/Trial Balance output once real money
 * is involved.
 * ============================================================================
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
