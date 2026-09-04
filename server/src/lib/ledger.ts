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
