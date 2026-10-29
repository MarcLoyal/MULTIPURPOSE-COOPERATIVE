import { prisma } from "./prisma";
import { computeAging, computeLoanSchedule, round2 } from "./loanSchedule";
import { notFound } from "./httpError";

export type LoanLimit = {
  memberId: string;
  shareCapitalBalance: number;
  shareCapitalMultiplier: number;
  grossLimit: number;
  outstandingLoanBalance: number;
  loanableAmount: number;
  isPlaceholder: boolean;
};

/**
 * Placeholder loanable-amount computation (report gap-analysis
 * follow-up — not yet board-approved): a member's loan limit is
 * modeled as their share capital balance times a settings-driven
 * multiplier, minus what they still owe on active/past-due loans
 * (principal + unpaid interest, same basis as aging.outstandingBalance
 * elsewhere). Informational only — callers mark it unconfirmed and
 * never block on it. Shared by the staff loan-application flow
 * (loans.routes.ts) and the member portal (portal.routes.ts), so the
 * figure a member sees about themselves is computed identically to
 * what staff see about them.
 */
export async function computeLoanLimit(memberId: string): Promise<LoanLimit> {
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) throw notFound("Member not found");

  const [shareAccount, setting, loans] = await Promise.all([
    prisma.shareCapitalAccount.findUnique({ where: { memberId } }),
    prisma.loanLimitSetting.findFirst(),
    prisma.loanAccount.findMany({
      where: { memberId, status: { in: ["active", "past_due"] } },
      include: { transactions: true },
    }),
  ]);

  const shareCapitalBalance = Number(shareAccount?.balance ?? 0);
  const shareCapitalMultiplier = Number(setting?.shareCapitalMultiplier ?? 0);

  const outstandingLoanBalance = round2(
    loans.reduce((sum, loan) => {
      if (!loan.releaseDate) return sum;
      const schedule = computeLoanSchedule(
        loan.computationMethod,
        Number(loan.principalAmount),
        Number(loan.interestRate),
        loan.termMonths,
        loan.releaseDate
      );
      const totalRepaid = loan.transactions
        .filter((t) => t.type === "repayment")
        .reduce((s, t) => s + Number(t.amount), 0);
      return sum + computeAging({ schedule, totalRepaid }).outstandingBalance;
    }, 0)
  );

  const grossLimit = round2(shareCapitalBalance * shareCapitalMultiplier);
  const loanableAmount = Math.max(0, round2(grossLimit - outstandingLoanBalance));

  return {
    memberId,
    shareCapitalBalance,
    shareCapitalMultiplier,
    grossLimit,
    outstandingLoanBalance,
    loanableAmount,
    isPlaceholder: true,
  };
}
