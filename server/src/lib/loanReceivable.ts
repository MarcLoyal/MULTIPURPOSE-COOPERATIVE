import { LoanStatus, Prisma } from "@prisma/client";
import { ACCOUNTS } from "./accounts";
import { postLedgerBatch } from "./ledger";
import { writeAuditLog } from "./audit";

/**
 * Portfolio at Risk (PAR): MC 2022-24 classifies the *whole* outstanding
 * balance of a loan by its current status, not just the overdue
 * installment — see report gap-analysis item 1. Each status that can hold
 * an outstanding receivable maps to exactly one GL bucket.
 *
 * "litigation" (11240) has no corresponding LoanStatus in this app at
 * all — there's no workflow that ever puts a loan into litigation — so
 * it's intentionally absent here rather than mapped to a status that
 * doesn't exist. "restructured" maps to 11230, but no current endpoint
 * ever sets that status either (LoanStatus.restructured exists on the
 * enum, unreachable in practice) — the mapping is correct for whenever a
 * restructuring workflow is built, but untestable against a real
 * transition until then.
 */
const RECEIVABLE_ACCOUNT_BY_STATUS: Partial<Record<LoanStatus, string>> = {
  active: ACCOUNTS.LOANS_RECEIVABLE_CURRENT,
  past_due: ACCOUNTS.LOANS_RECEIVABLE_PAST_DUE,
  restructured: ACCOUNTS.LOANS_RECEIVABLE_RESTRUCTURED,
};

export function receivableAccountForStatus(status: LoanStatus): string | undefined {
  return RECEIVABLE_ACCOUNT_BY_STATUS[status];
}

/**
 * Posts the journal entry moving a loan's whole outstanding balance
 * between PAR buckets (e.g. active -> past_due moves 11210 -> 11220), and
 * creates a LoanTransaction(type: reclassify) to anchor it for drill-down,
 * the same pattern every other GL-affecting loan event uses. A no-op
 * (returns null) when the two statuses map to the same account, either
 * maps to no account (e.g. "closed"), or the balance is already zero —
 * closing a loan nets its receivable to zero through the repayment's own
 * posting, not a separate reclassification.
 */
export async function reclassifyLoanReceivable(
  tx: Prisma.TransactionClient,
  params: {
    loanAccountId: string;
    fromStatus: LoanStatus;
    toStatus: LoanStatus;
    outstandingBalance: number;
    performedBy: { id: string; name: string };
  }
) {
  const fromAccount = receivableAccountForStatus(params.fromStatus);
  const toAccount = receivableAccountForStatus(params.toStatus);
  if (!fromAccount || !toAccount || fromAccount === toAccount) return null;
  if (params.outstandingBalance <= 0.01) return null;

  const loanTxn = await tx.loanTransaction.create({
    data: {
      loanAccountId: params.loanAccountId,
      type: "reclassify",
      amount: params.outstandingBalance,
      balanceAfter: params.outstandingBalance,
      createdById: params.performedBy.id,
    },
  });

  await postLedgerBatch(tx, {
    sourceType: "loan",
    loanTransactionId: loanTxn.id,
    createdById: params.performedBy.id,
    memo: `Portfolio at Risk reclassification: ${params.fromStatus} -> ${params.toStatus}`,
    lines: [
      { accountCode: toAccount, debit: params.outstandingBalance },
      { accountCode: fromAccount, credit: params.outstandingBalance },
    ],
  });

  await writeAuditLog(tx, {
    entityType: "LoanTransaction",
    entityId: loanTxn.id,
    action: "create",
    newValue: loanTxn,
    performedBy: params.performedBy,
  });

  return loanTxn;
}
