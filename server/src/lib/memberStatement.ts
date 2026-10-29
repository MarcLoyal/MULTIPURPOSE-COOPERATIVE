import { prisma } from "./prisma";
import { notFound } from "./httpError";

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
    loans: member.loanAccounts.map((loan) => ({
      id: loan.id,
      loanProduct: loan.loanProduct,
      principalAmount: Number(loan.principalAmount),
      status: loan.status,
      transactions: loan.transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        balanceAfter: Number(t.balanceAfter),
        createdAt: t.createdAt,
      })),
    })),
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
