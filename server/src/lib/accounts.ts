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
  // Renamed from LOANS_RECEIVABLE (same code, 11210) when
  // LOANS_RECEIVABLE_PAST_DUE/RESTRUCTURED were added — "current" is now
  // one of three buckets a loan's receivable can sit in, not the only one.
  // See lib/loanReceivable.ts for which bucket a given LoanStatus maps to.
  LOANS_RECEIVABLE_CURRENT: "11210",
  LOANS_RECEIVABLE_PAST_DUE: "11220",
  LOANS_RECEIVABLE_RESTRUCTURED: "11230",
  // Contra-asset; see server/src/lib/allowance.ts — the percentage that
  // determines how much lands here is a per-bucket setting, never fixed.
  ALLOWANCE_FOR_PROBABLE_LOSSES: "11242",
  MEMBERS_SHARE_CAPITAL: "30130",
  INTEREST_INCOME: "40110",
  PENALTY_INCOME: "40140",
  OTHER_INCOME: "49900",
  OTHER_EXPENSE: "79900",
  PROBABLE_LOSSES_EXPENSE: "73380",
  // Deposit liabilities (report gap-analysis item 3) — see
  // deposits.routes.ts's receivableAccountForDepositType for how
  // DepositProduct.type maps to one of these. "Other Deposit
  // Liabilities" (21130) has no corresponding DepositType in the
  // schema, so it's intentionally unmapped, same reasoning as the
  // unmapped loan "litigation" bucket.
  SAVINGS_DEPOSITS: "21110",
  TIME_DEPOSITS: "21120",
  INTEREST_EXPENSE_ON_DEPOSITS: "71200",
  // Statutory fund allocation (report gap-analysis item 4) — see
  // fiscalYears.routes.ts. UNDIVIDED_NET_SURPLUS is both the closing
  // target for the period's revenue/expense accounts and the source
  // the four funds are allocated from; whatever isn't allocated stays
  // here, undivided, exactly matching the account's name.
  UNDIVIDED_NET_SURPLUS: "30600",
  RESERVE_FUND: "30810",
  // CETF splits 50/50 between the cooperative's own internal fund and
  // what's remitted to the union/federation (StatutoryFundAllocation.
  // cetfPercent doc comment) — two different GL accounts for the one
  // percentage.
  CETF_INTERNAL: "30820",
  DUE_TO_UNION_FEDERATION_CETF: "21460",
  COMMUNITY_DEVELOPMENT_FUND: "30830",
  OPTIONAL_FUND: "30840",
} as const;
