import { randomUUID } from "crypto";
import { LedgerSourceType, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type LedgerLine = {
  accountCode: string;
  debit?: number | string;
  credit?: number | string;
};

/**
 * Posts a batch of LedgerEntry rows as one atomic, self-balancing group
 * (shared batchId). Every posting in this system must go through here so
 * debit === credit is enforced in one place — end users never write
 * LedgerEntry rows directly (spec 4.5).
 */
export async function postLedgerBatch(
  tx: Prisma.TransactionClient,
  params: {
    sourceType: LedgerSourceType;
    lines: LedgerLine[];
    createdById: string;
    memo?: string;
    shareCapitalTransactionId?: string;
    loanTransactionId?: string;
    cashTransactionId?: string;
    depositTransactionId?: string;
    statutoryFundAllocationId?: string;
    dividendDistributionId?: string;
    entryDate?: Date;
  }
) {
  const totals = params.lines.reduce(
    (acc, line) => {
      acc.debit += Number(line.debit ?? 0);
      acc.credit += Number(line.credit ?? 0);
      return acc;
    },
    { debit: 0, credit: 0 }
  );

  // Guard against floating point noise while still catching real imbalance.
  if (Math.abs(totals.debit - totals.credit) > 0.005) {
    throw new Error(
      `Ledger batch does not balance: debit=${totals.debit.toFixed(2)} credit=${totals.credit.toFixed(2)}`
    );
  }
  if (totals.debit === 0 && totals.credit === 0) {
    throw new Error("Ledger batch has no amounts to post");
  }

  const batchId = randomUUID();
  const entryDate = params.entryDate ?? new Date();

  await tx.ledgerEntry.createMany({
    data: params.lines.map((line) => ({
      batchId,
      entryDate,
      accountCode: line.accountCode,
      debit: Number(line.debit ?? 0).toFixed(2),
      credit: Number(line.credit ?? 0).toFixed(2),
      sourceType: params.sourceType,
      shareCapitalTransactionId: params.shareCapitalTransactionId,
      loanTransactionId: params.loanTransactionId,
      cashTransactionId: params.cashTransactionId,
      depositTransactionId: params.depositTransactionId,
      statutoryFundAllocationId: params.statutoryFundAllocationId,
      dividendDistributionId: params.dividendDistributionId,
      memo: params.memo,
      createdById: params.createdById,
    })),
  });

  return batchId;
}

export async function getTrialBalance() {
  const rows = await prisma.ledgerEntry.groupBy({
    by: ["accountCode"],
    _sum: { debit: true, credit: true },
    orderBy: { accountCode: "asc" },
  });

  return rows.map((row) => ({
    accountCode: row.accountCode,
    totalDebit: Number(row._sum.debit ?? 0),
    totalCredit: Number(row._sum.credit ?? 0),
  }));
}

/**
 * Income statement for a date range: every revenue/expense account's net
 * movement for the period (asset/liability/equity accounts are excluded —
 * this is a period statement, not a balance-sheet snapshot). Each
 * account's amount is signed by its own normal balance (credit for
 * revenue, debit for expense) so "amount earned/incurred" reads
 * positive in the ordinary case, the same convention the trial balance
 * leaves to the caller but this report needs to net directly into
 * netSurplus = totalRevenue - totalExpense.
 */
export async function getIncomeStatement(from?: Date, to?: Date) {
  const [sums, accounts] = await Promise.all([
    prisma.ledgerEntry.groupBy({
      by: ["accountCode"],
      where: {
        entryDate: { gte: from, lte: to },
      },
      _sum: { debit: true, credit: true },
    }),
    prisma.account.findMany({
      where: { element: { in: ["revenue", "expense"] } },
      select: { code: true, label: true, element: true, normalBalance: true },
    }),
  ]);

  const sumByCode = new Map(sums.map((s) => [s.accountCode, s]));

  const rows = accounts
    .map((account) => {
      const sum = sumByCode.get(account.code);
      const debit = Number(sum?._sum.debit ?? 0);
      const credit = Number(sum?._sum.credit ?? 0);
      const amount = account.normalBalance === "credit" ? credit - debit : debit - credit;
      return { accountCode: account.code, accountLabel: account.label, element: account.element, amount };
    })
    .filter((row) => row.amount !== 0)
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  const revenueRows = rows.filter((r) => r.element === "revenue");
  const expenseRows = rows.filter((r) => r.element === "expense");
  const totalRevenue = revenueRows.reduce((sum, r) => sum + r.amount, 0);
  const totalExpense = expenseRows.reduce((sum, r) => sum + r.amount, 0);

  return {
    fromDate: from ?? null,
    toDate: to ?? null,
    revenueRows,
    expenseRows,
    totalRevenue: round2ForLedger(totalRevenue),
    totalExpense: round2ForLedger(totalExpense),
    netSurplus: round2ForLedger(totalRevenue - totalExpense),
  };
}

/**
 * Statement of Financial Condition (balance sheet) as of a point in
 * time — a snapshot, not a period statement like getIncomeStatement.
 * Asset/liability/equity accounts carry their cumulative balance
 * directly. Revenue/expense accounts don't belong on a balance sheet
 * at all once closed, but this app only zeroes them out at an
 * explicit fiscal-year close (fiscalYears.routes.ts) — between closes
 * they sit on the ledger with live nonzero balances that the books
 * haven't moved into equity yet. Folding their net (same net-surplus
 * computation as getIncomeStatement) into equity as a labeled
 * "Current Period Net Surplus (Unclosed)" line is what actually makes
 * Assets = Liabilities + Equity hold at any arbitrary moment — the
 * standard treatment for an interim balance sheet pulled before
 * formal year-end closing entries are posted.
 *
 * A contra account (isContra — e.g. 11242 Allowance for Probable
 * Losses, a contra-asset; 30120/30131 Subscription Receivable/Treasury
 * Shares, contra-equity) moves opposite its element's usual direction
 * by design, so each row's normalBalance-signed `amount` is positive
 * in that account's own "ordinary" direction but must be SUBTRACTED,
 * not added, when rolling up the section total — the `isContra` flag
 * on each row is what the totals below (and the client's rendering)
 * key off of.
 */
export type SignedAccountBalance = {
  accountCode: string;
  accountLabel: string;
  element: "asset" | "liability" | "equity" | "revenue" | "expense";
  isContra: boolean;
  amount: number;
};

/**
 * Every account's cumulative balance as of a date, signed so `amount`
 * reads positive in that account's own "ordinary" direction (credit
 * for a credit-normal account, debit for a debit-normal one) —
 * callers that roll these up into a section total must subtract a
 * contra row (isContra) rather than add it. Shared by getBalanceSheet
 * (asset/liability/equity/revenue/expense as of one date) and
 * getStatementOfChangesInEquity (equity only, as of two dates) so both
 * use the exact same signing convention and never drift apart.
 */
export async function getSignedAccountBalances(
  asOf: Date,
  elements?: SignedAccountBalance["element"][]
): Promise<SignedAccountBalance[]> {
  const [sums, accounts] = await Promise.all([
    prisma.ledgerEntry.groupBy({
      by: ["accountCode"],
      where: { entryDate: { lte: asOf } },
      _sum: { debit: true, credit: true },
    }),
    prisma.account.findMany({
      where: elements ? { element: { in: elements } } : undefined,
      select: { code: true, label: true, element: true, normalBalance: true, isContra: true },
    }),
  ]);

  const sumByCode = new Map(sums.map((s) => [s.accountCode, s]));

  return accounts
    .map((account) => {
      const sum = sumByCode.get(account.code);
      const debit = Number(sum?._sum.debit ?? 0);
      const credit = Number(sum?._sum.credit ?? 0);
      const amount = account.normalBalance === "credit" ? credit - debit : debit - credit;
      return {
        accountCode: account.code,
        accountLabel: account.label,
        element: account.element,
        isContra: account.isContra,
        amount,
      };
    })
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode));
}

