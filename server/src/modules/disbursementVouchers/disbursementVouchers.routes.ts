import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole, requireStaff } from "../../middleware/auth";
import { writeAuditLog } from "../../lib/audit";
import { badRequest, conflict, notFound } from "../../lib/httpError";
import { issueVoucher } from "../../lib/disbursementVouchers";
import { amountToPesoWords } from "../../lib/numberToWords";

export const disbursementVouchersRouter = Router();
disbursementVouchersRouter.use(requireAuth, requireStaff);

// Every role that can record one of the three disbursement types this
// module issues vouchers for — the union of loans.routes.ts's release
// role, deposits.routes.ts's transaction role, and
// shareCapital.routes.ts's approve role. Mirrors receipts.routes.ts's
// RECEIPT_ROLES for the same reason: whoever could have recorded the
// disbursement can also issue or void its voucher.
const VOUCHER_ROLES = ["cashier", "manager", "admin"] as const;

const createSchema = z
  .object({
    loanTransactionId: z.string().uuid().optional(),
    depositTransactionId: z.string().uuid().optional(),
    shareCapitalTransactionId: z.string().uuid().optional(),
  })
  .refine(
    (data) =>
      [data.loanTransactionId, data.depositTransactionId, data.shareCapitalTransactionId].filter(Boolean)
        .length === 1,
    { message: "Provide exactly one of loanTransactionId, depositTransactionId, or shareCapitalTransactionId" }
  );

/**
 * Issues a disbursement voucher for an already-recorded outflow — a
 * separate, later action from recording the disbursement itself, same
 * relationship issueReceipt() has to its underlying payment (see
 * lib/disbursementVouchers.ts). Each transaction can have at most one
 * voucher ever (the DB's unique constraint on each …TransactionId
 * column) — voiding one doesn't free it up for a second.
 */
disbursementVouchersRouter.post("/", requireRole(...VOUCHER_ROLES), async (req, res) => {
  const data = createSchema.parse(req.body);

  if (data.loanTransactionId) {
    const existing = await prisma.disbursementVoucher.findUnique({
      where: { loanTransactionId: data.loanTransactionId },
    });
    if (existing) throw conflict("This loan release already has a disbursement voucher");
    const txn = await prisma.loanTransaction.findUnique({
      where: { id: data.loanTransactionId },
      include: { loanAccount: true },
    });
    if (!txn) throw notFound("Loan transaction not found");
    if (txn.type !== "release") throw badRequest("Only a loan release can have a disbursement voucher");

    const voucher = await issueVoucher({
      sourceType: "loan_release",
      loanTransactionId: txn.id,
      amount: Number(txn.amount),
      memberId: txn.loanAccount.memberId,
      createdById: req.user!.id,
    });
    await writeAuditLog(prisma, {
      entityType: "DisbursementVoucher",
      entityId: voucher.id,
      action: "create",
      newValue: voucher,
      performedBy: { id: req.user!.id, name: req.user!.name },
    });
    return res.status(201).json(voucher);
  }

  if (data.depositTransactionId) {
    const existing = await prisma.disbursementVoucher.findUnique({
      where: { depositTransactionId: data.depositTransactionId },
    });
    if (existing) throw conflict("This withdrawal already has a disbursement voucher");
    const txn = await prisma.depositTransaction.findUnique({
      where: { id: data.depositTransactionId },
      include: { depositAccount: true },
    });
    if (!txn) throw notFound("Deposit transaction not found");
    if (txn.type !== "withdrawal") throw badRequest("Only a withdrawal can have a disbursement voucher");

    const voucher = await issueVoucher({
      sourceType: "deposit_withdrawal",
      depositTransactionId: txn.id,
      amount: Number(txn.amount),
      memberId: txn.depositAccount.memberId,
      createdById: req.user!.id,
    });
    await writeAuditLog(prisma, {
      entityType: "DisbursementVoucher",
      entityId: voucher.id,
      action: "create",
      newValue: voucher,
      performedBy: { id: req.user!.id, name: req.user!.name },
    });
    return res.status(201).json(voucher);
  }

  const existing = await prisma.disbursementVoucher.findUnique({
    where: { shareCapitalTransactionId: data.shareCapitalTransactionId },
  });
  if (existing) throw conflict("This withdrawal already has a disbursement voucher");
  const txn = await prisma.shareCapitalTransaction.findUnique({
    where: { id: data.shareCapitalTransactionId },
    include: { account: true },
  });
  if (!txn) throw notFound("Share capital transaction not found");
  if (txn.type !== "withdrawal") throw badRequest("Only a withdrawal can have a disbursement voucher");
  if (txn.status !== "posted") throw badRequest("Only a posted transaction can have a disbursement voucher");

  const voucher = await issueVoucher({
    sourceType: "share_capital_withdrawal",
    shareCapitalTransactionId: txn.id,
    amount: Number(txn.amount),
    memberId: txn.account.memberId,
    createdById: req.user!.id,
  });
  await writeAuditLog(prisma, {
    entityType: "DisbursementVoucher",
    entityId: voucher.id,
    action: "create",
    newValue: voucher,
    performedBy: { id: req.user!.id, name: req.user!.name },
  });
  res.status(201).json(voucher);
});

