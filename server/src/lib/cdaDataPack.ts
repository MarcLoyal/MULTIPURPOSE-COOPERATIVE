import { prisma } from "./prisma";
import { notFound } from "./httpError";
import { getBalanceSheet, getIncomeStatement, getStatementOfCashFlows, getStatementOfChangesInEquity } from "./ledger";
import { getPeriodStart } from "../modules/accounting/fiscalYears.routes";
import { INFLOW_TYPES } from "../modules/shareCapital/shareCapital.routes";
import { computeLoanSchedule, computeAging, round2 } from "./loanSchedule";
import { ACCOUNTS } from "./accounts";

/**
 * CDA Report Data Pack — NOT the CAPR itself. The CAPR is filed online
 * through CDA's CAIS system, and its financial statements must carry
 * a CDA-accredited external auditor's opinion before filing; nothing
 * generated here does that. This assembles, for one fiscal year, the
 * figures a cooperative's auditor and CAIS filer need to work from:
 * the five statements (Financial Condition, Operations, Changes in
 * Equity, Cash Flows — direct method, see lib/ledger.ts:
 * getStatementOfCashFlows for the classification rationale — and a
 * period-end Trial Balance), statutory fund and dividend distribution
 * records, and membership/share capital/loan/deposit summaries.
 *
 * Works for a CLOSED fiscal year (the normal case — final figures,
 * statutory funds and dividends already recorded) and, so the
 * cooperative can review numbers before deciding to close, for a
 * still-OPEN one too. An open year has no fixed cutoff yet, so every
 * ledger-derived figure is computed as of min(yearEndDate, now)
 * instead of yearEndDate itself, and the response carries
 * isPreliminary: true — the client must label this run "PRELIMINARY —
 * fiscal year not yet closed," not present it as final. Revenue/expense
 * won't have been swept into equity by a close yet either; that's the
 * same "unswept activity" case getStatementOfChangesInEquity already
 * folds into its "Current Period Net Surplus (Unclosed)" row for a
 * closed year with post-close activity, so no special-casing is needed
 * here for it to stay tied to the balance sheet.
 *
 * Two different accuracy levels sit side by side here, and every
 * section is one or the other:
 *   - Ledger-derived figures (the four statements, statutory funds,
 *     dividends, ending deposit liability balances, per-member share
 *     capital, portfolio-wide outstanding loan balance) are accurate
 *     AS OF that cutoff (yearEndDate once closed, min(yearEndDate, now)
 *     while open) — the ledger carries real entryDate/createdAt
 *     timestamps for all of this.
 *   - Membership status/class counts and the loan status breakdown
 *     are CURRENT snapshots, not historical — Member.status and
 *     LoanAccount.status are mutable fields with no history table, so
 *     there is no way to reconstruct what they were as of that cutoff.
 *     Labeled as such in the response; the client must not present
 *     them as point-in-time.
 */
