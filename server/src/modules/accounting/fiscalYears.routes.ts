import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { writeAuditLog } from "../../lib/audit";
import { badRequest, conflict, notFound } from "../../lib/httpError";
import { postLedgerBatch, getIncomeStatement } from "../../lib/ledger";
import { ACCOUNTS } from "../../lib/accounts";
import { round2 } from "../../lib/loanSchedule";

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

fiscalYearsRouter.get("/", async (_req, res) => {
  const fiscalYears = await prisma.fiscalYear.findMany({
    include: { statutoryFundAllocation: true },
    orderBy: { yearEndDate: "desc" },
  });
  res.json(fiscalYears);
});

fiscalYearsRouter.get("/:id", async (req, res) => {
  const fiscalYear = await prisma.fiscalYear.findUnique({
    where: { id: req.params.id },
    include: { statutoryFundAllocation: true },
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
