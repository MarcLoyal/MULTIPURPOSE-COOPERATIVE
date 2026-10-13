import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { writeAuditLog } from "../../lib/audit";
import { badRequest, conflict, notFound } from "../../lib/httpError";
import { postLedgerBatch } from "../../lib/ledger";
import { ACCOUNTS } from "../../lib/accounts";
import {
  computeAging,
  computeLoanSchedule,
  computeOutstandingPrincipal,
  splitRepayment,
  round2,
} from "../../lib/loanSchedule";
import { receivableAccountForStatus, reclassifyLoanReceivable } from "../../lib/loanReceivable";

export const loansRouter = Router();
loansRouter.use(requireAuth);

const applySchema = z.object({
  memberId: z.string().uuid(),
  loanProduct: z.string().min(1),
  // Optional: links the loan to a board-approved LoanProduct, whose
  // computationMethod is snapshotted onto the loan. The client has no
  // product picker yet (out of scope for Phase 0), so this is normally
  // omitted and the loan gets the LoanAccount column's own default
  // (diminishing balance) instead — see report gap-analysis item 2.
  loanProductId: z.string().uuid().optional(),
  principalAmount: z.coerce.number().positive(),
  interestRate: z.coerce.number().min(0),
  termMonths: z.coerce.number().int().positive(),
});

const reviewSchema = z.object({ reviewNotes: z.string().min(1) });
const repaymentSchema = z.object({ amount: z.coerce.number().positive() });
const penaltySchema = z.object({ amount: z.coerce.number().positive(), note: z.string().optional() });

async function withAging(loan: {
  id: string;
  principalAmount: any;
  interestRate: any;
  computationMethod: "diminishing_balance" | "flat";
  termMonths: number;
  releaseDate: Date | null;
  status: string;
  transactions?: { type: string; amount: any }[];
}) {
  if (!loan.releaseDate) {
    return { ...loan, aging: null };
  }
  const schedule = computeLoanSchedule(
    loan.computationMethod,
    Number(loan.principalAmount),
    Number(loan.interestRate),
    loan.termMonths,
    loan.releaseDate
  );
  const transactions =
    loan.transactions ??
    (await prisma.loanTransaction.findMany({ where: { loanAccountId: loan.id } }));
  const totalRepaid = transactions
    .filter((t) => t.type === "repayment")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const aging = computeAging({ schedule, totalRepaid });
  return { ...loan, aging, schedule };
}

/**
 * Keeps LoanAccount.status in sync with computed aging (active <->
 * past_due), and — when the status actually changes — reclassifies the
 * whole outstanding balance between PAR buckets (11210/11220) in the same
 * transaction, so the status and the GL never drift apart.
 */
async function syncLoanStatus(loanId: string, performedBy: { id: string; name: string }) {
  const loan = await prisma.loanAccount.findUnique({
    where: { id: loanId },
    include: { transactions: true },
  });
  if (!loan || !loan.releaseDate) return loan;
  if (!["active", "past_due"].includes(loan.status)) return loan;

  const schedule = computeLoanSchedule(
    loan.computationMethod,
    Number(loan.principalAmount),
    Number(loan.interestRate),
    loan.termMonths,
    loan.releaseDate
  );
  const totalRepaid = loan.transactions
    .filter((t) => t.type === "repayment")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const aging = computeAging({ schedule, totalRepaid });
  // The PAR receivable accounts (11210/11220/11230) only ever track
  // principal — see computeOutstandingPrincipal's doc comment — so the
  // reclassifying entry must move this, not aging.outstandingBalance
  // (which includes unpaid interest and would misstate the GL split).
  const outstandingPrincipal = computeOutstandingPrincipal(Number(loan.principalAmount), schedule, totalRepaid);

  let nextStatus: "active" | "past_due" | "closed" = loan.status as any;
  if (aging.outstandingBalance <= 0.01) nextStatus = "closed";
  else if (aging.daysPastDue > 0) nextStatus = "past_due";
  else nextStatus = "active";

  if (nextStatus === loan.status) return loan;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.loanAccount.update({ where: { id: loanId }, data: { status: nextStatus } });
    await writeAuditLog(tx, {
      entityType: "LoanAccount",
      entityId: loanId,
      action: "update",
      previousValue: { status: loan.status },
      newValue: { status: nextStatus },
      performedBy,
    });
    // No-ops on its own for the active/past_due -> closed transition —
    // a closed loan's receivable already nets to zero through the
    // repayment's own posting, not a separate reclassifying entry.
    await reclassifyLoanReceivable(tx, {
      loanAccountId: loanId,
      fromStatus: loan.status,
      toStatus: nextStatus,
      outstandingBalance: outstandingPrincipal,
      performedBy,
    });
    return updated;
  });
}

