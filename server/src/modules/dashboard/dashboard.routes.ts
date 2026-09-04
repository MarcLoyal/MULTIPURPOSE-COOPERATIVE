import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { ACCOUNTS } from "../../lib/accounts";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get("/", async (_req, res) => {
  const [activeMembers, activeLoans, pastDueLoans, shareCapitalAccounts, cashDebits, cashCredits] =
    await Promise.all([
      prisma.member.count({ where: { status: "active" } }),
      prisma.loanAccount.count({ where: { status: { in: ["active", "past_due"] } } }),
      prisma.loanAccount.count({ where: { status: "past_due" } }),
      prisma.shareCapitalAccount.aggregate({ _sum: { balance: true } }),
      prisma.ledgerEntry.aggregate({
        _sum: { debit: true },
        where: { accountCode: ACCOUNTS.CASH_ON_HAND },
      }),
      prisma.ledgerEntry.aggregate({
        _sum: { credit: true },
        where: { accountCode: ACCOUNTS.CASH_ON_HAND },
      }),
    ]);

  const cashPosition = Number(cashDebits._sum.debit ?? 0) - Number(cashCredits._sum.credit ?? 0);

  res.json({
    activeMembers,
    activeLoans,
    pastDueLoans,
    totalShareCapital: Number(shareCapitalAccounts._sum.balance ?? 0),
    cashPosition,
  });
});
