import { prisma } from "./prisma";
import { conflict } from "./httpError";

/**
 * An OR booklet is one physically numbered sequence a cashier issues
 * from regardless of what the payment was for — a loan repayment, a
 * deposit, and a share capital subscription can't legitimately carry
 * the same OR# even though each lives in its own column on its own
 * table. Each column already has its own DB-level unique constraint;
 * this adds the cross-table check Postgres can't express directly.
 * Not called from a transaction, so there's a narrow race window
 * between this check and the eventual write — acceptable here since
 * each table's own unique index is the actual backstop against a
 * genuine double-use, same trade-off cash.routes.ts's existing
 * official-receipt-number check already makes.
 */
export async function assertOfficialReceiptNumberAvailable(officialReceiptNumber: string): Promise<void> {
  const [cash, loan, deposit, shareCapital] = await Promise.all([
    prisma.cashTransaction.findFirst({ where: { officialReceiptNumber } }),
    prisma.loanTransaction.findFirst({ where: { officialReceiptNumber } }),
    prisma.depositTransaction.findFirst({ where: { officialReceiptNumber } }),
    prisma.shareCapitalTransaction.findFirst({ where: { officialReceiptNumber } }),
  ]);
  if (cash || loan || deposit || shareCapital) {
    throw conflict("Official receipt number has already been used");
  }
}