/**
 * The printable page's data source. Increments printCount on every
 * call, same reasoning as receipts.routes.ts's GET /:id. Also resolves
 * the underlying transaction's actual ledger postings ("the account
 * entries" the printed voucher shows), by account label, and renders
 * the amount in words.
 */
disbursementVouchersRouter.get("/:id", async (req, res) => {
  const exists = await prisma.disbursementVoucher.findUnique({ where: { id: req.params.id } });
  if (!exists) throw notFound("Disbursement voucher not found");

  const voucher = await prisma.disbursementVoucher.update({
    where: { id: req.params.id },
    data: { printCount: { increment: 1 } },
    include: {
      member: true,
      loanTransaction: { include: { loanAccount: true, ledgerEntries: { include: { account: true } } } },
      depositTransaction: {
        include: { depositAccount: { include: { depositProduct: true } }, ledgerEntries: { include: { account: true } } },
      },
      shareCapitalTransaction: { include: { ledgerEntries: { include: { account: true } } } },
    },
  });

  const purpose =
    voucher.sourceType === "loan_release"
      ? `Loan Release — ${voucher.loanTransaction!.loanAccount.loanProduct}`
      : voucher.sourceType === "deposit_withdrawal"
        ? `Deposit Withdrawal — ${voucher.depositTransaction!.depositAccount.depositProduct.name}`
        : "Share Capital Withdrawal";

  const ledgerEntries =
    voucher.loanTransaction?.ledgerEntries ??
    voucher.depositTransaction?.ledgerEntries ??
    voucher.shareCapitalTransaction?.ledgerEntries ??
    [];

  const createdBy = await prisma.user.findUnique({ where: { id: voucher.createdById } });

  res.json({
    id: voucher.id,
    sequenceNumber: voucher.sequenceNumber,
    status: voucher.status,
    voidReason: voucher.voidReason,
    isReprint: voucher.printCount > 1,
    amount: Number(voucher.amount),
    amountInWords: amountToPesoWords(Number(voucher.amount)),
    date: voucher.createdAt,
    payeeName: voucher.member.fullName,
    memberNumber: voucher.member.memberNumber,
    purpose,
    accountEntries: ledgerEntries.map((e) => ({
      accountCode: e.accountCode,
      accountLabel: e.account.label,
      debit: Number(e.debit),
      credit: Number(e.credit),
    })),
    preparedByName: createdBy?.name ?? "—",
  });
});

const voidSchema = z.object({ reason: z.string().min(1) });

disbursementVouchersRouter.post("/:id/void", requireRole(...VOUCHER_ROLES), async (req, res) => {
  const { reason } = voidSchema.parse(req.body);
  const existing = await prisma.disbursementVoucher.findUnique({ where: { id: req.params.id } });
  if (!existing) throw notFound("Disbursement voucher not found");
  if (existing.status === "void") throw conflict("Disbursement voucher is already void");

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.disbursementVoucher.update({
      where: { id: existing.id },
      data: { status: "void", voidReason: reason, voidedById: req.user!.id, voidedAt: new Date() },
    });
    await writeAuditLog(tx, {
      entityType: "DisbursementVoucher",
      entityId: result.id,
      action: "update",
      previousValue: { status: "active" },
      newValue: { status: "void", voidReason: reason },
      performedBy: { id: req.user!.id, name: req.user!.name },
    });
    return result;
  });

  res.json(updated);
});
