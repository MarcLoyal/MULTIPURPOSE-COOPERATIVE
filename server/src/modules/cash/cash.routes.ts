import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { writeAuditLog } from "../../lib/audit";
import { conflict } from "../../lib/httpError";
import { postLedgerBatch } from "../../lib/ledger";
import { ACCOUNTS } from "../../lib/accounts";

export const cashRouter = Router();
cashRouter.use(requireAuth);

const createCashTxnSchema = z.object({
  type: z.enum(["collection", "disbursement", "petty_cash", "cash_advance", "bank_deposit"]),
  amount: z.coerce.number().positive(),
  referenceType: z.string().optional(),
  officialReceiptNumber: z.string().min(1),
});

cashRouter.get("/transactions", async (req, res) => {
  const { type } = req.query as { type?: string };
  const txns = await prisma.cashTransaction.findMany({
    where: { type: type ? (type as any) : undefined },
    orderBy: { createdAt: "desc" },
  });
  res.json(txns);
});

/**
 * General cash journal entry (petty cash, cash advances, bank deposits, and
 * standalone collections/disbursements not already posted by the Lending
 * or Share Capital modules — those two post their own ledger entries
 * directly to avoid double-posting the same cash movement). Segregation
 * of duties: cashier can create these, but has no approve endpoint
 * anywhere in the system (enforced server-side via requireRole).
 */
cashRouter.post("/transactions", requireRole("cashier", "accountant", "admin"), async (req, res) => {
  const data = createCashTxnSchema.parse(req.body);

  const existingOr = await prisma.cashTransaction.findFirst({
    where: { officialReceiptNumber: data.officialReceiptNumber },
  });
  if (existingOr) throw conflict("Official receipt number has already been used");

  const isInflow = data.type === "collection" || data.type === "bank_deposit";
  const contraAccount =
    data.type === "petty_cash"
      ? ACCOUNTS.PETTY_CASH_FUND
      : data.type === "cash_advance"
      ? ACCOUNTS.CASH_ADVANCES
      : data.type === "bank_deposit"
      ? ACCOUNTS.CASH_IN_BANK
      : data.type === "collection"
      ? ACCOUNTS.OTHER_INCOME
      : ACCOUNTS.OTHER_EXPENSE;

  const result = await prisma.$transaction(async (tx) => {
    const txn = await tx.cashTransaction.create({
      data: {
        type: data.type,
        amount: data.amount,
        referenceType: data.referenceType,
        officialReceiptNumber: data.officialReceiptNumber,
        createdById: req.user!.id,
      },
    });

    await postLedgerBatch(tx, {
      sourceType: "cash",
      cashTransactionId: txn.id,
      createdById: req.user!.id,
      memo: `${data.type} — OR#${data.officialReceiptNumber}`,
      lines:
        data.type === "bank_deposit"
          ? [
              { accountCode: ACCOUNTS.CASH_IN_BANK, debit: data.amount },
              { accountCode: ACCOUNTS.CASH_ON_HAND, credit: data.amount },
            ]
          : isInflow
          ? [
              { accountCode: ACCOUNTS.CASH_ON_HAND, debit: data.amount },
              { accountCode: contraAccount, credit: data.amount },
            ]
          : [
              { accountCode: contraAccount, debit: data.amount },
              { accountCode: ACCOUNTS.CASH_ON_HAND, credit: data.amount },
            ],
    });

    await writeAuditLog(tx, {
      entityType: "CashTransaction",
      entityId: txn.id,
      action: "create",
      newValue: txn,
      performedBy: { id: req.user!.id, name: req.user!.name },
    });

    return txn;
  });

  res.status(201).json(result);
});
