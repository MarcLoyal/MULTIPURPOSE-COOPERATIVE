import { Prisma, DisbursementVoucherSourceType } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Atomically advances the single counter row and returns the new
 * value. Must run inside the same prisma.$transaction as the
 * DisbursementVoucher insert that uses it — same row-lock reasoning as
 * receipts.ts's nextSequenceNumber, which this mirrors exactly.
 */
async function nextSequenceNumber(tx: Prisma.TransactionClient): Promise<number> {
  const counter = await tx.disbursementVoucherSequenceCounter.findFirst();
  if (!counter) throw new Error("Disbursement voucher sequence counter row is missing");
  const updated = await tx.disbursementVoucherSequenceCounter.update({
    where: { id: counter.id },
    data: { lastNumber: { increment: 1 } },
  });
  return updated.lastNumber;
}

type IssueVoucherParams = {
  sourceType: DisbursementVoucherSourceType;
  loanTransactionId?: string;
  depositTransactionId?: string;
  shareCapitalTransactionId?: string;
  amount: number;
  memberId: string;
  createdById: string;
};

/**
 * Issues a new disbursement voucher: assigns the next gap-free
 * sequence number. Runs in its own transaction, separate from whatever
 * transaction recorded the underlying disbursement — issuing a
 * voucher is a distinct, later, optional action a staff member takes
 * on an already-completed disbursement, same as issueReceipt().
 */
export async function issueVoucher(params: IssueVoucherParams) {
  return prisma.$transaction(async (tx) => {
    const sequenceNumber = await nextSequenceNumber(tx);
    return tx.disbursementVoucher.create({
      data: {
        sequenceNumber,
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
