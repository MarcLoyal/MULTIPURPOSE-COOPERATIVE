/**
 * Two interest computation methods (report gap-analysis item 2):
 *
 * - "flat": total interest = principal * interestRate * termMonths, split
 *   evenly across installments. Kept only for loans that already existed
 *   before diminishing balance became the default (see the migration that
 *   added computationMethod) — selecting it for a new product needs a
 *   written auditor/CDA sign-off per CDA MC 2012-05 (report Q22).
 * - "diminishing_balance" (the default): CDA MC 2012-05 Section 4 requires
 *   interest charged only on the outstanding balance at the start of each
 *   period. Implemented here as a standard equal-payment (amortized)
 *   schedule — equal-principal is a documented alternative (report Q23)
 *   not yet implemented.
 *
 * interestRate is the periodic rate as a decimal fraction (e.g. 0.02 for
 * "2% per period"), applied per ratePeriod on the product (monthly by
 * convention today, same as before this file supported diminishing
 * balance).
 */

export type Installment = {
  installmentNumber: number;
  dueDate: Date;
  principalDue: number;
  interestDue: number;
  totalDue: number;
};

export type LoanComputationMethod = "diminishing_balance" | "flat";

export function computeTotalInterest(principal: number, interestRate: number, termMonths: number): number {
  return round2(principal * interestRate * termMonths);
}

/** Flat/simple-interest, equal-installment schedule — see method note above. */
export function computeFlatSchedule(
  principal: number,
  interestRate: number,
  termMonths: number,
  releaseDate: Date
): Installment[] {
  const totalInterest = computeTotalInterest(principal, interestRate, termMonths);
  const principalPerInstallment = round2(principal / termMonths);
  const interestPerInstallment = round2(totalInterest / termMonths);

  const installments: Installment[] = [];
  for (let i = 1; i <= termMonths; i++) {
    const dueDate = addMonths(releaseDate, i);
    const isLast = i === termMonths;
    // Absorb rounding remainder into the final installment.
    const principalDue = isLast
      ? round2(principal - principalPerInstallment * (termMonths - 1))
      : principalPerInstallment;
    const interestDue = isLast
      ? round2(totalInterest - interestPerInstallment * (termMonths - 1))
      : interestPerInstallment;

    installments.push({
      installmentNumber: i,
      dueDate,
      principalDue,
      interestDue,
      totalDue: round2(principalDue + interestDue),
    });
  }
  return installments;
}

/**
 * Diminishing balance, equal-payment amortization — the default. Each
 * period's interest is the periodic rate times the outstanding balance at
 * the start of that period (CDA MC 2012-05 Section 4), not a share of a
 * pre-computed total. The payment amount is held constant (standard
 * amortization formula); the last installment absorbs any rounding
 * remainder, same convention as the flat schedule above.
 */
export function computeDiminishingBalanceSchedule(
  principal: number,
  periodicRate: number,
  termMonths: number,
  releaseDate: Date
): Installment[] {
  const payment =
    periodicRate === 0
      ? principal / termMonths
      : (principal * periodicRate) / (1 - Math.pow(1 + periodicRate, -termMonths));

  const installments: Installment[] = [];
  let outstanding = principal;
  for (let i = 1; i <= termMonths; i++) {
    const dueDate = addMonths(releaseDate, i);
    const isLast = i === termMonths;
    const interestDue = round2(outstanding * periodicRate);
    const principalDue = isLast ? round2(outstanding) : round2(payment - outstanding * periodicRate);

    outstanding = round2(outstanding - principalDue);
    installments.push({
      installmentNumber: i,
      dueDate,
      principalDue,
      interestDue,
      totalDue: round2(principalDue + interestDue),
    });
  }
  return installments;
}

export function computeLoanSchedule(
  method: LoanComputationMethod,
  principal: number,
  interestRate: number,
  termMonths: number,
  releaseDate: Date
): Installment[] {
  return method === "flat"
    ? computeFlatSchedule(principal, interestRate, termMonths, releaseDate)
    : computeDiminishingBalanceSchedule(principal, interestRate, termMonths, releaseDate);
}

/**
 * Splits one repayment into interest/principal by walking the schedule in
 * due-date order, applying each installment's dues interest-first then
 * principal. Interest-first is a default, not a rule — no CDA rule on
 * payment application order was found (report Q26); this replaces the old
 * flat-only global-proportion approximation, which doesn't make sense once
 * interest varies per installment under diminishing balance.
 */
export function splitRepayment(
  schedule: Installment[],
  totalRepaidBefore: number,
  paymentAmount: number
): { interestPortion: number; principalPortion: number } {
  let interestPortion = 0;
  let remainingBefore = totalRepaidBefore;
  let remainingPayment = paymentAmount;

  for (const inst of schedule) {
    if (remainingPayment <= 0.0001) break;

    if (remainingBefore >= inst.totalDue - 0.0001) {
      remainingBefore = round2(remainingBefore - inst.totalDue);
      continue;
    }

    const alreadyAppliedToThis = remainingBefore;
    remainingBefore = 0;
    const interestAlreadyApplied = Math.min(alreadyAppliedToThis, inst.interestDue);
    const interestRemainingDue = round2(inst.interestDue - interestAlreadyApplied);

    const interestPay = Math.min(remainingPayment, interestRemainingDue);
    interestPortion = round2(interestPortion + interestPay);
    remainingPayment = round2(remainingPayment - interestPay);

    const principalAlreadyApplied = round2(alreadyAppliedToThis - interestAlreadyApplied);
    const principalRemainingDue = round2(inst.principalDue - principalAlreadyApplied);
    const principalPay = Math.min(remainingPayment, principalRemainingDue);
    remainingPayment = round2(remainingPayment - principalPay);
  }

  // Derive principal as the remainder so interest + principal reconciles
  // exactly to paymentAmount regardless of rounding drift above.
  return { interestPortion, principalPortion: round2(paymentAmount - interestPortion) };
}

export function computeAging(params: {
  schedule: Installment[];
  totalRepaid: number;
  asOf?: Date;
}): { daysPastDue: number; nextDueDate: Date | null; totalDue: number; outstandingBalance: number } {
  const asOf = params.asOf ?? new Date();
  const totalDue = round2(params.schedule.reduce((sum, i) => sum + i.totalDue, 0));
  const outstandingBalance = Math.max(0, round2(totalDue - params.totalRepaid));

  let cumulativeDue = 0;
  let daysPastDue = 0;
  let nextDueDate: Date | null = null;

  for (const installment of params.schedule) {
    cumulativeDue = round2(cumulativeDue + installment.totalDue);
    const isUnpaidAsOfToday = installment.dueDate <= asOf && cumulativeDue > params.totalRepaid + 0.01;
    if (isUnpaidAsOfToday) {
      daysPastDue = Math.max(daysPastDue, diffInDays(asOf, installment.dueDate));
    }
    if (cumulativeDue > params.totalRepaid + 0.01 && nextDueDate === null) {
      nextDueDate = installment.dueDate;
    }
  }

  return { daysPastDue, nextDueDate, totalDue, outstandingBalance };
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function diffInDays(a: Date, b: Date): number {
  const ms = a.getTime() - b.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
