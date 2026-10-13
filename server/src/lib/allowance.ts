/**
 * Allowance for probable losses, booked on Portfolio at Risk (days past
 * due) — MC 2022-24 names the account (11242, contra-asset) and the PAR
 * basis, but states no percentage schedule. The only numeric schedule the
 * research report found (MC 2020-18, a COVID relief circular) is
 * explicitly not a confirmed general rule, so every bucket's rate is a
 * setting (AllowanceRateSetting), seeded at 0% — see that model's schema
 * comment. This module only computes; see accounting.routes.ts for the
 * read-only report and the posting action.
 */

export type AllowanceBucket = {
  label: string;
  minDaysPastDue: number;
  maxDaysPastDue: number | null;
};

// Bucket boundaries mirror the report's one numeric source (MC 2020-18);
// treat them as provisional too, not just the rates.
export const ALLOWANCE_BUCKETS: AllowanceBucket[] = [
  { label: "Current", minDaysPastDue: 0, maxDaysPastDue: 0 },
  { label: "1-30 days past due", minDaysPastDue: 1, maxDaysPastDue: 30 },
  { label: "31-90 days past due", minDaysPastDue: 31, maxDaysPastDue: 90 },
  { label: "91-180 days past due", minDaysPastDue: 91, maxDaysPastDue: 180 },
  { label: "181-365 days past due", minDaysPastDue: 181, maxDaysPastDue: 365 },
  { label: "Over 365 days past due", minDaysPastDue: 366, maxDaysPastDue: null },
];

export function classifyAllowanceBucket(daysPastDue: number): string {
  for (const bucket of ALLOWANCE_BUCKETS) {
    if (daysPastDue >= bucket.minDaysPastDue && (bucket.maxDaysPastDue === null || daysPastDue <= bucket.maxDaysPastDue)) {
      return bucket.label;
    }
  }
  return ALLOWANCE_BUCKETS[ALLOWANCE_BUCKETS.length - 1].label;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
