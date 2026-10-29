import { Prisma, ReceiptSourceType } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Atomically advances the single counter row and returns the new
 * value. Must run inside the same prisma.$transaction as the Receipt
 * insert that uses it — an UPDATE ... SET last_number = last_number + 1
 * takes a row lock, so concurrent callers serialize on it instead of
 * reading the same value twice. This is what makes the sequence
 * gap-free even under concurrent cashiers; a Postgres SEQUENCE would
 * not give that guarantee (it can skip values on a rolled-back
 * transaction).
 */
async function nextSequenceNumber(tx: Prisma.TransactionClient): Promise<number> {
  const counter = await tx.receiptSequenceCounter.findFirst();
  if (!counter) throw new Error("Receipt sequence counter row is missing");
  const updated = await tx.receiptSequenceCounter.update({
    where: { id: counter.id },
    data: { lastNumber: { increment: 1 } },
  });
  return updated.lastNumber;
}

type IssueReceiptParams = {
  sourceType: ReceiptSourceType;
  loanTransactionId?: string;
  depositTransactionId?: string;
  shareCapitalTransactionId?: string;
  amount: number;
  memberId: string;
  createdById: string;
};

/**
 * Issues a new receipt: assigns the next gap-free sequence number and
 * snapshots the currently configured document label (see
 * ReceiptSetting's schema comment — a later label change must never
 * relabel an already-issued receipt). Runs in its own transaction,
 * separate from whatever transaction posted the underlying payment —
 * issuing a receipt is a distinct, later, optional action a staff
 * member takes on an already-completed payment, not an inherent part
 * of recording it.
 */
export async function issueReceipt(params: IssueReceiptParams) {
  return prisma.$transaction(async (tx) => {
    const setting = await tx.receiptSetting.findFirst();
    const sequenceNumber = await nextSequenceNumber(tx);
    return tx.receipt.create({
      data: {
        sequenceNumber,
        documentLabel: setting?.documentLabel ?? "Payment Receipt",
        sourceType: params.sourceType,
        loanTransactionId: params.loanTransactionId,
        depositTransactionId: params.depositTransactionId,
        shareCapitalTransactionId: params.shareCapitalTransactionId,
        amount: params.amount,
        memberId: params.memberId,
        createdById: params.createdById,
      },
    });
  });
}
