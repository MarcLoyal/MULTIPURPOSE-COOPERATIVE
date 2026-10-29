import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole, requireStaff } from "../../middleware/auth";
import { writeAuditLog } from "../../lib/audit";
import { badRequest, conflict, notFound } from "../../lib/httpError";
import { issueReceipt } from "../../lib/receipts";
import { PAID_INFLOW_TYPES } from "../shareCapital/shareCapital.routes";

export const receiptsRouter = Router();
receiptsRouter.use(requireAuth, requireStaff);

// Every role that can record one of the three payment types this
// module issues receipts for — the union of loans.routes.ts's
// repayment role, deposits.routes.ts's transaction role, and
// shareCapital.routes.ts's approve role. Whoever could have recorded
// the payment can also issue or void its receipt.
const RECEIPT_ROLES = ["cashier", "accountant", "manager", "admin"] as const;

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
 * Issues a receipt for an already-recorded payment — a separate,
 * later action from recording the payment itself (see
 * lib/receipts.ts). Each transaction can have at most one receipt
 * ever (the DB's unique constraint on each …TransactionId column) —
 * voiding one doesn't free it up for a second. If the underlying
 * payment itself was wrong, this app has no transaction-correction
 * flow yet (matching how a posted ledger entry is never edited
 * elsewhere either) — voiding documents that the receipt shouldn't be
 * trusted, it doesn't undo the payment.
 */
receiptsRouter.post("/", requireRole(...RECEIPT_ROLES), async (req, res) => {
  const data = createSchema.parse(req.body);

  if (data.loanTransactionId) {
    const existing = await prisma.receipt.findUnique({ where: { loanTransactionId: data.loanTransactionId } });
    if (existing) throw conflict("This repayment already has a receipt");
    const txn = await prisma.loanTransaction.findUnique({
      where: { id: data.loanTransactionId },
      include: { loanAccount: true },
    });
    if (!txn) throw notFound("Loan transaction not found");
    if (txn.type !== "repayment") throw badRequest("Only a repayment can have a receipt");

    const receipt = await issueReceipt({
      sourceType: "loan_repayment",
      loanTransactionId: txn.id,
      amount: Number(txn.amount),
      memberId: txn.loanAccount.memberId,
      createdById: req.user!.id,
    });
    await writeAuditLog(prisma, {
      entityType: "Receipt",
      entityId: receipt.id,
      action: "create",
      newValue: receipt,
      performedBy: { id: req.user!.id, name: req.user!.name },
    });
    return res.status(201).json(receipt);
  }

  if (data.depositTransactionId) {
    const existing = await prisma.receipt.findUnique({ where: { depositTransactionId: data.depositTransactionId } });
    if (existing) throw conflict("This deposit already has a receipt");
    const txn = await prisma.depositTransaction.findUnique({
      where: { id: data.depositTransactionId },
      include: { depositAccount: true },
    });
    if (!txn) throw notFound("Deposit transaction not found");
    if (txn.type !== "deposit") throw badRequest("Only a deposit can have a receipt");

    const receipt = await issueReceipt({
      sourceType: "deposit",
      depositTransactionId: txn.id,
      amount: Number(txn.amount),
      memberId: txn.depositAccount.memberId,
      createdById: req.user!.id,
    });
    await writeAuditLog(prisma, {
      entityType: "Receipt",
      entityId: receipt.id,
      action: "create",
      newValue: receipt,
      performedBy: { id: req.user!.id, name: req.user!.name },
    });
    return res.status(201).json(receipt);
  }

  const existing = await prisma.receipt.findUnique({
    where: { shareCapitalTransactionId: data.shareCapitalTransactionId },
  });
  if (existing) throw conflict("This transaction already has a receipt");
  const txn = await prisma.shareCapitalTransaction.findUnique({
    where: { id: data.shareCapitalTransactionId },
    include: { account: true },
  });
  if (!txn) throw notFound("Share capital transaction not found");
  if (!PAID_INFLOW_TYPES.has(txn.type)) {
    throw badRequest("Only a subscription or additional purchase can have a receipt");
  }
  if (txn.status !== "posted") throw badRequest("Only a posted transaction can have a receipt");

  const receipt = await issueReceipt({
    sourceType: "share_capital",
    shareCapitalTransactionId: txn.id,
    amount: Number(txn.amount),
    memberId: txn.account.memberId,
    createdById: req.user!.id,
  });
  await writeAuditLog(prisma, {
    entityType: "Receipt",
    entityId: receipt.id,
    action: "create",
    newValue: receipt,
    performedBy: { id: req.user!.id, name: req.user!.name },
  });
  res.status(201).json(receipt);
});

/**
 * The printable page's data source. Increments printCount on every
 * call — this is the only consumer of this route, so each fetch is a
 * view of the printable page, and the client labels printCount > 1 a
 * reprint. An honest proxy for "was this printed again," not a
 * guarantee of what the browser's print dialog did.
 */
receiptsRouter.get("/:id", async (req, res) => {
  const exists = await prisma.receipt.findUnique({ where: { id: req.params.id } });
  if (!exists) throw notFound("Receipt not found");

  const receipt = await prisma.receipt.update({
    where: { id: req.params.id },
    data: { printCount: { increment: 1 } },
    include: {
      member: true,
      loanTransaction: { include: { loanAccount: true } },
      depositTransaction: { include: { depositAccount: { include: { depositProduct: true } } } },
      shareCapitalTransaction: true,
    },
  });

  const particulars =
    receipt.sourceType === "loan_repayment"
      ? `Loan Repayment — ${receipt.loanTransaction!.loanAccount.loanProduct}`
      : receipt.sourceType === "deposit"
        ? `Deposit — ${receipt.depositTransaction!.depositAccount.depositProduct.name}`
        : `Share Capital — ${receipt.shareCapitalTransaction!.type === "subscription" ? "Subscription" : "Additional Purchase"}`;

  const createdBy = await prisma.user.findUnique({ where: { id: receipt.createdById } });

  res.json({
    id: receipt.id,
    sequenceNumber: receipt.sequenceNumber,
    documentLabel: receipt.documentLabel,
    status: receipt.status,
    voidReason: receipt.voidReason,
    isReprint: receipt.printCount > 1,
    amount: Number(receipt.amount),
    date: receipt.createdAt,
    memberName: receipt.member.fullName,
    memberNumber: receipt.member.memberNumber,
    particulars,
    receivedByName: createdBy?.name ?? "—",
  });
});

const voidSchema = z.object({ reason: z.string().min(1) });

receiptsRouter.post("/:id/void", requireRole(...RECEIPT_ROLES), async (req, res) => {
  const { reason } = voidSchema.parse(req.body);
  const existing = await prisma.receipt.findUnique({ where: { id: req.params.id } });
  if (!existing) throw notFound("Receipt not found");
  if (existing.status === "void") throw conflict("Receipt is already void");

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.receipt.update({
      where: { id: existing.id },
      data: { status: "void", voidReason: reason, voidedById: req.user!.id, voidedAt: new Date() },
    });
    await writeAuditLog(tx, {
      entityType: "Receipt",
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