export async function getBalanceSheet(asOf?: Date) {
  const cutoff = asOf ?? new Date();
  const allRows = (await getSignedAccountBalances(cutoff)).filter((row) => row.amount !== 0);

  const signedForTotal = (row: (typeof allRows)[number]) => (row.isContra ? -row.amount : row.amount);

  const assetRows = allRows.filter((r) => r.element === "asset");
  const liabilityRows = allRows.filter((r) => r.element === "liability");
  const equityRows = allRows.filter((r) => r.element === "equity");
  const revenueRows = allRows.filter((r) => r.element === "revenue");
  const expenseRows = allRows.filter((r) => r.element === "expense");

  const totalRevenue = revenueRows.reduce((sum, r) => sum + r.amount, 0);
  const totalExpense = expenseRows.reduce((sum, r) => sum + r.amount, 0);
  const unclosedNetSurplus = round2ForLedger(totalRevenue - totalExpense);

  const totalAssets = round2ForLedger(assetRows.reduce((sum, r) => sum + signedForTotal(r), 0));
  const totalLiabilities = round2ForLedger(liabilityRows.reduce((sum, r) => sum + signedForTotal(r), 0));
  const totalEquity = round2ForLedger(
    equityRows.reduce((sum, r) => sum + signedForTotal(r), 0) + unclosedNetSurplus
  );

  return {
    asOf: cutoff,
    assetRows,
    liabilityRows,
    equityRows,
    unclosedNetSurplus,
    totalAssets,
    totalLiabilities,
    totalEquity,
    balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
  };
}