export async function buildCdaDataPack(fiscalYearId: string) {
  const fiscalYear = await prisma.fiscalYear.findUnique({
    where: { id: fiscalYearId },
    include: { statutoryFundAllocation: true, dividendDistribution: true },
  });
  if (!fiscalYear) throw notFound("Fiscal year not found");

  const isPreliminary = fiscalYear.status !== "closed";
  const periodStart = await getPeriodStart(fiscalYear);
  const periodEnd = isPreliminary ? new Date(Math.min(fiscalYear.yearEndDate.getTime(), Date.now())) : fiscalYear.yearEndDate;

  const [
    balanceSheet,
    incomeStatement,
    equityStatement,
    cashFlowStatement,
    trialBalance,
    shareCapitalBalances,
    loanEventTotals,
    outstandingPortfolio,
    currentLoanStatusBreakdown,
    depositEventTotals,
    membership,
    shareCapitalEventTotals,
  ] = await Promise.all([
    getBalanceSheet(periodEnd),
    getIncomeStatement(periodStart, periodEnd),
    getStatementOfChangesInEquity(periodStart, periodEnd),
    getStatementOfCashFlows(periodStart, periodEnd),
    getTrialBalanceAsOf(periodEnd),
    getShareCapitalBalancesAsOf(periodEnd),
    getLoanEventTotals(periodStart, periodEnd),
    getOutstandingLoanPortfolioAsOf(periodEnd),
    getCurrentLoanStatusBreakdown(),
    getDepositEventTotals(periodStart, periodEnd),
    getMembershipSummary(periodStart, periodEnd),
    getShareCapitalEventTotals(periodStart, periodEnd),
  ]);

  const paidUpShareCapital =
    balanceSheet.equityRows.find((r) => r.accountCode === ACCOUNTS.MEMBERS_SHARE_CAPITAL)?.amount ?? 0;
  const allowance =
    balanceSheet.assetRows.find((r) => r.accountCode === ACCOUNTS.ALLOWANCE_FOR_PROBABLE_LOSSES)?.amount ?? 0;
  const savingsDeposits = balanceSheet.liabilityRows.find((r) => r.accountCode === ACCOUNTS.SAVINGS_DEPOSITS)?.amount ?? 0;
  const timeDeposits = balanceSheet.liabilityRows.find((r) => r.accountCode === ACCOUNTS.TIME_DEPOSITS)?.amount ?? 0;

  return {
    isUnaudited: true,
    isPreliminary,
    fiscalYear: {
      id: fiscalYear.id,
      yearEndDate: fiscalYear.yearEndDate,
      status: fiscalYear.status,
      periodStart: periodStart ?? null,
      reportAsOf: periodEnd,
    },
    generatedAt: new Date(),
    balanceSheet,
    incomeStatement,
    equityStatement,
    cashFlowStatement,
    trialBalance,
    statutoryFundAllocation: fiscalYear.statutoryFundAllocation,
    dividendDistribution: fiscalYear.dividendDistribution,
    membership,
    shareCapital: {
      totalPaidUpAtYearEnd: round2(paidUpShareCapital),
      subscriptionsDuringPeriod: shareCapitalEventTotals.subscriptions,
      withdrawalsDuringPeriod: shareCapitalEventTotals.withdrawals,
      perMemberBalancesAtYearEnd: shareCapitalBalances,
    },
    loans: {
      releasedDuringPeriod: loanEventTotals.released,
      collectedDuringPeriod: loanEventTotals.collected,
      outstandingPortfolioAtYearEnd: outstandingPortfolio,
      currentStatusBreakdown: currentLoanStatusBreakdown,
      allowanceForProbableLossesAtYearEnd: round2(allowance),
    },
    deposits: {
      depositsDuringPeriod: depositEventTotals.deposited,
      withdrawalsDuringPeriod: depositEventTotals.withdrawn,
      endingBalancesByProduct: [
        { accountCode: ACCOUNTS.SAVINGS_DEPOSITS, label: "Savings Deposits", amount: round2(savingsDeposits) },
        { accountCode: ACCOUNTS.TIME_DEPOSITS, label: "Time Deposits", amount: round2(timeDeposits) },
      ].filter((r) => r.amount !== 0),
    },
  };
}

async function getTrialBalanceAsOf(cutoff: Date) {
  const [sums, accounts] = await Promise.all([
    prisma.ledgerEntry.groupBy({
      by: ["accountCode"],
      where: { entryDate: { lte: cutoff } },
      _sum: { debit: true, credit: true },
    }),
    prisma.account.findMany({ select: { code: true, label: true } }),
  ]);
  const labelByCode = new Map(accounts.map((a) => [a.code, a.label]));
  const rows = sums
    .map((s) => ({
      accountCode: s.accountCode,
      accountLabel: labelByCode.get(s.accountCode) ?? s.accountCode,
      totalDebit: Number(s._sum.debit ?? 0),
      totalCredit: Number(s._sum.credit ?? 0),
    }))
    .filter((r) => r.totalDebit !== 0 || r.totalCredit !== 0)
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  const totals = rows.reduce(
    (acc, r) => {
      acc.totalDebit = round2(acc.totalDebit + r.totalDebit);
      acc.totalCredit = round2(acc.totalCredit + r.totalCredit);
      return acc;
    },
    { totalDebit: 0, totalCredit: 0 }
  );
  return { asOf: cutoff, rows, totals, balanced: Math.abs(totals.totalDebit - totals.totalCredit) < 0.01 };
}

// Point-in-time per-member share capital balance — replays each
// account's posted transactions up to the cutoff, same INFLOW_TYPES
// convention shareCapital.routes.ts's own recomputeBalance uses for
// the live (today-only) ShareCapitalAccount.balance field.
async function getShareCapitalBalancesAsOf(cutoff: Date) {
  const accounts = await prisma.shareCapitalAccount.findMany({
    include: {
      member: true,
      transactions: { where: { status: "posted", createdAt: { lte: cutoff } } },
    },
  });
  return accounts
    .map((account) => {
      const balance = account.transactions.reduce((sum, t) => {
        const amt = Number(t.amount);
        return sum + (INFLOW_TYPES.has(t.type) ? amt : -amt);
      }, 0);
      return {
        memberId: account.memberId,
        memberNumber: account.member.memberNumber,
        fullName: account.member.fullName,
        balance: round2(balance),
      };
    })
    .filter((row) => row.balance !== 0)
    .sort((a, b) => a.memberNumber.localeCompare(b.memberNumber));
}

