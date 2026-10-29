import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { writeAuditLog } from "../../lib/audit";
import { badRequest, conflict, notFound } from "../../lib/httpError";
import { postLedgerBatch, getIncomeStatement } from "../../lib/ledger";
import { ACCOUNTS } from "../../lib/accounts";
import { round2, computeLoanSchedule, splitRepayment } from "../../lib/loanSchedule";

export const fiscalYearsRouter = Router();
fiscalYearsRouter.use(requireAuth);

/**
 * A fiscal year's period runs from the day after the previous fiscal
 * year's yearEndDate (whichever other fiscal year ends most recently
 * before this one, regardless of status) through this one's own
 * yearEndDate. The very first fiscal year's period is unbounded at the
 * start — from the beginning of the ledger's history.
 */
async function getPeriodStart(fiscalYear: { id: string; yearEndDate: Date }): Promise<Date | undefined> {
  const previous = await prisma.fiscalYear.findFirst({
    where: { yearEndDate: { lt: fiscalYear.yearEndDate }, id: { not: fiscalYear.id } },
    orderBy: { yearEndDate: "desc" },
  });
  if (!previous) return undefined;
  const start = new Date(previous.yearEndDate);
  start.setDate(start.getDate() + 1);
  return start;
}

/**
 * Each member's total interest paid on loan repayments landing in
 * [periodStart, periodEnd] (same <= periodEnd convention getIncomeStatement
 * uses). Walks each loan's repayment history in chronological order so
 * splitRepayment sees the correct cumulative-repaid-before state for a
 * repayment inside the period, even when earlier repayments (outside the
 * period) already consumed part of the amortization schedule. This is
 * the patronage-refund basis for a lending cooperative: the standard
 * measure is volume of business done with the coop, which for loans is
 * interest paid, not principal borrowed or disbursed.
 */
async function computeInterestPaidByMember(
  periodStart: Date | undefined,
  periodEnd: Date
): Promise<Map<string, number>> {
  const loans = await prisma.loanAccount.findMany({
    where: { releaseDate: { not: null } },
    include: { transactions: { where: { type: "repayment" }, orderBy: { createdAt: "asc" } } },
  });

  const interestByMember = new Map<string, number>();
  for (const loan of loans) {
    if (loan.transactions.length === 0) continue;
    const schedule = computeLoanSchedule(
      loan.computationMethod,
      Number(loan.principalAmount),
      Number(loan.interestRate),
      loan.termMonths,
      loan.releaseDate!
    );
    let totalRepaidBefore = 0;
    let memberInterest = 0;
    for (const txn of loan.transactions) {
      const amount = Number(txn.amount);
      const inPeriod = (!periodStart || txn.createdAt >= periodStart) && txn.createdAt <= periodEnd;
      if (inPeriod) {
        const { interestPortion } = splitRepayment(schedule, totalRepaidBefore, amount);
        memberInterest = round2(memberInterest + interestPortion);
      }
      totalRepaidBefore = round2(totalRepaidBefore + amount);
    }
    if (memberInterest > 0) {
      const current = interestByMember.get(loan.memberId) ?? 0;
      interestByMember.set(loan.memberId, round2(current + memberInterest));
    }
  }
  return interestByMember;
}

fiscalYearsRouter.get("/", async (_req, res) => {
  const fiscalYears = await prisma.fiscalYear.findMany({
    include: { statutoryFundAllocation: true, dividendDistribution: true },
    orderBy: { yearEndDate: "desc" },
  });
  res.json(fiscalYears);
});

fiscalYearsRouter.get("/:id", async (req, res) => {
  const fiscalYear = await prisma.fiscalYear.findUnique({
    where: { id: req.params.id },
    include: { statutoryFundAllocation: true, dividendDistribution: true },
  });
  if (!fiscalYear) throw notFound("Fiscal year not found");

  const periodStart = await getPeriodStart(fiscalYear);
  res.json({ ...fiscalYear, periodStart: periodStart ?? null });
});