loansRouter.get("/", async (req, res) => {
  const { memberId, status } = req.query as { memberId?: string; status?: string };
  const loans = await prisma.loanAccount.findMany({
    where: {
      memberId: memberId || undefined,
      status: status ? (status as any) : undefined,
    },
    include: { member: true, transactions: true },
    orderBy: { createdAt: "desc" },
  });
  const enriched = await Promise.all(loans.map((loan) => withAging(loan)));
  res.json(enriched);
});

loansRouter.get("/:id", async (req, res) => {
  const loan = await prisma.loanAccount.findUnique({
    where: { id: req.params.id },
    include: { member: true, transactions: { orderBy: { createdAt: "asc" } } },
  });
  if (!loan) throw notFound("Loan not found");
  const enriched = await withAging(loan);
  res.json(enriched);
});

/**
 * Disclosure statement (RA 3765 / CDA MC 2012-05 §6): total amount
 * financed, itemized finance charge, net proceeds, the finance-charge-
 * to-total ratio, and a simple annual rate on the outstanding balance.
 * These fields are statute-fixed, not board policy, so nothing here is a
 * setting — unlike the allowance report. Two honest limitations, stated
 * on the response rather than silently glossed over:
 * - No fee schedule exists yet (Phase 0/1 scope), so net proceeds equals
 *   principal; a real disclosure must itemize filing/service fees once
 *   those exist.
 * - For a "flat" loan, the annual rate shown is the nominal rate
 *   (periodic rate x periods/year), not a true effective rate on the
 *   outstanding balance — the report's own worked example shows flat's
 *   nominal rate understates true cost. That gap is flagged explicitly
 *   rather than computed, to avoid presenting an invented number as
 *   the statute's required figure.
 */
loansRouter.get("/:id/disclosure", async (req, res) => {
  const loan = await prisma.loanAccount.findUnique({ where: { id: req.params.id }, include: { member: true } });
  if (!loan) throw notFound("Loan not found");

  const principal = Number(loan.principalAmount);
  const periodicRate = Number(loan.interestRate);
  const periodsPerYear = loan.ratePeriod === "annual" ? 1 : 12;
  const releaseDate = loan.releaseDate ?? new Date();
  const schedule = computeLoanSchedule(loan.computationMethod, principal, periodicRate, loan.termMonths, releaseDate);
  const totalInterest = round2(schedule.reduce((sum, i) => sum + i.interestDue, 0));
  const totalAmountFinanced = round2(principal + totalInterest);
  const netProceeds = principal; // no fee schedule yet — see doc comment above
  const financeChargeRatio = totalAmountFinanced > 0 ? round2((totalInterest / totalAmountFinanced) * 100) : 0;
  const annualRateNominalPercent = round2(periodicRate * periodsPerYear * 100);

  res.json({
    loanId: loan.id,
    memberName: loan.member.fullName,
    loanProduct: loan.loanProduct,
    computationMethod: loan.computationMethod,
    ratePeriod: loan.ratePeriod,
    principalAmount: principal,
    termMonths: loan.termMonths,
    totalInterest,
    totalAmountFinanced,
    netProceeds,
    financeChargeRatioPercent: financeChargeRatio,
    annualRateNominalPercent,
    isNominalRateOnly: loan.computationMethod === "flat",
    feesNote: "No fee schedule is modeled yet — net proceeds shown equals principal.",
  });
});

// credit_officer creates the application (status: applied) — spec 4.3.
loansRouter.post("/", requireRole("credit_officer", "admin"), async (req, res) => {
  const data = applySchema.parse(req.body);
  const member = await prisma.member.findUnique({ where: { id: data.memberId } });
  if (!member) throw notFound("Member not found");
  if (member.status !== "active") throw badRequest("Only active members can apply for a loan");

  let computationMethod: "diminishing_balance" | "flat" | undefined;
  let ratePeriod: "monthly" | "annual" | undefined;
  if (data.loanProductId) {
    const product = await prisma.loanProduct.findUnique({ where: { id: data.loanProductId } });
    if (!product || !product.isActive) throw badRequest("Loan product not found or inactive");
    computationMethod = product.computationMethod;
    ratePeriod = product.ratePeriod;
  }

  const loan = await prisma.$transaction(async (tx) => {
    const created = await tx.loanAccount.create({
      // computationMethod/ratePeriod omitted when no product was linked —
      // the LoanAccount columns' own defaults (diminishing balance,
      // monthly) apply.
      data: {
        ...data,
        status: "applied",
        ...(computationMethod ? { computationMethod } : {}),
        ...(ratePeriod ? { ratePeriod } : {}),
      },
    });
    await writeAuditLog(tx, {
      entityType: "LoanAccount",
      entityId: created.id,
      action: "create",
      newValue: created,
      performedBy: { id: req.user!.id, name: req.user!.name },
    });
    return created;
  });

  res.status(201).json(loan);
});

