import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireStaff } from "../../middleware/auth";
import { ACCOUNTS } from "../../lib/accounts";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth, requireStaff);

dashboardRouter.get("/", async (_req, res) => {
  const [
    activeMembers,
    activeLoans,
    pastDueLoans,
    shareCapitalAccounts,
    depositAccounts,
    cashDebits,
    cashCredits,
    currentFiscalYear,
  ] = await Promise.all([
    prisma.member.count({ where: { status: "active" } }),
    prisma.loanAccount.count({ where: { status: { in: ["active", "past_due"] } } }),
    prisma.loanAccount.count({ where: { status: "past_due" } }),
    prisma.shareCapitalAccount.aggregate({ _sum: { balance: true } }),
    prisma.depositAccount.aggregate({ _sum: { balance: true }, where: { status: "active" } }),
    prisma.ledgerEntry.aggregate({
      _sum: { debit: true },
      where: { accountCode: ACCOUNTS.CASH_ON_HAND },
    }),
    prisma.ledgerEntry.aggregate({
      _sum: { credit: true },
      where: { accountCode: ACCOUNTS.CASH_ON_HAND },
    }),
    prisma.fiscalYear.findFirst({
      orderBy: { yearEndDate: "desc" },
      include: { statutoryFundAllocation: true, dividendDistribution: true },
    }),
  ]);

  const cashPosition = Number(cashDebits._sum.debit ?? 0) - Number(cashCredits._sum.credit ?? 0);

  res.json({
    activeMembers,
    activeLoans,
    pastDueLoans,
    totalShareCapital: Number(shareCapitalAccounts._sum.balance ?? 0),
    totalDeposits: Number(depositAccounts._sum.balance ?? 0),
    cashPosition,
    fiscalYear: currentFiscalYear
      ? {
          id: currentFiscalYear.id,
          yearEndDate: currentFiscalYear.yearEndDate,
          status: currentFiscalYear.status,
          hasStatutoryAllocation: currentFiscalYear.statutoryFundAllocation != null,
          hasDividendDistribution: currentFiscalYear.dividendDistribution != null,
        }
      : null,
  });
});