/**
 * Statement of Changes in Equity for [periodStart, periodEnd] — each
 * equity account's beginning balance, net movement during the period,
 * and ending balance. periodStart undefined means "the very first
 * fiscal year ever" (getPeriodStart's own convention), so beginning
 * balances are all zero rather than queried.
 *
 * Expected to be called with a CLOSED fiscal year's own period, where
 * revenue/expense accounts should already have been swept into equity
 * by that year's close entries (fiscalYears.routes.ts). In practice
 * that sweep isn't a hard guarantee — nothing stops a later ledger
 * posting from landing with an entryDate inside an already-closed
 * period (e.g. test fixtures, or a backdated correction) — so, exactly
 * like getBalanceSheet, any revenue/expense net still sitting unswept
 * as of a cutoff is folded into equity as a "Current Period Net
 * Surplus (Unclosed)" row. This keeps totalEnding tied to
 * getBalanceSheet(periodEnd).totalEquity unconditionally, not just in
 * the clean-close case.
 */
export async function getStatementOfChangesInEquity(periodStart: Date | undefined, periodEnd: Date) {
  const beginningCutoff = periodStart ? new Date(periodStart.getTime() - 1) : undefined;
  const [beginningEquityRows, endingEquityRows, beginningActivityRows, endingActivityRows] = await Promise.all([
    beginningCutoff ? getSignedAccountBalances(beginningCutoff, ["equity"]) : Promise.resolve([]),
    getSignedAccountBalances(periodEnd, ["equity"]),
    beginningCutoff ? getSignedAccountBalances(beginningCutoff, ["revenue", "expense"]) : Promise.resolve([]),
    getSignedAccountBalances(periodEnd, ["revenue", "expense"]),
  ]);

  const unclosedNetSurplus = (rows: SignedAccountBalance[]) =>
    rows.reduce((sum, r) => sum + (r.element === "expense" ? -r.amount : r.amount), 0);
  const beginningUnclosed = round2ForLedger(unclosedNetSurplus(beginningActivityRows));
  const endingUnclosed = round2ForLedger(unclosedNetSurplus(endingActivityRows));

  const beginningByCode = new Map(beginningEquityRows.map((r) => [r.accountCode, r]));
  const endingByCode = new Map(endingEquityRows.map((r) => [r.accountCode, r]));
  const allCodes = new Set([...beginningByCode.keys(), ...endingByCode.keys()]);

  const signedForTotal = (amount: number, isContra: boolean) => (isContra ? -amount : amount);

  const rows = Array.from(allCodes)
    .map((accountCode) => {
      const beginning = beginningByCode.get(accountCode);
      const ending = endingByCode.get(accountCode);
      const reference = ending ?? beginning!;
      const beginningBalance = beginning?.amount ?? 0;
      const endingBalance = ending?.amount ?? 0;
      return {
        accountCode,
        accountLabel: reference.accountLabel,
        isContra: reference.isContra,
        beginningBalance,
        netChange: round2ForLedger(endingBalance - beginningBalance),
        endingBalance,
      };
    })
    .filter((row) => row.beginningBalance !== 0 || row.endingBalance !== 0 || row.netChange !== 0)
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  if (beginningUnclosed !== 0 || endingUnclosed !== 0) {
    rows.push({
      accountCode: "",
      accountLabel: "Current Period Net Surplus (Unclosed)",
      isContra: false,
      beginningBalance: beginningUnclosed,
      netChange: round2ForLedger(endingUnclosed - beginningUnclosed),
      endingBalance: endingUnclosed,
    });
  }

  const totalBeginning = round2ForLedger(
    rows.reduce((sum, r) => sum + signedForTotal(r.beginningBalance, r.isContra), 0)
  );
  const totalNetChange = round2ForLedger(rows.reduce((sum, r) => sum + signedForTotal(r.netChange, r.isContra), 0));
  const totalEnding = round2ForLedger(rows.reduce((sum, r) => sum + signedForTotal(r.endingBalance, r.isContra), 0));

  return { periodStart: periodStart ?? null, periodEnd, rows, totalBeginning, totalNetChange, totalEnding };
}

function round2ForLedger(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
