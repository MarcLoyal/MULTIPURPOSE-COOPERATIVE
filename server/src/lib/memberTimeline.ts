import { prisma } from "./prisma";

/**
 * "Lahat ng Transaksyon" (All Transactions) — one flat, chronological
 * timeline of every money-moving event already linked to a member:
 * loan releases/repayments/penalties, deposit transactions, and share
 * capital transactions, each annotated with its receipt or
 * disbursement voucher when one has been issued.
 *
 * No single table holds this — Receipt and DisbursementVoucher have a
 * direct memberId, but LoanTransaction/DepositTransaction/
 * ShareCapitalTransaction are each one hop away via their parent
 * account — so this runs 5 queries scoped to the member and merges
 * them in app code, sorted newest first. There is no existing endpoint
 * this reuses; it's net new (see memberStatement.ts for the
 * per-bucket statement this sits alongside, not replaces).
 */

type ReferenceDoc = { kind: "receipt" | "voucher"; id: string; sequenceNumber: number } | null;

export type TimelineEntry = {
  date: Date;
  type: string;
  amount: number;
  reference: ReferenceDoc;
  linkTo: string | null;
};

export async function buildMemberTimeline(memberId: string): Promise<TimelineEntry[]> {
  const [loanTxns, depositTxns, shareCapitalTxns, receipts, vouchers] = await Promise.all([
    prisma.loanTransaction.findMany({
      where: { loanAccount: { memberId } },
      select: { id: true, loanAccountId: true, type: true, amount: true, createdAt: true },
    }),
    prisma.depositTransaction.findMany({
      where: { depositAccount: { memberId } },
      select: { id: true, depositAccountId: true, type: true, amount: true, createdAt: true },
    }),
    prisma.shareCapitalTransaction.findMany({
      where: { account: { memberId }, status: "posted" },
      select: { id: true, type: true, amount: true, createdAt: true },
    }),
    prisma.receipt.findMany({
      where: { memberId, status: "active" },
      select: { id: true, sequenceNumber: true, loanTransactionId: true, depositTransactionId: true, shareCapitalTransactionId: true },
    }),
    prisma.disbursementVoucher.findMany({
      where: { memberId, status: "active" },
      select: { id: true, sequenceNumber: true, loanTransactionId: true, depositTransactionId: true, shareCapitalTransactionId: true },
    }),
  ]);

  const receiptByLoanTxn = new Map(receipts.filter((r) => r.loanTransactionId).map((r) => [r.loanTransactionId!, r]));
  const receiptByDepositTxn = new Map(receipts.filter((r) => r.depositTransactionId).map((r) => [r.depositTransactionId!, r]));
  const receiptByShareCapitalTxn = new Map(
    receipts.filter((r) => r.shareCapitalTransactionId).map((r) => [r.shareCapitalTransactionId!, r])
  );
  const voucherByLoanTxn = new Map(vouchers.filter((v) => v.loanTransactionId).map((v) => [v.loanTransactionId!, v]));
  const voucherByDepositTxn = new Map(vouchers.filter((v) => v.depositTransactionId).map((v) => [v.depositTransactionId!, v]));
  const voucherByShareCapitalTxn = new Map(
    vouchers.filter((v) => v.shareCapitalTransactionId).map((v) => [v.shareCapitalTransactionId!, v])
  );

  const entries: TimelineEntry[] = [];

  for (const t of loanTxns) {
    const receipt = receiptByLoanTxn.get(t.id);
    const voucher = voucherByLoanTxn.get(t.id);
    const reference: ReferenceDoc = voucher
      ? { kind: "voucher", id: voucher.id, sequenceNumber: voucher.sequenceNumber }
      : receipt
        ? { kind: "receipt", id: receipt.id, sequenceNumber: receipt.sequenceNumber }
        : null;
    entries.push({
      date: t.createdAt,
      type: `loan_${t.type}`,
      amount: Number(t.amount),
      reference,
      linkTo: reference
        ? reference.kind === "voucher"
          ? `/disbursement-vouchers/${reference.id}`
          : `/receipts/${reference.id}`
        : `/loans/${t.loanAccountId}`,
    });
  }

  for (const t of depositTxns) {
    const receipt = receiptByDepositTxn.get(t.id);
    const voucher = voucherByDepositTxn.get(t.id);
    const reference: ReferenceDoc = voucher
      ? { kind: "voucher", id: voucher.id, sequenceNumber: voucher.sequenceNumber }
      : receipt
        ? { kind: "receipt", id: receipt.id, sequenceNumber: receipt.sequenceNumber }
        : null;
    entries.push({
      date: t.createdAt,
      type: `deposit_${t.type}`,
      amount: Number(t.amount),
      reference,
      linkTo: reference
        ? reference.kind === "voucher"
          ? `/disbursement-vouchers/${reference.id}`
          : `/receipts/${reference.id}`
        : `/deposits/${t.depositAccountId}`,
    });
  }

  for (const t of shareCapitalTxns) {
    const receipt = receiptByShareCapitalTxn.get(t.id);
    const voucher = voucherByShareCapitalTxn.get(t.id);
    const reference: ReferenceDoc = voucher
      ? { kind: "voucher", id: voucher.id, sequenceNumber: voucher.sequenceNumber }
      : receipt
        ? { kind: "receipt", id: receipt.id, sequenceNumber: receipt.sequenceNumber }
        : null;
    entries.push({
      date: t.createdAt,
      type: `share_capital_${t.type}`,
      amount: Number(t.amount),
      reference,
      linkTo: reference ? (reference.kind === "voucher" ? `/disbursement-vouchers/${reference.id}` : `/receipts/${reference.id}`) : null,
    });
  }

  entries.sort((a, b) => b.date.getTime() - a.date.getTime());
  return entries;
}
