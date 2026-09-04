/**
 * Flat/simple-interest, equal-installment amortization (spec 4.3):
 *   total interest = principal * interestRate * termMonths
 * interestRate is treated as a flat MONTHLY rate expressed as a decimal
 * fraction (e.g. 0.02 for "2% per month"), which is how many Philippine
 * cooperative loan products quote flat rates. If this cooperative's real
 * loan products quote an annual rate instead, this formula needs to
 * change to principal * annualRate * (termMonths / 12) — flagged as an
 * open question in the README pending confirmation of real loan products.
 */

export type Installment = {
  installmentNumber: number;
  dueDate: Date;
  principalDue: number;
  interestDue: number;
  totalDue: number;
};

export function computeTotalInterest(principal: number, interestRate: number, termMonths: number): number {
  return round2(principal * interestRate * termMonths);
}

export function computeSchedule(
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
    const dueDate = new Date(releaseDate);
    dueDate.setMonth(dueDate.getMonth() + i);

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
 * Fixed proportion of every peso collected that represents interest, under
 * the flat/equal-installment schedule (constant across installments except
 * for the last one's rounding remainder — close enough for MVP repayment
 * splitting).
 */
export function interestProportion(principal: number, interestRate: number, termMonths: number): number {
  const totalInterest = computeTotalInterest(principal, interestRate, termMonths);
  const totalDue = principal + totalInterest;
  if (totalDue === 0) return 0;
  return totalInterest / totalDue;
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

function diffInDays(a: Date, b: Date): number {
  const ms = a.getTime() - b.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