const createSchema = z.object({ yearEndDate: z.coerce.date() });

fiscalYearsRouter.post(
  "/",
  requireRole("manager", "accountant", "admin"),
  async (req, res) => {
    const { yearEndDate } = createSchema.parse(req.body);

    const created = await prisma.$transaction(async (tx) => {
      const fiscalYear = await tx.fiscalYear.create({ data: { yearEndDate } });
      await writeAuditLog(tx, {
        entityType: "FiscalYear",
        entityId: fiscalYear.id,
        action: "create",
        newValue: fiscalYear,
        performedBy: { id: req.user!.id, name: req.user!.name },
      });
      return fiscalYear;
    });

    res.status(201).json(created);
  }
);

const closeSchema = z.object({
  reserveFundPercent: z.coerce.number().min(10),
  cetfPercent: z.coerce.number().min(0).max(10),
  communityDevFundPercent: z.coerce.number().min(3),
  optionalFundPercent: z.coerce.number().min(0).max(7),
});

/**
 * Closes a fiscal year: computes net surplus for its period (via the
 * income statement — see lib/ledger.ts), posts the standard closing
 * entries for every revenue/expense account active that period (so the
 * trial balance correctly zeroes them out, same as a real year-end
 * close), then allocates the board-approved percentages of that surplus
 * into the four statutory funds, debiting Undivided Net Surplus (30600)
 * for only what's actually allocated — the remainder stays in 30600,
 * undivided, available for a future member-facing dividend/patronage
 * refund decision (out of scope here; this PR only does the mandatory
 * fund allocation RA 9520 Art. 86 requires before that can happen).
 */
