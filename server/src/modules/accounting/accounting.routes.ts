import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole, requireStaff } from "../../middleware/auth";
import { getBalanceSheet, getIncomeStatement, getTrialBalance, postLedgerBatch } from "../../lib/ledger";
import { buildCdaDataPack } from "../../lib/cdaDataPack";
import { writeAuditLog } from "../../lib/audit";
import { ACCOUNTS } from "../../lib/accounts";
import { computeAging, computeLoanSchedule } from "../../lib/loanSchedule";
import { classifyAllowanceBucket, round2 } from "../../lib/allowance";

export const accountingRouter = Router();
accountingRouter.use(requireAuth, requireStaff);

async function getAccountLabels(): Promise<Record<string, string>> {
  const accounts = await prisma.account.findMany({ select: { code: true, label: true } });
  return Object.fromEntries(accounts.map((a) => [a.code, a.label]));
}

// Read-only General Ledger, filterable by date range and account_code (spec 4.5).
accountingRouter.get("/ledger", async (req, res) => {
  const { from, to, accountCode } = req.query as { from?: string; to?: string; accountCode?: string };

  const [entries, labels] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: {
        accountCode: accountCode || undefined,
        entryDate: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
        },
      },
      orderBy: { entryDate: "desc" },
    }),
    getAccountLabels(),
  ]);

  res.json(
    entries.map((e) => ({
      ...e,
      accountLabel: labels[e.accountCode] ?? e.accountCode,
    }))
  );
});

// Trial Balance: sum of debits vs credits per account_code (spec 4.5).
accountingRouter.get("/trial-balance", async (_req, res) => {
  const [rows, labels] = await Promise.all([getTrialBalance(), getAccountLabels()]);
  const withLabels = rows.map((r) => ({
    ...r,
    accountLabel: labels[r.accountCode] ?? r.accountCode,
  }));
  const totals = withLabels.reduce(
    (acc, r) => {
      acc.totalDebit += r.totalDebit;
      acc.totalCredit += r.totalCredit;
      return acc;
    },
    { totalDebit: 0, totalCredit: 0 }
  );

  res.json({ rows: withLabels, totals, balanced: Math.abs(totals.totalDebit - totals.totalCredit) < 0.01 });
});

// Income statement / net surplus for a date range (RA 9520 Art. 86 funds
// the next fiscal year's close against this figure — see
// lib/ledger.ts:getIncomeStatement for the per-account computation).
// from/to are optional, same convention as /ledger: omitted means
// unbounded, so picking a real fiscal year's start/end is the caller's
// responsibility, not something this endpoint assumes.
accountingRouter.get("/income-statement", async (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const statement = await getIncomeStatement(from ? new Date(from) : undefined, to ? new Date(to) : undefined);
  res.json(statement);
});

// Statement of Financial Condition — see lib/ledger.ts:getBalanceSheet.
// ?asOf is optional, same convention as /ledger and /income-statement;
// omitted means right now.
accountingRouter.get("/balance-sheet", async (req, res) => {
  const { asOf } = req.query as { asOf?: string };
  res.json(await getBalanceSheet(asOf ? new Date(asOf) : undefined));
});

// CDA Report Data Pack — see lib/cdaDataPack.ts's doc comment for what
// this is (and isn't). Only available once the fiscal year is closed.
accountingRouter.get("/cda-data-pack/:fiscalYearId", async (req, res) => {
  res.json(await buildCdaDataPack(req.params.fiscalYearId));
});

/**
 * Allowance for probable losses, computed fresh on every request from the
 * current AllowanceRateSetting rows — never cached, so changing a rate in
 * Settings is reflected immediately. See lib/allowance.ts for the bucket
 * logic and why every rate defaults to 0%.
 */
async function computeAllowanceReport() {
  const [loans, rateSettings] = await Promise.all([
    prisma.loanAccount.findMany({
      // Includes "restructured" so the allowance report and the PAR
      // reclassification (loanReceivable.ts) agree on which loans carry
      // an outstanding receivable — unreachable in practice today (no
      // endpoint ever sets this status), but correct for when one exists.
      where: { status: { in: ["active", "past_due", "restructured"] } },
      include: { member: true, transactions: true },
    }),
    prisma.allowanceRateSetting.findMany(),
  ]);
  const rateByBucket = new Map(rateSettings.map((r) => [r.bucketLabel, Number(r.ratePercent)]));

  const rows = loans
    .filter((loan) => loan.releaseDate)
    .map((loan) => {
      const schedule = computeLoanSchedule(
        loan.computationMethod,
        Number(loan.principalAmount),
        Number(loan.interestRate),
        loan.termMonths,
        loan.releaseDate!
      );
      const totalRepaid = loan.transactions
        .filter((t) => t.type === "repayment")
        .reduce((sum, t) => sum + Number(t.amount), 0);
      const aging = computeAging({ schedule, totalRepaid });
      const bucket = classifyAllowanceBucket(aging.daysPastDue);
      const ratePercent = rateByBucket.get(bucket) ?? 0;
      const allowanceAmount = round2((aging.outstandingBalance * ratePercent) / 100);
      return {
        loanId: loan.id,
        memberName: loan.member.fullName,
        loanProduct: loan.loanProduct,
        outstandingBalance: aging.outstandingBalance,
        daysPastDue: aging.daysPastDue,
        bucket,
        ratePercent,
        allowanceAmount,
      };
    })
    .filter((row) => row.outstandingBalance > 0);

  const totalAllowance = round2(rows.reduce((sum, row) => sum + row.allowanceAmount, 0));
  return { rows, totalAllowance };
}

accountingRouter.get("/allowance-report", async (_req, res) => {
  res.json(await computeAllowanceReport());
});

// Never automatic — a human with manager/accountant/admin access must
// explicitly trigger this, and it no-ops cleanly (not an error) while
// every rate is still at its 0% default.
accountingRouter.post(
  "/allowance-report/post",
  requireRole("manager", "accountant", "admin"),
  async (req, res) => {
    const { rows, totalAllowance } = await computeAllowanceReport();

    if (totalAllowance <= 0) {
      return res.json({
        posted: false,
        message: "Total allowance is zero at the current settings — nothing to post.",
        totalAllowance,
      });
    }

    const batchId = await prisma.$transaction(async (tx) => {
      const id = await postLedgerBatch(tx, {
        sourceType: "manual",
        createdById: req.user!.id,
        memo: `Allowance for probable losses — ${rows.length} loan(s)`,
        lines: [
          { accountCode: ACCOUNTS.PROBABLE_LOSSES_EXPENSE, debit: totalAllowance },
          { accountCode: ACCOUNTS.ALLOWANCE_FOR_PROBABLE_LOSSES, credit: totalAllowance },
        ],
      });
      await writeAuditLog(tx, {
        entityType: "LedgerEntry",
        entityId: id,
        action: "create",
        newValue: { memo: "Allowance for probable losses", totalAllowance, loanCount: rows.length },
        performedBy: { id: req.user!.id, name: req.user!.name },
      });
      return id;
    });

    res.json({ posted: true, batchId, totalAllowance });
  }
);