async function getLoanEventTotals(periodStart: Date | undefined, periodEnd: Date) {
  const transactions = await prisma.loanTransaction.findMany({
    where: { createdAt: { gte: periodStart, lte: periodEnd }, type: { in: ["release", "repayment"] } },
  });
  const released = transactions.filter((t) => t.type === "release").reduce((s, t) => s + Number(t.amount), 0);
  const collected = transactions.filter((t) => t.type === "repayment").reduce((s, t) => s + Number(t.amount), 0);
  return { released: round2(released), collected: round2(collected) };
}

// Portfolio-wide outstanding balance as of the cutoff, replaying each
// loan's schedule with only the repayments posted by then — accurate
// regardless of a loan's CURRENT status, unlike a status-bucketed
// breakdown (see getCurrentLoanStatusBreakdown's doc comment).
async function getOutstandingLoanPortfolioAsOf(cutoff: Date): Promise<number> {
  const loans = await prisma.loanAccount.findMany({
    where: { releaseDate: { lte: cutoff } },
    include: { transactions: { where: { type: "repayment", createdAt: { lte: cutoff } } } },
  });
  const total = loans.reduce((sum, loan) => {
    const schedule = computeLoanSchedule(
      loan.computationMethod,
      Number(loan.principalAmount),
      Number(loan.interestRate),
      loan.termMonths,
      loan.releaseDate!
    );
    const totalRepaid = loan.transactions.reduce((s, t) => s + Number(t.amount), 0);
    return sum + computeAging({ schedule, totalRepaid, asOf: cutoff }).outstandingBalance;
  }, 0);
  return round2(total);
}

// CURRENT status counts only — LoanAccount.status is a mutable field
// with no history, so this cannot be reconstructed as of a past date.
// The client must label this "as of report generation," not year-end.
async function getCurrentLoanStatusBreakdown() {
  const grouped = await prisma.loanAccount.groupBy({ by: ["status"], _count: { status: true } });
  return grouped.map((g) => ({ status: g.status, count: g._count.status }));
}

async function getDepositEventTotals(periodStart: Date | undefined, periodEnd: Date) {
  const transactions = await prisma.depositTransaction.findMany({
    where: { createdAt: { gte: periodStart, lte: periodEnd }, type: { in: ["deposit", "withdrawal"] } },
  });
  const deposited = transactions.filter((t) => t.type === "deposit").reduce((s, t) => s + Number(t.amount), 0);
  const withdrawn = transactions.filter((t) => t.type === "withdrawal").reduce((s, t) => s + Number(t.amount), 0);
  return { deposited: round2(deposited), withdrawn: round2(withdrawn) };
}

async function getShareCapitalEventTotals(periodStart: Date | undefined, periodEnd: Date) {
  const transactions = await prisma.shareCapitalTransaction.findMany({
    where: { status: "posted", createdAt: { gte: periodStart, lte: periodEnd } },
  });
  const subscriptions = transactions
    .filter((t) => t.type === "subscription" || t.type === "additional_purchase")
    .reduce((s, t) => s + Number(t.amount), 0);
  const withdrawals = transactions.filter((t) => t.type === "withdrawal").reduce((s, t) => s + Number(t.amount), 0);
  return { subscriptions: round2(subscriptions), withdrawals: round2(withdrawals) };
}

// CURRENT counts only — Member.status/membershipClass have no history
// either. newMembersDuringPeriod is the one accurate historical figure
// here (dateJoined is a stable fact, not a mutable current-state field).
async function getMembershipSummary(periodStart: Date | undefined, periodEnd: Date) {
  const [newMembersDuringPeriod, allMembers] = await Promise.all([
    prisma.member.count({ where: { dateJoined: { gte: periodStart, lte: periodEnd } } }),
    prisma.member.findMany({ select: { status: true, membershipClass: true } }),
  ]);
  const countsByStatus: Record<string, number> = {};
  const countsByClass: Record<string, number> = {};
  for (const m of allMembers) {
    countsByStatus[m.status] = (countsByStatus[m.status] ?? 0) + 1;
    countsByClass[m.membershipClass] = (countsByClass[m.membershipClass] ?? 0) + 1;
  }
  return {
    newMembersDuringPeriod,
    totalMembersCurrent: allMembers.length,
    currentCountsByStatus: countsByStatus,
    currentCountsByClass: countsByClass,
  };
}
