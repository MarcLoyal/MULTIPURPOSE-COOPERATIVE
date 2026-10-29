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

function round2ForLedger(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