fiscalYearsRouter.post(
  "/:id/close",
  requireRole("manager", "accountant", "admin"),
  async (req, res) => {
    const percents = closeSchema.parse(req.body);

    const fiscalYear = await prisma.fiscalYear.findUnique({ where: { id: req.params.id } });
    if (!fiscalYear) throw notFound("Fiscal year not found");
    if (fiscalYear.status !== "open") throw conflict("Fiscal year is already closed");

    const periodStart = await getPeriodStart(fiscalYear);
    const statement = await getIncomeStatement(periodStart, fiscalYear.yearEndDate);

    if (statement.netSurplus <= 0) {
      const closed = await prisma.$transaction(async (tx) => {
        const result = await tx.fiscalYear.update({ where: { id: fiscalYear.id }, data: { status: "closed" } });
        await writeAuditLog(tx, {
          entityType: "FiscalYear",
          entityId: fiscalYear.id,
          action: "update",
          previousValue: { status: "open" },
          newValue: { status: "closed" },
          performedBy: { id: req.user!.id, name: req.user!.name },
        });
        return result;
      });
      return res.json({
        fiscalYear: closed,
        allocated: false,
        netSurplus: statement.netSurplus,
        message:
          statement.netSurplus === 0
            ? "Net surplus is zero for this period — fiscal year closed, nothing to allocate."
            : "This period had a net deficit — fiscal year closed, nothing to allocate.",
      });
    }

    const reserveAmount = round2((statement.netSurplus * percents.reserveFundPercent) / 100);
    const cetfAmount = round2((statement.netSurplus * percents.cetfPercent) / 100);
    const communityDevAmount = round2((statement.netSurplus * percents.communityDevFundPercent) / 100);
    const optionalAmount = round2((statement.netSurplus * percents.optionalFundPercent) / 100);
    const allocatedTotal = round2(reserveAmount + cetfAmount + communityDevAmount + optionalAmount);

    if (allocatedTotal > statement.netSurplus) {
      throw badRequest(
        `These percentages would allocate ${allocatedTotal.toFixed(2)}, more than the period's net surplus of ${statement.netSurplus.toFixed(2)}.`
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const allocation = await tx.statutoryFundAllocation.create({
        data: {
          fiscalYearId: fiscalYear.id,
          reserveFundPercent: percents.reserveFundPercent,
          cetfPercent: percents.cetfPercent,
          communityDevFundPercent: percents.communityDevFundPercent,
          optionalFundPercent: percents.optionalFundPercent,
          netSurplus: statement.netSurplus,
        },
      });

      // Closing entries: zero out the period's revenue/expense accounts
      // (debit revenue, credit expense — the reverse of their normal
      // balance) into 30600, then allocate the approved portion out of
      // 30600 into the four funds. One balanced batch for the whole
      // economic event, dated as of the fiscal year's own end date (not
      // "today") so it lands in the right period.
      const lines = [
        ...statement.revenueRows.map((r) => ({ accountCode: r.accountCode, debit: r.amount })),
        ...statement.expenseRows.map((r) => ({ accountCode: r.accountCode, credit: r.amount })),
      ];
      const unallocatedRemainder = round2(statement.netSurplus - allocatedTotal);
      if (unallocatedRemainder > 0) {
        lines.push({ accountCode: ACCOUNTS.UNDIVIDED_NET_SURPLUS, credit: unallocatedRemainder });
      }
      if (reserveAmount > 0) {
        lines.push({ accountCode: ACCOUNTS.RESERVE_FUND, credit: reserveAmount });
      }
      if (cetfAmount > 0) {
        const cetfInternal = round2(cetfAmount / 2);
        const cetfExternal = round2(cetfAmount - cetfInternal);
        if (cetfInternal > 0) lines.push({ accountCode: ACCOUNTS.CETF_INTERNAL, credit: cetfInternal });
        if (cetfExternal > 0) lines.push({ accountCode: ACCOUNTS.DUE_TO_UNION_FEDERATION_CETF, credit: cetfExternal });
      }
      if (communityDevAmount > 0) {
        lines.push({ accountCode: ACCOUNTS.COMMUNITY_DEVELOPMENT_FUND, credit: communityDevAmount });
      }
      if (optionalAmount > 0) {
        lines.push({ accountCode: ACCOUNTS.OPTIONAL_FUND, credit: optionalAmount });
      }

      const batchId = await postLedgerBatch(tx, {
        sourceType: "fiscal_year_close",
        statutoryFundAllocationId: allocation.id,
        createdById: req.user!.id,
        memo: `Fiscal year close ${fiscalYear.yearEndDate.toISOString().slice(0, 10)} — statutory fund allocation`,
        entryDate: fiscalYear.yearEndDate,
        lines: lines as any,
      });

      const closedFiscalYear = await tx.fiscalYear.update({
        where: { id: fiscalYear.id },
        data: { status: "closed" },
      });

      await writeAuditLog(tx, {
        entityType: "StatutoryFundAllocation",
        entityId: allocation.id,
        action: "create",
        newValue: { ...allocation, netSurplus: statement.netSurplus, reserveAmount, cetfAmount, communityDevAmount, optionalAmount },
        performedBy: { id: req.user!.id, name: req.user!.name },
      });
      await writeAuditLog(tx, {
        entityType: "FiscalYear",
        entityId: fiscalYear.id,
        action: "update",
        previousValue: { status: "open" },
        newValue: { status: "closed" },
        performedBy: { id: req.user!.id, name: req.user!.name },
      });

      return { fiscalYear: closedFiscalYear, allocation, batchId };
    });

    res.json({
      ...result,
      allocated: true,
      netSurplus: statement.netSurplus,
      reserveAmount,
      cetfAmount,
      communityDevAmount,
      optionalAmount,
      unallocatedRemainder: round2(statement.netSurplus - allocatedTotal),
    });
  }
);

