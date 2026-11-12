import { prisma } from "./prisma";
import { notFound } from "./httpError";
import { computeAging, computeLoanSchedule } from "./loanSchedule";

/**
 * A member's consolidated statement of account: share capital
 * (subscriptions, withdrawals, transfers, and dividends all in one
 * chronological ledger — a dividend is just another ShareCapitalTransaction
 * row, so it's shown in context rather than pulled into its own section),
 * every loan account's transaction history, and every deposit account's
 * transaction history. Full history, not a date-bounded period — there's
 * no "statement period" concept elsewhere in this app to anchor one to.
 *
 * Shared by the staff route (GET /api/members/:id/statement) and the
 * member portal (GET /api/portal/statement) so both render identically;
 * the portal's caller is always scoped to their own member id, never an
 * id this function receives from anything else.
 */
export async function buildMemberStatement(memberId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      shareCapitalAccount: {
        include: {
          transactions: { where: { status: "posted" }, orderBy: { createdAt: "asc" } },
        },
      },
      loanAccounts: {
        orderBy: { createdAt: "asc" },
        include: { transactions: { orderBy: { createdAt: "asc" } } },
      },
      depositAccounts: {
        orderBy: { openedAt: "asc" },
        include: {
          depositProduct: true,
          transactions: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!member) throw notFound("Member not found");

  // "Last dividend" — a dividend is a system-posted ShareCapitalTransaction
  // (no pending/approve step, see shareCapital.routes.ts's PAID_INFLOW_TYPES
  // doc comment), so it's already in the posted-only query above; no
  // extra query needed, just pick the latest one.
  const dividendTxns = (member.shareCapitalAccount?.transactions ?? []).filter((t) => t.type === "dividend");
  const lastDividend = dividendTxns.length
    ? (() => {
        const latest = dividendTxns[dividendTxns.length - 1];
        return { amount: Number(latest.amount), date: latest.createdAt };
      })()
    : null;

  return {
    generatedAt: new Date(),
    member: {
      id: member.id,
      memberNumber: member.memberNumber,
      fullName: member.fullName,
      status: member.status,
      dateJoined: member.dateJoined,
    },
    shareCapital: member.shareCapitalAccount
      ? {
          balance: Number(member.shareCapitalAccount.balance),
          transactions: member.shareCapitalAccount.transactions.map((t) => ({
            id: t.id,
            type: t.type,
            amount: Number(t.amount),
            createdAt: t.createdAt,
          })),
        }
      : null,
    lastDividend,
    loans: member.loanAccounts.map((loan) => {
      // Aging only makes sense once a loan has actually been released —
      // applied/under_review/approved loans have no releaseDate yet and
      // no schedule to age against.
      let aging: ReturnType<typeof computeAging> | null = null;
      if (loan.releaseDate) {
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
        aging = computeAging({ schedule, totalRepaid });
      }
      return {
        id: loan.id,
        loanProduct: loan.loanProduct,
        principalAmount: Number(loan.principalAmount),
        status: loan.status,
        aging,
        transactions: loan.transactions.map((t) => ({
          id: t.id,
          type: t.type,
          amount: Number(t.amount),
          balanceAfter: Number(t.balanceAfter),
          createdAt: t.createdAt,
        })),
      };
    }),
    deposits: member.depositAccounts.map((account) => ({
      id: account.id,
      productName: account.depositProduct.name,
      balance: Number(account.balance),
      status: account.status,
      transactions: account.transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        balanceAfter: Number(t.balanceAfter),
        createdAt: t.createdAt,
      })),
    })),
  };
}
