/**
 * ============================================================================
 * Chart of accounts: CDA MC 2022-24 "Revised Standard Chart of Accounts for
 * Cooperatives" (see docs/research/Philippine_cooperative_system_rules.md).
 *
 * The full reference chart — every code, label, element, normal balance,
 * and any needs-review flag — lives in the `accounts` table, seeded by the
 * `chart_of_accounts_mc2022_24` migration. That table is the single source
 * of truth for labels (see accounting.routes.ts) and the FK that every
 * LedgerEntry.accountCode is validated against.
 *
 * ACCOUNTS below is just the small subset of codes the app's currently
 * -implemented modules (cash, loans, share capital) post to directly —
 * a convenience for those call sites, not a second copy of the chart.
 *
 * Two mapping decisions worth flagging:
 * - MEMBERS_SHARE_CAPITAL -> 30130 "Paid-up Share Capital - Common" is a
 *   simplification: the current Member/ShareCapitalAccount models have no
 *   share-class or subscribed-vs-paid-up concept yet, so every member's
 *   balance is treated as common, paid-up capital. Revisit once share
 *   classes are built (gap analysis item 3 / report Q10).
 * - OTHER_INCOME / OTHER_EXPENSE (49900 / 79900) are NOT MC 2022-24 codes —
 *   the report's curated code table had no generic other-income/expense
 *   line item at all. They're flagged needs_review in the accounts table;
 *   replace once the auditor or the full circular text gives a real code
 *   (report Q16/Q17).
 * ============================================================================
 */
export const ACCOUNTS = {
  CASH_ON_HAND: "11110",
  CASH_IN_BANK: "11130",
  PETTY_CASH_FUND: "11150",
  CASH_ADVANCES: "11360",
  LOANS_RECEIVABLE: "11210",
  MEMBERS_SHARE_CAPITAL: "30130",
  INTEREST_INCOME: "40110",
  PENALTY_INCOME: "40140",
  OTHER_INCOME: "49900",
  OTHER_EXPENSE: "79900",
} as const;
