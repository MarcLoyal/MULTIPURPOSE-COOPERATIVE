import { Router, Request } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { forbidden, notFound } from "../../lib/httpError";
import { computeLoanLimit } from "../../lib/loanLimit";
import { buildMemberStatement } from "../../lib/memberStatement";
import { getIncomeStatement } from "../../lib/ledger";
import { round2 } from "../../lib/loanSchedule";
import {
  computeAverageShareCapitalByMember,
  computeInterestPaidByMember,
  getPeriodStart,
} from "../accounting/fiscalYears.routes";

/**
 * The member portal. Every route here is scoped to the caller's own
 * Member record via req.user.memberId (set at login — see auth.ts's
 * JwtPayload), never to a param, query string, or request body value.
 * There is no route here that takes a memberId from the client at all,
 * which is the actual isolation guarantee: not a check that happens to
 * pass today, but a route surface where "someone else's id" has nowhere
 * to go. requireRole("member") additionally keeps staff logins out of
 * this router — the portal is not a backdoor around requireStaff on the
 * other routers, it's a separate, narrower surface.
 */
export const portalRouter = Router();
portalRouter.use(requireAuth, requireRole("member"));

function currentMemberId(req: Request): string {
  const memberId = req.user?.memberId;
  if (!memberId) {
    throw forbidden("This login is not linked to a member record");
  }
  return memberId;
}

portalRouter.get("/me", async (req, res) => {
  const memberId = currentMemberId(req);
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      shareCapitalAccount: true,
      loanAccounts: { orderBy: { createdAt: "desc" } },
      depositAccounts: { include: { depositProduct: true }, orderBy: { openedAt: "desc" } },
    },
  });
  if (!member) throw notFound("Member record not found");
  res.json(member);
});

portalRouter.get("/loan-limit", async (req, res) => {
  res.json(await computeLoanLimit(currentMemberId(req)));
});

portalRouter.get("/dividend-history", async (req, res) => {
  const memberId = currentMemberId(req);
  const txns = await prisma.shareCapitalTransaction.findMany({
    where: { type: "dividend", account: { memberId } },
    orderBy: { createdAt: "desc" },
  });
  res.json(txns);
});

// Printable/downloadable statement of account — see lib/memberStatement.ts.
portalRouter.get("/statement", async (req, res) => {
  res.json(await buildMemberStatement(currentMemberId(req)));
});

const STATUTORY_MINIMUM_PERCENT = {
  // The floor each percentage is bound to at close time (closeSchema in
  // fiscalYears.routes.ts) — reserveFundPercent.min(10),
  // communityDevFundPercent.min(3), the other two have no floor. Using
  // the minimums here means this estimate assumes the SMALLEST possible
  // statutory set-aside, i.e. the LARGEST possible remainder — so it's a
  // conservative upper bound on what's left to distribute, not a guess
  // at what the board will actually choose.
  reserve: 10,
  cetf: 0,
  communityDev: 3,
  optional: 0,
};

/**
 * "If this fiscal year closed today" — net surplus for the period so
 * far (periodStart through now, not the fiscal year's actual
 * yearEndDate, which hasn't happened yet), minus statutory funds at
 * their regulatory minimum percentages (see STATUTORY_MINIMUM_PERCENT),
 * split by the board's *currently configured* dividend rates, and this
 * member's share of that computed the same way a real distribution
 * would (average share months for interest on share capital, interest
 * paid for patronage refund) — but over [periodStart, now] instead of
 * [periodStart, yearEndDate]. Every number here can move between now
 * and the actual close: more surplus or deficit, a different board
 * decision on statutory percentages, a changed dividend split. The
 * response is explicit about all of this so the client can label it
 * as a rough estimate rather than a promise.
 */
portalRouter.get("/dividend-estimate", async (req, res) => {
  const memberId = currentMemberId(req);

  const fiscalYear = await prisma.fiscalYear.findFirst({
    where: { status: "open" },
    orderBy: { yearEndDate: "desc" },
  });
  if (!fiscalYear) {
    return res.json({ available: false, reason: "No open fiscal year." });
  }

  const periodStart = await getPeriodStart(fiscalYear);
  const asOf = new Date();
  const statement = await getIncomeStatement(periodStart, asOf);

  if (statement.netSurplus <= 0) {
    return res.json({
      available: true,
      asOf,
      fiscalYearId: fiscalYear.id,
      netSurplusSoFar: statement.netSurplus,
      estimatedShareCapitalInterest: 0,
      estimatedPatronageRefund: 0,
      estimatedTotal: 0,
      isEstimate: true,
      assumptions:
        "No net surplus for this fiscal year so far — nothing would be distributed if it closed today.",
    });
  }

  const statutoryPercent =
    STATUTORY_MINIMUM_PERCENT.reserve +
    STATUTORY_MINIMUM_PERCENT.cetf +
    STATUTORY_MINIMUM_PERCENT.communityDev +
    STATUTORY_MINIMUM_PERCENT.optional;
  const assumedStatutoryAmount = round2((statement.netSurplus * statutoryPercent) / 100);
  const unallocatedRemainderEstimate = round2(statement.netSurplus - assumedStatutoryAmount);

  const dividendSetting = await prisma.dividendDistributionSetting.findFirst();
  const shareCapitalInterestPercent = Number(dividendSetting?.shareCapitalInterestPercent ?? 0);
  const patronageRefundPercent = Number(dividendSetting?.patronageRefundPercent ?? 0);

  const sharePoolEstimate = round2((unallocatedRemainderEstimate * shareCapitalInterestPercent) / 100);
  const patronagePoolEstimate = round2((unallocatedRemainderEstimate * patronageRefundPercent) / 100);

  const [shareDaysByMember, interestPaidByMember] = await Promise.all([
    computeAverageShareCapitalByMember(periodStart, asOf),
    computeInterestPaidByMember(periodStart, asOf),
  ]);

  const myShareDays = shareDaysByMember.get(memberId) ?? 0;
  const totalShareDays = Array.from(shareDaysByMember.values()).reduce((sum, v) => sum + v, 0);
  const estimatedShareCapitalInterest =
    totalShareDays > 0 ? round2(sharePoolEstimate * (myShareDays / totalShareDays)) : 0;

  const myInterestPaid = interestPaidByMember.get(memberId) ?? 0;
  const totalInterestPaid = Array.from(interestPaidByMember.values()).reduce((sum, v) => sum + v, 0);
  const estimatedPatronageRefund =
    totalInterestPaid > 0 ? round2(patronagePoolEstimate * (myInterestPaid / totalInterestPaid)) : 0;

  res.json({
    available: true,
    asOf,
    fiscalYearId: fiscalYear.id,
    netSurplusSoFar: statement.netSurplus,
    estimatedShareCapitalInterest,
    estimatedPatronageRefund,
    estimatedTotal: round2(estimatedShareCapitalInterest + estimatedPatronageRefund),
    isEstimate: true,
    assumptions:
      `As of today, assuming the fiscal year closed now with statutory funds at their regulatory ` +
      `minimum (${statutoryPercent}% total) and the board's currently configured dividend split ` +
      `(${shareCapitalInterestPercent}% interest on share capital / ${patronageRefundPercent}% patronage ` +
      `refund). Not a promise — the actual close can use higher statutory percentages, a different split, ` +
      `and covers the full fiscal year, not just the activity so far.`,
  });
});