// credit_officer moves applied -> under_review with evaluation notes.
loansRouter.post(
  "/:id/review",
  requireRole("credit_officer", "admin"),
  async (req, res) => {
    const { reviewNotes } = reviewSchema.parse(req.body);
    const existing = await prisma.loanAccount.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound("Loan not found");
    if (existing.status !== "applied") throw conflict("Only applied loans can move to under_review");

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.loanAccount.update({
        where: { id: existing.id },
        data: { status: "under_review", reviewNotes },
      });
      await writeAuditLog(tx, {
        entityType: "LoanAccount",
        entityId: result.id,
        action: "update",
        previousValue: { status: existing.status },
        newValue: { status: result.status, reviewNotes },
        performedBy: { id: req.user!.id, name: req.user!.name },
      });
      return result;
    });

    res.json(updated);
  }
);

// manager approves under_review -> approved.
loansRouter.post("/:id/approve", requireRole("manager", "admin"), async (req, res) => {
  const existing = await prisma.loanAccount.findUnique({ where: { id: req.params.id } });
  if (!existing) throw notFound("Loan not found");
  if (existing.status !== "under_review") throw conflict("Only loans under review can be approved");

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.loanAccount.update({ where: { id: existing.id }, data: { status: "approved" } });
    await writeAuditLog(tx, {
      entityType: "LoanAccount",
      entityId: result.id,
      action: "approve",
      previousValue: { status: existing.status },
      newValue: { status: result.status },
      performedBy: { id: req.user!.id, name: req.user!.name },
    });
    return result;
  });

  res.json(updated);
});

loansRouter.post("/:id/reject", requireRole("manager", "admin"), async (req, res) => {
  const existing = await prisma.loanAccount.findUnique({ where: { id: req.params.id } });
  if (!existing) throw notFound("Loan not found");
  if (!["applied", "under_review"].includes(existing.status)) {
    throw conflict("Only applied/under_review loans can be rejected");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.loanAccount.update({ where: { id: existing.id }, data: { status: "rejected" } });
    await writeAuditLog(tx, {
      entityType: "LoanAccount",
      entityId: result.id,
      action: "reject",
      previousValue: { status: existing.status },
      newValue: { status: result.status },
      performedBy: { id: req.user!.id, name: req.user!.name },
    });
    return result;
  });

  res.json(updated);
});

// cashier marks the loan released: creates LoanTransaction(release) + posts ledger.
loansRouter.post("/:id/release", requireRole("cashier", "admin"), async (req, res) => {
  const existing = await prisma.loanAccount.findUnique({ where: { id: req.params.id } });
  if (!existing) throw notFound("Loan not found");
  if (existing.status !== "approved") throw conflict("Only approved loans can be released");

  const principal = Number(existing.principalAmount);

  const result = await prisma.$transaction(async (tx) => {
    const releaseDate = new Date();
    const loan = await tx.loanAccount.update({
      where: { id: existing.id },
      data: { status: "active", releaseDate },
    });

    const schedule = computeLoanSchedule(
      loan.computationMethod,
      principal,
      Number(loan.interestRate),
      loan.termMonths,
      releaseDate
    );
    const totalDue = round2(schedule.reduce((sum, i) => sum + i.totalDue, 0));

    const loanTxn = await tx.loanTransaction.create({
      data: {
        loanAccountId: loan.id,
        type: "release",
        amount: principal,
        balanceAfter: totalDue,
        createdById: req.user!.id,
      },
    });

    await postLedgerBatch(tx, {
      sourceType: "loan",
      loanTransactionId: loanTxn.id,
      createdById: req.user!.id,
      memo: `Loan release — ${loan.loanProduct}`,
      lines: [
        { accountCode: ACCOUNTS.LOANS_RECEIVABLE_CURRENT, debit: principal },
        { accountCode: ACCOUNTS.CASH_ON_HAND, credit: principal },
      ],
    });

    await writeAuditLog(tx, {
      entityType: "LoanAccount",
      entityId: loan.id,
      action: "update",
      previousValue: { status: existing.status },
      newValue: { status: loan.status, releaseDate },
      performedBy: { id: req.user!.id, name: req.user!.name },
    });
    await writeAuditLog(tx, {
      entityType: "LoanTransaction",
      entityId: loanTxn.id,
      action: "create",
      newValue: loanTxn,
      performedBy: { id: req.user!.id, name: req.user!.name },
    });

    return loan;
  });

  res.json(result);
});

