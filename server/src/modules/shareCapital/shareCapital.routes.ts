import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { writeAuditLog } from "../../lib/audit";
import { badRequest, conflict, notFound } from "../../lib/httpError";
import { postLedgerBatch } from "../../lib/ledger";
import { ACCOUNTS } from "../../lib/accounts";

export const shareCapitalRouter = Router();
shareCapitalRouter.use(requireAuth);

const createTxnSchema = z.object({
  memberId: z.string().uuid(),
  type: z.enum(["subscription", "additional_purchase", "withdrawal", "transfer", "dividend"]),
  amount: z.coerce.number().positive(),
});

// Deposits into share capital (money coming in). Withdrawals/transfers reduce it.
const INFLOW_TYPES = new Set(["subscription", "additional_purchase", "dividend"]);

async function recomputeBalance(tx: any, accountId: string) {
  const posted = await tx.shareCapitalTransaction.findMany({
    where: { shareCapitalAccountId: accountId, status: "posted" },
  });
  const balance = posted.reduce((sum: number, t: any) => {
    const amt = Number(t.amount);
    return sum + (INFLOW_TYPES.has(t.type) ? amt : -amt);
  }, 0);
  await tx.shareCapitalAccount.update({ where: { id: accountId }, data: { balance } });
  return balance;
}

shareCapitalRouter.get("/transactions", async (req, res) => {
  const { memberId, status } = req.query as { memberId?: string; status?: string };
  const txns = await prisma.shareCapitalTransaction.findMany({
    where: {
      status: status ? (status as any) : undefined,
      account: memberId ? { memberId } : undefined,
    },
    include: { account: { include: { member: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(txns);
});

shareCapitalRouter.get("/transactions/:id", async (req, res) => {
  const txn = await prisma.shareCapitalTransaction.findUnique({
    where: { id: req.params.id },
    include: { account: { include: { member: true } }, ledgerEntries: true },
  });
  if (!txn) throw notFound("Share capital transaction not found");
  res.json(txn);
});

// Recording a subscription/withdrawal/etc — starts life as `pending` (spec 4.2).
shareCapitalRouter.post(
  "/transactions",
  requireRole("cashier", "accountant", "manager", "admin"),
  async (req, res) => {
    const data = createTxnSchema.parse(req.body);

    const account = await prisma.shareCapitalAccount.findUnique({ where: { memberId: data.memberId } });
    if (!account) throw notFound("Member has no share capital account");

    if (!INFLOW_TYPES.has(data.type) && Number(account.balance) < data.amount) {
      throw badRequest("Withdrawal/transfer amount exceeds current share capital balance");
    }

    const created = await prisma.$transaction(async (tx) => {
      const txn = await tx.shareCapitalTransaction.create({
        data: {
          shareCapitalAccountId: account.id,
          type: data.type,
          amount: data.amount,
          status: "pending",
          createdById: req.user!.id,
        },
      });
      await writeAuditLog(tx, {
        entityType: "ShareCapitalTransaction",
        entityId: txn.id,
        action: "create",
        newValue: txn,
        performedBy: { id: req.user!.id, name: req.user!.name },
      });
      return txn;
    });

    res.status(201).json(created);
  }
);

// Approval + auto-posting to the ledger — manager only (spec 4.2).
shareCapitalRouter.post(
  "/transactions/:id/approve",
  requireRole("manager", "admin"),
  async (req, res) => {
    const existing = await prisma.shareCapitalTransaction.findUnique({
      where: { id: req.params.id },
      include: { account: true },
    });
    if (!existing) throw notFound("Share capital transaction not found");
    if (existing.status !== "pending") throw conflict("Only pending transactions can be approved");

    const result = await prisma.$transaction(async (tx) => {
      const approved = await tx.shareCapitalTransaction.update({
        where: { id: existing.id },
        data: { status: "approved", approvedById: req.user!.id, approvedAt: new Date() },
      });
      await writeAuditLog(tx, {
        entityType: "ShareCapitalTransaction",
        entityId: approved.id,
        action: "approve",
        previousValue: { status: existing.status },
        newValue: { status: approved.status },
        performedBy: { id: req.user!.id, name: req.user!.name },
      });

      const isInflow = INFLOW_TYPES.has(existing.type);
      const amount = Number(existing.amount);
      await postLedgerBatch(tx, {
        sourceType: "share_capital",
        shareCapitalTransactionId: approved.id,
        createdById: req.user!.id,
        memo: `${existing.type} — share capital`,
        lines: isInflow
          ? [
              { accountCode: ACCOUNTS.CASH_ON_HAND, debit: amount },
              { accountCode: ACCOUNTS.MEMBERS_SHARE_CAPITAL, credit: amount },
            ]
          : [
              { accountCode: ACCOUNTS.MEMBERS_SHARE_CAPITAL, debit: amount },
              { accountCode: ACCOUNTS.CASH_ON_HAND, credit: amount },
            ],
      });

      const posted = await tx.shareCapitalTransaction.update({
        where: { id: approved.id },
        data: { status: "posted" },
      });
      await writeAuditLog(tx, {
        entityType: "ShareCapitalTransaction",
        entityId: posted.id,
        action: "update",
        previousValue: { status: "approved" },
        newValue: { status: "posted" },
        performedBy: { id: req.user!.id, name: req.user!.name },
      });

      const balance = await recomputeBalance(tx, existing.shareCapitalAccountId);
      return { ...posted, accountBalance: balance };
    });

    res.json(result);
  }
);

shareCapitalRouter.post(
  "/transactions/:id/reject",
  requireRole("manager", "admin"),
  async (req, res) => {
    const existing = await prisma.shareCapitalTransaction.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound("Share capital transaction not found");
    if (existing.status !== "pending") throw conflict("Only pending transactions can be rejected");

    const updated = await prisma.$transaction(async (tx) => {
      const rejected = await tx.shareCapitalTransaction.update({
        where: { id: existing.id },
        data: { status: "rejected", approvedById: req.user!.id, approvedAt: new Date() },
      });
      await writeAuditLog(tx, {
        entityType: "ShareCapitalTransaction",
        entityId: rejected.id,
        action: "reject",
        previousValue: { status: existing.status },
        newValue: { status: rejected.status },
        performedBy: { id: req.user!.id, name: req.user!.name },
      });
      return rejected;
    });

    res.json(updated);
  }
);