/**
 * Distributes interest on share capital + patronage refund from a
 * closed fiscal year's unallocated remainder, using the CURRENT
 * DividendDistributionSetting percentages — not a value in the request
 * body, same convention as the allowance report (change the setting,
 * then re-run the action). At most one distribution per fiscal year.
 *
 * Both components are credited to members' share capital
 * (ShareCapitalTransaction type "dividend", posted directly — the
 * distribute action itself is the authorization, same as how closing a
 * fiscal year needs no separate approval step) rather than paid out in
 * cash. That's a documented simplification: many cooperatives do
 * exactly this (compulsory reinvestment of dividends/refunds into
 * share capital), but a cash-payout alternative would need its own
 * workflow — reusing the existing share-capital withdrawal flow is the
 * natural next step if the bylaws require it.
 */
fiscalYearsRouter.post(
  "/:id/distribute",
  requireRole("manager", "accountant", "admin"),
  async (req, res) => {
    const fiscalYear = await prisma.fiscalYear.findUnique({
      where: { id: req.params.id },
      include: { statutoryFundAllocation: true, dividendDistribution: true },
    });
    if (!fiscalYear) throw notFound("Fiscal year not found");
    if (fiscalYear.status !== "closed") throw conflict("Fiscal year must be closed before distributing");
    if (!fiscalYear.statutoryFundAllocation) {
      throw conflict("This fiscal year closed with no net surplus — nothing to distribute");
    }
    if (fiscalYear.dividendDistribution) throw conflict("This fiscal year has already been distributed");

    const setting = await prisma.dividendDistributionSetting.findFirst();
    if (!setting) throw badRequest("Dividend distribution settings row is missing");
    const shareCapitalInterestPercent = Number(setting.shareCapitalInterestPercent);
    const patronageRefundPercent = Number(setting.patronageRefundPercent);

    const alloc = fiscalYear.statutoryFundAllocation;
    const netSurplus = Number(alloc.netSurplus);
    // Reproduce the exact per-fund rounding the close handler used, so
    // this matches what was actually posted rather than a fresh
    // recomputation that could drift by a cent.
    const reserveAmount = round2((netSurplus * Number(alloc.reserveFundPercent)) / 100);
    const cetfAmount = round2((netSurplus * Number(alloc.cetfPercent)) / 100);
    const communityDevAmount = round2((netSurplus * Number(alloc.communityDevFundPercent)) / 100);
    const optionalAmount = round2((netSurplus * Number(alloc.optionalFundPercent)) / 100);
    const allocatedTotal = round2(reserveAmount + cetfAmount + communityDevAmount + optionalAmount);
    const unallocatedRemainder = round2(netSurplus - allocatedTotal);

    const shareCapitalInterestAmount = round2((unallocatedRemainder * shareCapitalInterestPercent) / 100);
    const patronageRefundAmount = round2((unallocatedRemainder * patronageRefundPercent) / 100);
    const requestedTotal = round2(shareCapitalInterestAmount + patronageRefundAmount);

    if (requestedTotal > unallocatedRemainder) {
      throw badRequest(
        `The current dividend settings would distribute ${requestedTotal.toFixed(2)}, more than the unallocated remainder of ${unallocatedRemainder.toFixed(2)}.`
      );
    }
    if (requestedTotal <= 0) {
      return res.json({
        distributed: false,
        unallocatedRemainder,
        message: "Dividend distribution settings are at 0% — nothing to distribute.",
      });
    }

    const periodStart = await getPeriodStart(fiscalYear);

    const shareAccounts = await prisma.shareCapitalAccount.findMany({ where: { balance: { gt: 0 } } });
    const totalShareCapital = shareAccounts.reduce((sum, a) => sum + Number(a.balance), 0);

    const interestByMember =
      patronageRefundAmount > 0 ? await computeInterestPaidByMember(periodStart, fiscalYear.yearEndDate) : new Map<string, number>();
    const totalInterestPaid = Array.from(interestByMember.values()).reduce((sum, v) => sum + v, 0);

    // Track each category's actual post-rounding total separately from
    // the pre-split target (shareCapitalInterestAmount/patronageRefundAmount
    // above) — splitting a dollar amount across N members and rounding
    // each member's share to the cent can land a cent above or below the
    // target. The DividendDistribution record and the ledger must both
    // reflect what was actually summed and credited, not the
    // before-rounding target, or the two would disagree by a cent.
    const perMember = new Map<string, number>();
    let actualShareCapitalInterestAmount = 0;
    if (totalShareCapital > 0 && shareCapitalInterestAmount > 0) {
      for (const acct of shareAccounts) {
        const share = round2((shareCapitalInterestAmount * Number(acct.balance)) / totalShareCapital);
        if (share > 0) {
          perMember.set(acct.memberId, round2((perMember.get(acct.memberId) ?? 0) + share));
          actualShareCapitalInterestAmount = round2(actualShareCapitalInterestAmount + share);
        }
      }
    }
    let actualPatronageRefundAmount = 0;
    if (totalInterestPaid > 0 && patronageRefundAmount > 0) {
      for (const [memberId, interest] of interestByMember) {
        const share = round2((patronageRefundAmount * interest) / totalInterestPaid);
        if (share > 0) {
          perMember.set(memberId, round2((perMember.get(memberId) ?? 0) + share));
          actualPatronageRefundAmount = round2(actualPatronageRefundAmount + share);
        }
      }
    }

    const actualTotal = round2(actualShareCapitalInterestAmount + actualPatronageRefundAmount);

    if (actualTotal <= 0) {
      return res.json({
        distributed: false,
        unallocatedRemainder,
        message:
          totalShareCapital === 0 && totalInterestPaid === 0
            ? "No members hold share capital and no loan interest was paid this period — nothing to distribute."
            : "Computed distribution is zero — nothing to distribute.",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const distribution = await tx.dividendDistribution.create({
        data: {
          fiscalYearId: fiscalYear.id,
          shareCapitalInterestPercent,
          patronageRefundPercent,
          shareCapitalInterestAmount: actualShareCapitalInterestAmount,
          patronageRefundAmount: actualPatronageRefundAmount,
          memberCount: perMember.size,
        },
      });

      await postLedgerBatch(tx, {
        sourceType: "dividend_distribution",
        dividendDistributionId: distribution.id,
        createdById: req.user!.id,
        memo: `Dividend / patronage refund distribution — fiscal year ${fiscalYear.yearEndDate.toISOString().slice(0, 10)}`,
        lines: [
          { accountCode: ACCOUNTS.UNDIVIDED_NET_SURPLUS, debit: actualTotal },
          { accountCode: ACCOUNTS.MEMBERS_SHARE_CAPITAL, credit: actualTotal },
        ],
      });

      for (const [memberId, amount] of perMember) {
        const account = await tx.shareCapitalAccount.findUnique({ where: { memberId } });
        if (!account) continue;
        await tx.shareCapitalAccount.update({ where: { id: account.id }, data: { balance: { increment: amount } } });
        const txn = await tx.shareCapitalTransaction.create({
          data: {
            shareCapitalAccountId: account.id,
            type: "dividend",
            amount,
            status: "posted",
            createdById: req.user!.id,
            approvedById: req.user!.id,
            approvedAt: new Date(),
          },
        });
        await writeAuditLog(tx, {
          entityType: "ShareCapitalTransaction",
          entityId: txn.id,
          action: "create",
          newValue: txn,
          performedBy: { id: req.user!.id, name: req.user!.name },
        });
      }

      await writeAuditLog(tx, {
        entityType: "DividendDistribution",
        entityId: distribution.id,
        action: "create",
        newValue: { ...distribution, memberCount: perMember.size },
        performedBy: { id: req.user!.id, name: req.user!.name },
      });

      return distribution;
    });

    res.json({
      distributed: true,
      distribution: result,
      shareCapitalInterestAmount: actualShareCapitalInterestAmount,
      patronageRefundAmount: actualPatronageRefundAmount,
      memberCount: perMember.size,
      unallocatedRemainder: round2(unallocatedRemainder - actualTotal),
    });
  }
);