// cashier records a repayment: recalculates balance, splits principal/interest, posts ledger.
loansRouter.post("/:id/repayments", requireRole("cashier", "admin"), async (req, res) => {
  const { amount } = repaymentSchema.parse(req.body);
  const existing = await prisma.loanAccount.findUnique({
    where: { id: req.params.id },
    include: { transactions: true },
  });
  if (!existing) throw notFound("Loan not found");
  if (!["active", "past_due"].includes(existing.status)) {
    throw conflict("Repayments can only be recorded on active or past-due loans");
  }
  if (!existing.releaseDate) throw conflict("Loan has not been released yet");

  const schedule = computeLoanSchedule(
    existing.computationMethod,
    Number(existing.principalAmount),
    Number(existing.interestRate),
    existing.termMonths,
    existing.releaseDate
  );
  const totalRepaidBefore = existing.transactions
    .filter((t) => t.type === "repayment")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const agingBefore = computeAging({ schedule, totalRepaid: totalRepaidBefore });

  if (amount > agingBefore.outstandingBalance + 0.01) {
    throw badRequest(
      `Repayment amount exceeds outstanding balance of ${agingBefore.outstandingBalance.toFixed(2)}`
    );
  }

  const { interestPortion, principalPortion } = splitRepayment(schedule, totalRepaidBefore, amount);
  const balanceAfter = round2(agingBefore.outstandingBalance - amount);

  const result = await prisma.$transaction(async (tx) => {
    const loanTxn = await tx.loanTransaction.create({
      data: {
        loanAccountId: existing.id,
        type: "repayment",
        amount,
        balanceAfter,
        createdById: req.user!.id,
      },
    });

    const ledgerLines = [{ accountCode: ACCOUNTS.CASH_ON_HAND, debit: amount }];
    if (principalPortion > 0) {
      // Credits whichever bucket this loan's receivable is currently
      // sitting in (11210/11220/11230), not always "Current" — a
      // past-due loan's balance lives in 11220 until something
      // reclassifies it back, and a repayment must reduce the account
      // the balance actually sits in or the two drift apart.
      ledgerLines.push({
        accountCode: receivableAccountForStatus(existing.status) ?? ACCOUNTS.LOANS_RECEIVABLE_CURRENT,
        credit: principalPortion,
      } as any);
    }
    if (interestPortion > 0) {
      ledgerLines.push({ accountCode: ACCOUNTS.INTEREST_INCOME, credit: interestPortion } as any);
    }
    await postLedgerBatch(tx, {
      sourceType: "loan",
      loanTransactionId: loanTxn.id,
      createdById: req.user!.id,
      memo: `Loan repayment — ${existing.loanProduct}`,
      lines: ledgerLines as any,
    });

    const nextStatus = balanceAfter <= 0.01 ? "closed" : existing.status;
    const loan = await tx.loanAccount.update({
      where: { id: existing.id },
      data: { status: nextStatus },
    });

    await writeAuditLog(tx, {
      entityType: "LoanTransaction",
      entityId: loanTxn.id,
      action: "create",
      newValue: loanTxn,
      performedBy: { id: req.user!.id, name: req.user!.name },
    });
    if (nextStatus !== existing.status) {
      await writeAuditLog(tx, {
        entityType: "LoanAccount",
        entityId: loan.id,
        action: "update",
        previousValue: { status: existing.status },
        newValue: { status: loan.status },
        performedBy: { id: req.user!.id, name: req.user!.name },
      });
    }

    return { loan, loanTxn };
  });

  await syncLoanStatus(existing.id, { id: req.user!.id, name: req.user!.name });
  res.status(201).json(result);
});

// Records a penalty charge (e.g. late payment fee) as its own ledger-posted transaction.
loansRouter.post("/:id/penalties", requireRole("cashier", "manager", "admin"), async (req, res) => {
  const { amount, note } = penaltySchema.parse(req.body);
  const existing = await prisma.loanAccount.findUnique({ where: { id: req.params.id } });
  if (!existing) throw notFound("Loan not found");
  if (!["active", "past_due"].includes(existing.status)) {
    throw conflict("Penalties can only be assessed on active or past-due loans");
  }

  const result = await prisma.$transaction(async (tx) => {
    const loanTxn = await tx.loanTransaction.create({
      data: {
        loanAccountId: existing.id,
        type: "penalty",
        amount,
        balanceAfter: amount,
        createdById: req.user!.id,
      },
    });
    await postLedgerBatch(tx, {
      sourceType: "loan",
      loanTransactionId: loanTxn.id,
      createdById: req.user!.id,
      memo: note ?? "Loan penalty assessed",
      lines: [
        { accountCode: ACCOUNTS.CASH_ON_HAND, debit: amount },
        { accountCode: ACCOUNTS.PENALTY_INCOME, credit: amount },
      ],
    });
    await writeAuditLog(tx, {
      entityType: "LoanTransaction",
      entityId: loanTxn.id,
      action: "create",
      newValue: loanTxn,
      performedBy: { id: req.user!.id, name: req.user!.name },
    });
    return loanTxn;
  });

  res.status(201).json(result);
});
