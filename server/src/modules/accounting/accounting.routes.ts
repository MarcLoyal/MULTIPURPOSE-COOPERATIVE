import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { getTrialBalance } from "../../lib/ledger";
import { ACCOUNT_LABELS } from "../../lib/accounts";

export const accountingRouter = Router();
accountingRouter.use(requireAuth);

// Read-only General Ledger, filterable by date range and account_code (spec 4.5).
accountingRouter.get("/ledger", async (req, res) => {
  const { from, to, accountCode } = req.query as { from?: string; to?: string; accountCode?: string };

  const entries = await prisma.ledgerEntry.findMany({
    where: {
      accountCode: accountCode || undefined,
      entryDate: {
        gte: from ? new Date(from) : undefined,
        lte: to ? new Date(to) : undefined,
      },
    },
    orderBy: { entryDate: "desc" },
  });

  res.json(
    entries.map((e) => ({
      ...e,
      accountLabel: ACCOUNT_LABELS[e.accountCode] ?? e.accountCode,
    }))
  );
});

// Trial Balance: sum of debits vs credits per account_code (spec 4.5).
accountingRouter.get("/trial-balance", async (_req, res) => {
  const rows = await getTrialBalance();
  const withLabels = rows.map((r) => ({
    ...r,
    accountLabel: ACCOUNT_LABELS[r.accountCode] ?? r.accountCode,
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
