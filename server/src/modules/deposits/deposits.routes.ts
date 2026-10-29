import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole, requireStaff } from "../../middleware/auth";
import { writeAuditLog } from "../../lib/audit";
import { badRequest, conflict, notFound } from "../../lib/httpError";
import { postLedgerBatch } from "../../lib/ledger";
import { ACCOUNTS } from "../../lib/accounts";
import { round2 } from "../../lib/loanSchedule";

export const depositsRouter = Router();
depositsRouter.use(requireAuth, requireStaff);

function receivableAccountForDepositType(type: "savings" | "time"): string {
  return type === "time" ? ACCOUNTS.TIME_DEPOSITS : ACCOUNTS.SAVINGS_DEPOSITS;
}

// ---------------------------------------------------------------------------
// Deposit products (board-approved, same convention as LoanProduct): rate,
// term, and computation basis are per-product data a manager/accountant/
// admin sets up, never a hard-coded constant (report gap-analysis item 3).
// ---------------------------------------------------------------------------

const createProductSchema = z
  .object({
    name: z.string().min(1),
    type: z.enum(["savings", "time"]),
    interestRate: z.coerce.number().min(0),
    computationBasis: z
      .enum(["daily_balance", "average_daily_balance", "lowest_monthly_balance", "month_end_balance"])
      .optional(),
    creditingFrequencyMonths: z.coerce.number().int().positive().optional(),
    minimumBalance: z.coerce.number().min(0).optional(),
    termMonths: z.coerce.number().int().positive().optional(),
    preTerminationPenaltyRate: z.coerce.number().min(0).max(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "time" && !data.termMonths) {
      ctx.addIssue({ code: "custom", path: ["termMonths"], message: "termMonths is required for time deposits" });
    }
    if (data.type === "savings" && data.termMonths) {
      ctx.addIssue({ code: "custom", path: ["termMonths"], message: "termMonths does not apply to savings deposits" });
    }
  });

depositsRouter.get("/products", async (_req, res) => {
  const products = await prisma.depositProduct.findMany({ orderBy: { name: "asc" } });
  res.json(products);
});

depositsRouter.post(
  "/products",
  requireRole("manager", "accountant", "admin"),
  async (req, res) => {
    const data = createProductSchema.parse(req.body);

    const created = await prisma.$transaction(async (tx) => {
      const product = await tx.depositProduct.create({
        data: {
          name: data.name,
          type: data.type,
          interestRate: data.interestRate,
          computationBasis: data.computationBasis,
          creditingFrequencyMonths: data.creditingFrequencyMonths,
          minimumBalance: data.minimumBalance,
          // Time deposits only — forced null for savings regardless of
          // what was sent, matching the schema's own "null for savings"
          // convention (DepositProduct.termMonths doc comment).
          termMonths: data.type === "time" ? data.termMonths : null,
          preTerminationPenaltyRate: data.type === "time" ? data.preTerminationPenaltyRate : null,
        },
      });
      await writeAuditLog(tx, {
        entityType: "DepositProduct",
        entityId: product.id,
        action: "create",
        newValue: product,
        performedBy: { id: req.user!.id, name: req.user!.name },
      });
      return product;
    });

    res.status(201).json(created);
  }
);

const patchProductSchema = z.object({ isActive: z.boolean() });

// Only isActive is editable after creation — changing rate/term/basis on
// a product that already has live accounts under it would silently
// reinterpret those members' existing contracts. Deactivating stops new
// accounts from opening under it without touching anything already open.
depositsRouter.patch(
  "/products/:id",
  requireRole("manager", "accountant", "admin"),
  async (req, res) => {
    const { isActive } = patchProductSchema.parse(req.body);
    const existing = await prisma.depositProduct.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound("Deposit product not found");

    const updated = await prisma.$transaction(async (tx) => {
      const product = await tx.depositProduct.update({ where: { id: existing.id }, data: { isActive } });
      if (existing.isActive !== isActive) {
        await writeAuditLog(tx, {
          entityType: "DepositProduct",
          entityId: product.id,
          action: "update",
          previousValue: { isActive: existing.isActive },
          newValue: { isActive: product.isActive },
          performedBy: { id: req.user!.id, name: req.user!.name },
        });
      }
      return product;
    });

    res.json(updated);
  }
);

