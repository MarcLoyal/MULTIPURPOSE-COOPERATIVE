import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { getTrialBalance } from "../../lib/ledger";

export const accountingRouter = Router();
accountingRouter.use(requireAuth);

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