// ---------------------------------------------------------------------------
// Deposit accounts and transactions.
// ---------------------------------------------------------------------------

depositsRouter.get("/accounts", async (req, res) => {
  const { memberId } = req.query as { memberId?: string };
  const accounts = await prisma.depositAccount.findMany({
    where: { memberId: memberId || undefined },
    include: { member: true, depositProduct: true },
    orderBy: { openedAt: "desc" },
  });
  res.json(accounts);
});

depositsRouter.get("/accounts/:id", async (req, res) => {
  const account = await prisma.depositAccount.findUnique({
    where: { id: req.params.id },
    include: {
      member: true,
      depositProduct: true,
      transactions: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!account) throw notFound("Deposit account not found");
  res.json(account);
});

const openAccountSchema = z.object({
  memberId: z.string().uuid(),
  depositProductId: z.string().uuid(),
  openingDeposit: z.coerce.number().min(0).optional(),
});

depositsRouter.post(
  "/accounts",
  requireRole("cashier", "manager", "admin"),
  async (req, res) => {
    const data = openAccountSchema.parse(req.body);

    const member = await prisma.member.findUnique({ where: { id: data.memberId } });
    if (!member) throw notFound("Member not found");

    const product = await prisma.depositProduct.findUnique({ where: { id: data.depositProductId } });
    if (!product) throw notFound("Deposit product not found");
    if (!product.isActive) throw badRequest("This deposit product is no longer active");

    const openingDeposit = round2(data.openingDeposit ?? 0);

    const result = await prisma.$transaction(async (tx) => {
      const account = await tx.depositAccount.create({
        data: {
          memberId: data.memberId,
          depositProductId: data.depositProductId,
          balance: openingDeposit,
        },
      });
      await writeAuditLog(tx, {
        entityType: "DepositAccount",
        entityId: account.id,
        action: "create",
        newValue: account,
        performedBy: { id: req.user!.id, name: req.user!.name },
      });

      if (openingDeposit > 0) {
        const txn = await tx.depositTransaction.create({
          data: {
            depositAccountId: account.id,
            type: "deposit",
            amount: openingDeposit,
            balanceAfter: openingDeposit,
            createdById: req.user!.id,
          },
        });
        await postLedgerBatch(tx, {
          sourceType: "deposit",
          depositTransactionId: txn.id,
          createdById: req.user!.id,
          memo: `Deposit account opened — ${product.name}`,
          lines: [
            { accountCode: ACCOUNTS.CASH_ON_HAND, debit: openingDeposit },
            { accountCode: receivableAccountForDepositType(product.type), credit: openingDeposit },
          ],
        });
        await writeAuditLog(tx, {
          entityType: "DepositTransaction",
          entityId: txn.id,
          action: "create",
          newValue: txn,
          performedBy: { id: req.user!.id, name: req.user!.name },
        });
      }

      return account;
    });

    res.status(201).json(result);
  }
);

const txnSchema = z.object({
  type: z.enum(["deposit", "withdrawal"]),
  amount: z.coerce.number().positive(),
});

// cashier records a deposit or withdrawal — immediate, no approval step,
// same convention as loan repayments (a teller-window transaction, not a
// share-capital-style pending/approve workflow).
depositsRouter.post(
  "/accounts/:id/transactions",
  requireRole("cashier", "admin"),
  async (req, res) => {
    const { type, amount } = txnSchema.parse(req.body);
    const account = await prisma.depositAccount.findUnique({
      where: { id: req.params.id },
      include: { depositProduct: true },
    });
    if (!account) throw notFound("Deposit account not found");
    if (account.status !== "active") throw conflict("Only active deposit accounts can be transacted on");

    const balance = Number(account.balance);
    const roundedAmount = round2(amount);
    const accountCode = receivableAccountForDepositType(account.depositProduct.type);

    let balanceAfter: number;
    let ledgerLines: { accountCode: string; debit?: number; credit?: number }[];

    if (type === "deposit") {
      balanceAfter = round2(balance + roundedAmount);
      ledgerLines = [
        { accountCode: ACCOUNTS.CASH_ON_HAND, debit: roundedAmount },
        { accountCode, credit: roundedAmount },
      ];
    } else {
      const minimumBalance = Number(account.depositProduct.minimumBalance);
      const availableToWithdraw = round2(balance - minimumBalance);
      if (roundedAmount > availableToWithdraw + 0.01) {
        throw badRequest(
          `Withdrawal amount exceeds what's available (${availableToWithdraw.toFixed(2)}) above the ` +
            `product's minimum balance of ${minimumBalance.toFixed(2)}. To withdraw everything, close the account instead.`
        );
      }
      balanceAfter = round2(balance - roundedAmount);
      ledgerLines = [
        { accountCode, debit: roundedAmount },
        { accountCode: ACCOUNTS.CASH_ON_HAND, credit: roundedAmount },
      ];
    }

    const result = await prisma.$transaction(async (tx) => {
      const txn = await tx.depositTransaction.create({
        data: {
          depositAccountId: account.id,
          type,
          amount: roundedAmount,
          balanceAfter,
          createdById: req.user!.id,
        },
      });
      await postLedgerBatch(tx, {
        sourceType: "deposit",
        depositTransactionId: txn.id,
        createdById: req.user!.id,
        memo: `${type === "deposit" ? "Deposit" : "Withdrawal"} — ${account.depositProduct.name}`,
        lines: ledgerLines as any,
      });
      await tx.depositAccount.update({ where: { id: account.id }, data: { balance: balanceAfter } });
      await writeAuditLog(tx, {
        entityType: "DepositTransaction",
        entityId: txn.id,
        action: "create",
        newValue: txn,
        performedBy: { id: req.user!.id, name: req.user!.name },
      });
      return txn;
    });

    res.status(201).json(result);
  }
);

// Closes an account, paying out whatever remains. A time deposit closed
// before its term matures incurs the product's pre-termination penalty
// (schema's own DepositTxnType.pretermination_penalty) — posted as its
// own ledger batch before the payout batch, so each batch stays balanced
// and anchored to exactly one DepositTransaction, the same invariant
// every other ledger-posting event in this app follows.
depositsRouter.post(
  "/accounts/:id/close",
  requireRole("cashier", "admin"),
  async (req, res) => {
    const account = await prisma.depositAccount.findUnique({
      where: { id: req.params.id },
      include: { depositProduct: true },
    });
    if (!account) throw notFound("Deposit account not found");
    if (account.status !== "active") throw conflict("Account is already closed");

    const balance = Number(account.balance);
    const product = account.depositProduct;
    const accountCode = receivableAccountForDepositType(product.type);

    let penalty = 0;
    if (product.type === "time" && product.preTerminationPenaltyRate && product.termMonths) {
      const maturityDate = new Date(account.openedAt);
      maturityDate.setMonth(maturityDate.getMonth() + product.termMonths);
      if (new Date() < maturityDate) {
        penalty = round2(balance * Number(product.preTerminationPenaltyRate));
      }
    }
    const netPayout = round2(balance - penalty);

    const result = await prisma.$transaction(async (tx) => {
      if (penalty > 0) {
        const penaltyTxn = await tx.depositTransaction.create({
          data: {
            depositAccountId: account.id,
            type: "pretermination_penalty",
            amount: penalty,
            balanceAfter: round2(balance - penalty),
            createdById: req.user!.id,
          },
        });
        await postLedgerBatch(tx, {
          sourceType: "deposit",
          depositTransactionId: penaltyTxn.id,
          createdById: req.user!.id,
          memo: `Pre-termination penalty — ${product.name}`,
          lines: [
            { accountCode, debit: penalty },
            { accountCode: ACCOUNTS.PENALTY_INCOME, credit: penalty },
          ],
        });
        await writeAuditLog(tx, {
          entityType: "DepositTransaction",
          entityId: penaltyTxn.id,
          action: "create",
          newValue: penaltyTxn,
          performedBy: { id: req.user!.id, name: req.user!.name },
        });
      }

      if (netPayout > 0) {
        const withdrawalTxn = await tx.depositTransaction.create({
          data: {
            depositAccountId: account.id,
            type: "withdrawal",
            amount: netPayout,
            balanceAfter: 0,
            createdById: req.user!.id,
          },
        });
        await postLedgerBatch(tx, {
          sourceType: "deposit",
          depositTransactionId: withdrawalTxn.id,
          createdById: req.user!.id,
          memo: `Account closure payout — ${product.name}`,
          lines: [
            { accountCode, debit: netPayout },
            { accountCode: ACCOUNTS.CASH_ON_HAND, credit: netPayout },
          ],
        });
        await writeAuditLog(tx, {
          entityType: "DepositTransaction",
          entityId: withdrawalTxn.id,
          action: "create",
          newValue: withdrawalTxn,
          performedBy: { id: req.user!.id, name: req.user!.name },
        });
      }

      const closed = await tx.depositAccount.update({
        where: { id: account.id },
        data: { balance: 0, status: "closed", closedAt: new Date() },
      });
      await writeAuditLog(tx, {
        entityType: "DepositAccount",
        entityId: closed.id,
        action: "update",
        previousValue: { status: "active" },
        newValue: { status: "closed" },
        performedBy: { id: req.user!.id, name: req.user!.name },
      });

      return closed;
    });

    res.json({ ...result, penaltyCharged: penalty, netPayout });
  }
);

/**
 * Manual, per-account interest crediting (manager/accountant/admin —
 * same gate as posting the allowance report). Computes one crediting
 * period's interest on the account's CURRENT balance at the product's
 * rate. That is exactly the product's own stated computation only for
 * "month_end_balance" basis run at an actual month end with no
 * intervening transactions — "daily_balance"/"average_daily_balance"/
 * "lowest_monthly_balance" need a daily balance history this schema
 * doesn't capture yet, so this is flagged on the response rather than
 * silently presented as a true daily-weighted figure (same honesty
 * pattern as the loan disclosure statement's flat-rate caveat).
 */
depositsRouter.post(
  "/accounts/:id/credit-interest",
  requireRole("manager", "accountant", "admin"),
  async (req, res) => {
    const account = await prisma.depositAccount.findUnique({
      where: { id: req.params.id },
      include: { depositProduct: true },
    });
    if (!account) throw notFound("Deposit account not found");
    if (account.status !== "active") throw conflict("Only active deposit accounts can earn interest");

    const balance = Number(account.balance);
    const product = account.depositProduct;
    const interestAmount = round2(balance * Number(product.interestRate));

    if (interestAmount <= 0) {
      return res.json({ credited: false, message: "Computed interest is zero at the current balance/rate — nothing to post." });
    }

    const accountCode = receivableAccountForDepositType(product.type);
    const balanceAfter = round2(balance + interestAmount);

    const result = await prisma.$transaction(async (tx) => {
      const txn = await tx.depositTransaction.create({
        data: {
          depositAccountId: account.id,
          type: "interest_credit",
          amount: interestAmount,
          balanceAfter,
          createdById: req.user!.id,
        },
      });
      await postLedgerBatch(tx, {
        sourceType: "deposit",
        depositTransactionId: txn.id,
        createdById: req.user!.id,
        memo: `Interest credit — ${product.name}`,
        lines: [
          { accountCode: ACCOUNTS.INTEREST_EXPENSE_ON_DEPOSITS, debit: interestAmount },
          { accountCode, credit: interestAmount },
        ],
      });
      await tx.depositAccount.update({ where: { id: account.id }, data: { balance: balanceAfter } });
      await writeAuditLog(tx, {
        entityType: "DepositTransaction",
        entityId: txn.id,
        action: "create",
        newValue: txn,
        performedBy: { id: req.user!.id, name: req.user!.name },
      });
      return txn;
    });

    res.json({
      credited: true,
      transaction: result,
      isApproximate: product.computationBasis !== "month_end_balance",
      note:
        product.computationBasis !== "month_end_balance"
          ? `This product's computation basis is "${product.computationBasis}", which needs a daily balance history to compute precisely — not yet tracked. This figure is interest on the CURRENT balance for one crediting period, not a true ${product.computationBasis.replace(/_/g, " ")} calculation.`
          : "Exact for month-end balance only when run at an actual month end with no later transactions.",
    });
  }
);
