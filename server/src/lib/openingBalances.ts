import { LoanStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { conflict } from "./httpError";
import { parseCsvWithHeader } from "./csvParser";
import { postLedgerBatch } from "./ledger";
import { writeAuditLog } from "./audit";
import { ACCOUNTS } from "./accounts";
import { computeLoanSchedule, computeAging, computeOutstandingPrincipal, round2 } from "./loanSchedule";
import { receivableAccountForStatus } from "./loanReceivable";

/**
 * Opening balances import — brings a cooperative's existing records in
 * from their prior system/paper books as of a chosen cutoff date, so this
 * app's trial balance and balance sheet start from their last audited
 * figures instead of zero. See the five parse* functions for the exact
 * template columns; see buildPreview/commitImport for the two-phase
 * validate-then-commit flow this is built around.
 *
 * Scope and honesty: this import covers members, share capital, loans,
 * and deposits directly, plus a fifth "other GL opening balances" sheet
 * for every other account (cash, fixed assets, payables, statutory
 * funds, undivided net surplus, ...). Every row across all five posts
 * its other side to 30900 "Opening Balance Equity" — see accounts.ts.
 * If every account in the cooperative's real audited trial balance was
 * entered across the five sheets, 30900 nets to exactly zero; anything
 * left over means the opening trial balance wasn't fully entered. The
 * UI surfaces that balance prominently and blocks confirming unless it's
 * zero or the caller explicitly acknowledges it (see commitImport's
 * acknowledgeNonZeroSuspense).
 *
 * Locked permanently after one successful run (OpeningBalanceImport's
 * mere existence — see schema.prisma), and refuses to run at all unless
 * the ledger is completely empty — every transactional action in this
 * app posts to LedgerEntry, so an empty table is this app's reliable
 * proxy for "normal transactions haven't started yet."
 */

const RESERVED_OTHER_ACCOUNT_CODES = new Set<string>([
  ACCOUNTS.MEMBERS_SHARE_CAPITAL,
  ACCOUNTS.LOANS_RECEIVABLE_CURRENT,
  ACCOUNTS.LOANS_RECEIVABLE_PAST_DUE,
  ACCOUNTS.LOANS_RECEIVABLE_RESTRUCTURED,
  ACCOUNTS.SAVINGS_DEPOSITS,
  ACCOUNTS.TIME_DEPOSITS,
  ACCOUNTS.OPENING_BALANCE_EQUITY,
]);

// ---------------------------------------------------------------------------
// Shared cell parsers — Excel-friendly per the brief: rates accept "2%" or
// reject an out-of-range plain number with a clear message; dates accept
// only an unambiguous format (see parseDate's own comment for why);
// member numbers are never coerced to a number, so a leading zero
// survives.
// ---------------------------------------------------------------------------

export type CellResult<T> = { value: T } | { error: string };

function ok<T>(value: T): CellResult<T> {
  return { value };
}
function err<T>(message: string): CellResult<T> {
  return { error: message };
}

function parseAmount(raw: string, fieldLabel: string): CellResult<number> {
  const cleaned = raw.trim().replace(/,/g, "").replace(/^[₱$]/, "");
  if (cleaned === "") return err(`${fieldLabel} is required`);
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return err(`${fieldLabel} "${raw}" isn't a number`);
  return ok(round2(n));
}

/**
 * Accepts a plain decimal fraction (0.02 = 2%) or an explicit percent
 * sign (2% -> 0.02). Rejects a bare number over 1 rather than silently
 * treating "2" as 200% — that's almost always a mistyped "0.02" or "2%",
 * and guessing wrong here would silently overcharge every member on the
 * loan.
 */
function parseRate(raw: string, fieldLabel: string): CellResult<number> {
  const trimmed = raw.trim();
  if (trimmed === "") return err(`${fieldLabel} is required`);
  if (trimmed.endsWith("%")) {
    const n = Number(trimmed.slice(0, -1).trim());
    if (!Number.isFinite(n)) return err(`${fieldLabel} "${raw}" isn't a number`);
    return ok(round2(n / 100));
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return err(`${fieldLabel} "${raw}" isn't a number`);
  if (n > 1) {
    return err(
      `${fieldLabel} "${raw}" looks like a percentage, not a decimal fraction — write 2% as "0.02" or "2%", not "2"`
    );
  }
  if (n < 0) return err(`${fieldLabel} can't be negative`);
  return ok(n);
}

/**
 * Only YYYY-MM-DD (or YYYY/MM/DD, the same order with slashes) is
 * accepted. MM/DD/YYYY and DD/MM/YYYY are deliberately NOT auto-detected
 * — they're ambiguous with each other (03/04/2026 is a different real
 * date depending on which), and guessing wrong would silently corrupt a
 * date rather than fail loudly. Year-first is the one common spreadsheet
 * format with no ambiguity.
 */
function parseDate(raw: string, fieldLabel: string, options?: { optional?: boolean }): CellResult<Date | null> {
  const trimmed = raw.trim();
  if (trimmed === "") {
    if (options?.optional) return ok(null);
    return err(`${fieldLabel} is required`);
  }
  const match = trimmed.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (!match) {
    return err(
      `${fieldLabel} "${raw}" must be in YYYY-MM-DD format (e.g. 2024-01-15). If you're exporting from Excel, ` +
        `format that column as YYYY-MM-DD (or plain text) before saving as CSV — Excel's default date formats ` +
        `(like 1/15/2024) are ambiguous and are rejected rather than guessed at.`
    );
  }
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) {
    return err(`${fieldLabel} "${raw}" isn't a real date`);
  }
  return ok(date);
}

function requireText(raw: string, fieldLabel: string): CellResult<string> {
  const trimmed = raw.trim();
  if (trimmed === "") return err(`${fieldLabel} is required`);
  return ok(trimmed);
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type RowOutcome<T> = { row: number; data: T | null; errors: string[] };

export type ParsedMember = {
  memberNumber: string;
  fullName: string;
  phone?: string;
  email?: string;
  address?: string;
  dateJoined: Date;
  status: "active" | "inactive" | "resigned" | "deceased" | "terminated";
  membershipClass: "regular" | "associate";
  beneficiaryName?: string;
  beneficiaryRelationship?: string;
};

export type ParsedShareCapital = { memberNumber: string; balance: number };

export type ParsedLoan = {
  memberNumber: string;
  loanProductName: string;
  principalAmount: number;
  interestRate: number;
  ratePeriod: "monthly" | "annual";
  computationMethod: "diminishing_balance" | "flat";
  termMonths: number;
  releaseDate: Date;
  totalRepaidToDate: number;
  outstandingPrincipalOverride: number | null;
};

export type ParsedDeposit = {
  memberNumber: string;
  depositProductName: string;
  balance: number;
  openedAt: Date;
  status: "active" | "closed";
};

export type ParsedOtherLine = { accountCode: string; debit: number; credit: number };

const MEMBER_STATUSES = new Set(["active", "inactive", "resigned", "deceased", "terminated"]);
const MEMBERSHIP_CLASSES = new Set(["regular", "associate"]);
const RATE_PERIODS = new Set(["monthly", "annual"]);
const COMPUTATION_METHODS = new Set(["diminishing_balance", "flat"]);
const DEPOSIT_STATUSES = new Set(["active", "closed"]);

function parseMemberRow(cells: Record<string, string>, cutoffDate: Date): RowOutcome<ParsedMember> {
  const errors: string[] = [];
  const memberNumber = requireText(cells.member_number ?? "", "member_number");
  const fullName = requireText(cells.full_name ?? "", "full_name");
  if ("error" in memberNumber) errors.push(memberNumber.error);
  if ("error" in fullName) errors.push(fullName.error);

  const email = (cells.email ?? "").trim();
  if (email !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push(`email "${email}" doesn't look like a valid email address`);
  }

  const status = (cells.status ?? "active").trim() || "active";
  if (!MEMBER_STATUSES.has(status)) {
    errors.push(`status "${status}" must be one of: ${Array.from(MEMBER_STATUSES).join(", ")}`);
  }
  const membershipClass = (cells.membership_class ?? "regular").trim() || "regular";
  if (!MEMBERSHIP_CLASSES.has(membershipClass)) {
    errors.push(`membership_class "${membershipClass}" must be one of: ${Array.from(MEMBERSHIP_CLASSES).join(", ")}`);
  }

  const dateJoinedResult = parseDate(cells.date_joined ?? "", "date_joined", { optional: true });
  if ("error" in dateJoinedResult) errors.push(dateJoinedResult.error);

  if (errors.length > 0) return { row: 0, data: null, errors };

  return {
    row: 0,
    data: {
      memberNumber: (memberNumber as { value: string }).value,
      fullName: (fullName as { value: string }).value,
      phone: cells.phone?.trim() || undefined,
      email: email || undefined,
      address: cells.address?.trim() || undefined,
      dateJoined: (dateJoinedResult as { value: Date | null }).value ?? cutoffDate,
      status: status as ParsedMember["status"],
      membershipClass: membershipClass as ParsedMember["membershipClass"],
      beneficiaryName: cells.beneficiary_name?.trim() || undefined,
      beneficiaryRelationship: cells.beneficiary_relationship?.trim() || undefined,
    },
    errors: [],
  };
}

function parseShareCapitalRow(cells: Record<string, string>): RowOutcome<ParsedShareCapital> {
  const errors: string[] = [];
  const memberNumber = requireText(cells.member_number ?? "", "member_number");
  const balance = parseAmount(cells.balance ?? "", "balance");
  if ("error" in memberNumber) errors.push(memberNumber.error);
  if ("error" in balance) errors.push(balance.error);
  else if (balance.value < 0) errors.push("balance can't be negative");
  if (errors.length > 0) return { row: 0, data: null, errors };
  return {
    row: 0,
    data: { memberNumber: (memberNumber as { value: string }).value, balance: (balance as { value: number }).value },
    errors: [],
  };
}

function parseLoanRow(cells: Record<string, string>, matchedProduct: { interestRate: number; ratePeriod: string; computationMethod: string } | null): RowOutcome<ParsedLoan> {
  const errors: string[] = [];
  const memberNumber = requireText(cells.member_number ?? "", "member_number");
  const loanProductName = requireText(cells.loan_product_name ?? "", "loan_product_name");
  const principalAmount = parseAmount(cells.principal_amount ?? "", "principal_amount");
  const termMonthsRaw = (cells.term_months ?? "").trim();
  const termMonths = Number(termMonthsRaw);
  const releaseDateResult = parseDate(cells.release_date ?? "", "release_date");
  const totalRepaidRaw = (cells.total_repaid_to_date ?? "").trim();
  const totalRepaidResult = totalRepaidRaw === "" ? ok(0) : parseAmount(totalRepaidRaw, "total_repaid_to_date");
  const overrideRaw = (cells.outstanding_principal ?? "").trim();
  const overrideResult = overrideRaw === "" ? ok<number | null>(null) : parseAmount(overrideRaw, "outstanding_principal");

  if ("error" in memberNumber) errors.push(memberNumber.error);
  if ("error" in loanProductName) errors.push(loanProductName.error);
  if ("error" in principalAmount) errors.push(principalAmount.error);
  if (!termMonthsRaw) errors.push("term_months is required");
  else if (!Number.isInteger(termMonths) || termMonths <= 0) errors.push(`term_months "${termMonthsRaw}" must be a whole number greater than 0`);
  if ("error" in releaseDateResult) errors.push(releaseDateResult.error);
  if ("error" in totalRepaidResult) errors.push(totalRepaidResult.error);
  if ("error" in overrideResult) errors.push(overrideResult.error);

  // Rate/period/method: filled from the matched product unless the sheet
  // overrides them (or the product didn't match, in which case they're
  // required directly).
  const rateRaw = (cells.interest_rate ?? "").trim();
  const ratePeriodRaw = (cells.rate_period ?? "").trim();
  const methodRaw = (cells.computation_method ?? "").trim();

  let interestRate: number | undefined;
  if (rateRaw !== "") {
    const r = parseRate(rateRaw, "interest_rate");
    if ("error" in r) errors.push(r.error);
    else interestRate = r.value;
  } else if (matchedProduct) {
    interestRate = matchedProduct.interestRate;
  } else {
    errors.push("interest_rate is required when loan_product_name doesn't match an existing active loan product");
  }

  let ratePeriod: string | undefined;
  if (ratePeriodRaw !== "") {
    if (!RATE_PERIODS.has(ratePeriodRaw)) errors.push(`rate_period "${ratePeriodRaw}" must be one of: monthly, annual`);
    else ratePeriod = ratePeriodRaw;
  } else if (matchedProduct) {
    ratePeriod = matchedProduct.ratePeriod;
  } else {
    errors.push("rate_period is required when loan_product_name doesn't match an existing active loan product");
  }

  let computationMethod: string | undefined;
  if (methodRaw !== "") {
    if (!COMPUTATION_METHODS.has(methodRaw)) errors.push(`computation_method "${methodRaw}" must be one of: diminishing_balance, flat`);
    else computationMethod = methodRaw;
  } else if (matchedProduct) {
    computationMethod = matchedProduct.computationMethod;
  } else {
    errors.push("computation_method is required when loan_product_name doesn't match an existing active loan product");
  }

  if (errors.length > 0) return { row: 0, data: null, errors };

  return {
    row: 0,
    data: {
      memberNumber: (memberNumber as { value: string }).value,
      loanProductName: (loanProductName as { value: string }).value,
      principalAmount: (principalAmount as { value: number }).value,
      interestRate: interestRate!,
      ratePeriod: ratePeriod as ParsedLoan["ratePeriod"],
      computationMethod: computationMethod as ParsedLoan["computationMethod"],
      termMonths,
      releaseDate: (releaseDateResult as { value: Date }).value,
      totalRepaidToDate: (totalRepaidResult as { value: number }).value,
      outstandingPrincipalOverride: (overrideResult as { value: number | null }).value,
    },
    errors: [],
  };
}

function parseDepositRow(cells: Record<string, string>, cutoffDate: Date): RowOutcome<ParsedDeposit> {
  const errors: string[] = [];
  const memberNumber = requireText(cells.member_number ?? "", "member_number");
  const depositProductName = requireText(cells.deposit_product_name ?? "", "deposit_product_name");
  const balance = parseAmount(cells.balance ?? "", "balance");
  const openedAtResult = parseDate(cells.opened_at ?? "", "opened_at", { optional: true });
  const status = (cells.status ?? "active").trim() || "active";

  if ("error" in memberNumber) errors.push(memberNumber.error);
  if ("error" in depositProductName) errors.push(depositProductName.error);
  if ("error" in balance) errors.push(balance.error);
  else if (balance.value < 0) errors.push("balance can't be negative");
  if ("error" in openedAtResult) errors.push(openedAtResult.error);
  if (!DEPOSIT_STATUSES.has(status)) errors.push(`status "${status}" must be one of: active, closed`);

  if (errors.length > 0) return { row: 0, data: null, errors };

  return {
    row: 0,
    data: {
      memberNumber: (memberNumber as { value: string }).value,
      depositProductName: (depositProductName as { value: string }).value,
      balance: (balance as { value: number }).value,
      openedAt: (openedAtResult as { value: Date | null }).value ?? cutoffDate,
      status: status as ParsedDeposit["status"],
    },
    errors: [],
  };
}

function parseOtherRow(cells: Record<string, string>, validAccounts: Map<string, { label: string; isActive: boolean }>): RowOutcome<ParsedOtherLine> {
  const errors: string[] = [];
  const accountCode = requireText(cells.account_code ?? "", "account_code");
  const debitRaw = (cells.debit ?? "").trim();
  const creditRaw = (cells.credit ?? "").trim();
  const debit = debitRaw === "" ? ok(0) : parseAmount(debitRaw, "debit");
  const credit = creditRaw === "" ? ok(0) : parseAmount(creditRaw, "credit");

  if ("error" in accountCode) errors.push(accountCode.error);
  else {
    if (RESERVED_OTHER_ACCOUNT_CODES.has(accountCode.value)) {
      errors.push(
        `account_code ${accountCode.value} is handled by one of the other templates (or is this import's own ` +
          `balancing account) — don't enter it on this sheet`
      );
    } else {
      const account = validAccounts.get(accountCode.value);
      if (!account) errors.push(`account_code "${accountCode.value}" doesn't exist in the chart of accounts`);
      else if (!account.isActive) errors.push(`account_code ${accountCode.value} (${account.label}) is inactive`);
    }
  }
  if ("error" in debit) errors.push(debit.error);
  if ("error" in credit) errors.push(credit.error);

  if (errors.length === 0) {
    const d = (debit as { value: number }).value;
    const c = (credit as { value: number }).value;
    if (d > 0 && c > 0) errors.push("only one of debit or credit may be filled in for a row, not both");
    if (d === 0 && c === 0) errors.push("one of debit or credit must be filled in");
  }

  if (errors.length > 0) return { row: 0, data: null, errors };

  return {
    row: 0,
    data: {
      accountCode: (accountCode as { value: string }).value,
      debit: (debit as { value: number }).value,
      credit: (credit as { value: number }).value,
    },
    errors: [],
  };
}

// ---------------------------------------------------------------------------
// Preview (validate-only, no writes)
// ---------------------------------------------------------------------------

export type OpeningBalancesPreview = {
  cutoffDate: string;
  alreadyLocked: boolean;
  ledgerEmpty: boolean;
  members: { rows: RowOutcome<ParsedMember>[]; errorCount: number };
  shareCapital: { rows: RowOutcome<ParsedShareCapital>[]; errorCount: number; totalBalance: number };
  loans: {
    rows: (RowOutcome<ParsedLoan> & {
      scheduleDerivedOutstandingPrincipal?: number;
      glOutstandingPrincipal?: number;
      overrideDifference?: number;
      daysPastDue?: number;
      resultingStatus?: string;
    })[];
    errorCount: number;
    totalOutstanding: number;
  };
  deposits: { rows: RowOutcome<ParsedDeposit>[]; errorCount: number; totalBalance: number };
  other: { rows: RowOutcome<ParsedOtherLine>[]; errorCount: number };
  suspenseBalance: number;
  totalErrorCount: number;
  canConfirm: boolean;
};

async function loadReferenceData() {
  const [members, loanProducts, depositProducts, accounts] = await Promise.all([
    prisma.member.findMany({ select: { memberNumber: true } }),
    prisma.loanProduct.findMany({ where: { isActive: true } }),
    prisma.depositProduct.findMany({ where: { isActive: true } }),
    prisma.account.findMany({ select: { code: true, label: true, isActive: true } }),
  ]);
  return {
    existingMemberNumbers: new Set(members.map((m) => m.memberNumber)),
    loanProductsByName: new Map(loanProducts.map((p) => [p.name, p])),
    depositProductsByName: new Map(depositProducts.map((p) => [p.name, p])),
    accountsByCode: new Map(accounts.map((a) => [a.code, { label: a.label, isActive: a.isActive }])),
  };
}

export async function buildPreview(input: {
  cutoffDate: string;
  membersCsv?: string;
  shareCapitalCsv?: string;
  loansCsv?: string;
  depositsCsv?: string;
  otherCsv?: string;
}): Promise<OpeningBalancesPreview> {
  const cutoffResult = parseDate(input.cutoffDate, "cutoff date");
  const cutoffDate = "error" in cutoffResult ? new Date(NaN) : cutoffResult.value!;

  const [alreadyLocked, ledgerCount, ref] = await Promise.all([
    prisma.openingBalanceImport.findFirst({ select: { id: true } }).then((r) => Boolean(r)),
    prisma.ledgerEntry.count(),
    loadReferenceData(),
  ]);

  const membersCsv = parseCsvWithHeader(input.membersCsv ?? "");
  const shareCapitalCsv = parseCsvWithHeader(input.shareCapitalCsv ?? "");
  const loansCsv = parseCsvWithHeader(input.loansCsv ?? "");
  const depositsCsv = parseCsvWithHeader(input.depositsCsv ?? "");
  const otherCsv = parseCsvWithHeader(input.otherCsv ?? "");

  const memberRows: RowOutcome<ParsedMember>[] = membersCsv.rows.map((cells, idx) => ({
    ...parseMemberRow(cells, cutoffDate),
    row: idx + 2,
  }));

  // Member numbers this batch will create, for cross-sheet resolution —
  // combined with members already in the database, since the sheets
  // don't have to create every member themselves (an already-onboarded
  // member can just get balances attached).
  const batchMemberNumbers = new Set(
    memberRows.filter((r): r is RowOutcome<ParsedMember> & { data: ParsedMember } => r.data !== null).map((r) => r.data.memberNumber)
  );
  const seenMemberNumbers = new Set<string>();
  for (const r of memberRows) {
    if (!r.data) continue;
    if (seenMemberNumbers.has(r.data.memberNumber)) {
      r.errors.push(`member_number "${r.data.memberNumber}" appears more than once in this sheet`);
      (r as RowOutcome<ParsedMember>).data = null;
    } else {
      seenMemberNumbers.add(r.data.memberNumber);
      if (ref.existingMemberNumbers.has(r.data.memberNumber)) {
        r.errors.push(`member_number "${r.data.memberNumber}" already exists — remove it from this sheet if you only meant to attach balances to it`);
        (r as RowOutcome<ParsedMember>).data = null;
      }
    }
  }

  function resolveMemberNumber(memberNumber: string, errors: string[]) {
    if (!batchMemberNumbers.has(memberNumber) && !ref.existingMemberNumbers.has(memberNumber)) {
      errors.push(`member_number "${memberNumber}" isn't in the Members sheet and doesn't already exist`);
    }
  }

  const shareCapitalRows: RowOutcome<ParsedShareCapital>[] = shareCapitalCsv.rows.map((cells, idx) => {
    const result = { ...parseShareCapitalRow(cells), row: idx + 2 };
    if (result.data) resolveMemberNumber(result.data.memberNumber, result.errors);
    if (result.errors.length > 0) result.data = null;
    return result;
  });
  const seenShareCapitalMembers = new Set<string>();
  for (const r of shareCapitalRows) {
    if (!r.data) continue;
    if (seenShareCapitalMembers.has(r.data.memberNumber)) {
      r.errors.push(`member_number "${r.data.memberNumber}" appears more than once in this sheet`);
      r.data = null;
    } else {
      seenShareCapitalMembers.add(r.data.memberNumber);
    }
  }

  const loanRows: OpeningBalancesPreview["loans"]["rows"] = loansCsv.rows.map((cells, idx) => {
    const productName = (cells.loan_product_name ?? "").trim();
    const matched = ref.loanProductsByName.get(productName);
    const matchedForParsing = matched
      ? { interestRate: Number(matched.interestRate), ratePeriod: matched.ratePeriod, computationMethod: matched.computationMethod }
      : null;
    const result = { ...parseLoanRow(cells, matchedForParsing), row: idx + 2 };
    if (result.data) resolveMemberNumber(result.data.memberNumber, result.errors);

    if (result.data && result.errors.length === 0) {
      const schedule = computeLoanSchedule(
        result.data.computationMethod,
        result.data.principalAmount,
        result.data.interestRate,
        result.data.termMonths,
        result.data.releaseDate
      );
      if (result.data.totalRepaidToDate > round2(schedule.reduce((s, i) => s + i.totalDue, 0)) + 0.01) {
        result.errors.push("total_repaid_to_date is more than the full principal + interest this loan's schedule totals — check principal_amount, interest_rate, and term_months");
      } else {
        const scheduleDerivedOutstandingPrincipal = computeOutstandingPrincipal(result.data.principalAmount, schedule, result.data.totalRepaidToDate);
        const glOutstandingPrincipal = result.data.outstandingPrincipalOverride ?? scheduleDerivedOutstandingPrincipal;
        const aging = computeAging({ schedule, totalRepaid: result.data.totalRepaidToDate, asOf: cutoffDate });
        const resultingStatus = glOutstandingPrincipal <= 0.01 ? "closed" : aging.daysPastDue > 0 ? "past_due" : "active";
        Object.assign(result, {
          scheduleDerivedOutstandingPrincipal,
          glOutstandingPrincipal,
          overrideDifference:
            result.data.outstandingPrincipalOverride !== null
              ? round2(result.data.outstandingPrincipalOverride - scheduleDerivedOutstandingPrincipal)
              : undefined,
          daysPastDue: aging.daysPastDue,
          resultingStatus,
        });
      }
    }
    if (result.errors.length > 0) result.data = null;
    return result;
  });

  const depositRows: RowOutcome<ParsedDeposit>[] = depositsCsv.rows.map((cells, idx) => {
    const result = { ...parseDepositRow(cells, cutoffDate), row: idx + 2 };
    if (result.data) {
      resolveMemberNumber(result.data.memberNumber, result.errors);
      if (!ref.depositProductsByName.has(result.data.depositProductName)) {
        result.errors.push(`deposit_product_name "${result.data.depositProductName}" doesn't match an existing active deposit product — create it first under Settings → Deposit Products`);
      }
    }
    if (result.errors.length > 0) result.data = null;
    return result;
  });

  const otherRows: RowOutcome<ParsedOtherLine>[] = otherCsv.rows.map((cells, idx) => ({
    ...parseOtherRow(cells, ref.accountsByCode),
    row: idx + 2,
  }));

  const totalShareCapital = round2(shareCapitalRows.reduce((s, r) => s + (r.data?.balance ?? 0), 0));
  const totalLoansOutstanding = round2(
    loanRows.reduce((s, r) => s + ((r as any).glOutstandingPrincipal ?? 0), 0)
  );
  const totalDeposits = round2(depositRows.reduce((s, r) => s + (r.data?.balance ?? 0), 0));
  const otherDebit = round2(otherRows.reduce((s, r) => s + (r.data?.debit ?? 0), 0));
  const otherCredit = round2(otherRows.reduce((s, r) => s + (r.data?.credit ?? 0), 0));

  // 30900's resulting signed (credit-normal) balance: every loan row
  // debits a receivable and credits 30900; every share capital/deposit
  // row credits its account and debits 30900; every "other" row does
  // whichever side is populated against 30900 on the other side. Summed
  // up, 30900's own balance is exactly (debits elsewhere - credits
  // elsewhere) — see this file's own doc comment for the full reasoning.
  const suspenseBalance = round2(totalLoansOutstanding + otherDebit - totalShareCapital - totalDeposits - otherCredit);

  const errorCounts = {
    members: memberRows.reduce((s, r) => s + r.errors.length, 0),
    shareCapital: shareCapitalRows.reduce((s, r) => s + r.errors.length, 0),
    loans: loanRows.reduce((s, r) => s + r.errors.length, 0),
    deposits: depositRows.reduce((s, r) => s + r.errors.length, 0),
    other: otherRows.reduce((s, r) => s + r.errors.length, 0),
  };
  const totalErrorCount = Object.values(errorCounts).reduce((a, b) => a + b, 0) + ("error" in cutoffResult ? 1 : 0);
  const ledgerEmpty = ledgerCount === 0;

  return {
    cutoffDate: input.cutoffDate,
    alreadyLocked,
    ledgerEmpty,
    members: { rows: memberRows, errorCount: errorCounts.members },
    shareCapital: { rows: shareCapitalRows, errorCount: errorCounts.shareCapital, totalBalance: totalShareCapital },
    loans: { rows: loanRows, errorCount: errorCounts.loans, totalOutstanding: totalLoansOutstanding },
    deposits: { rows: depositRows, errorCount: errorCounts.deposits, totalBalance: totalDeposits },
    other: { rows: otherRows, errorCount: errorCounts.other },
    suspenseBalance,
    totalErrorCount,
    // Whether /commit would succeed right now with no override — a
    // nonzero suspense balance needs acknowledgeNonZeroSuspense, which
    // this preview doesn't know the caller's answer to yet, so it's
    // reported as "can't confirm without one" rather than guessed at.
    canConfirm: !alreadyLocked && ledgerEmpty && totalErrorCount === 0 && Math.abs(suspenseBalance) <= 0.01,
  };
}

// ---------------------------------------------------------------------------
// Commit — re-validates from scratch (never trusts a client-held preview
// across the gap), then performs the whole import as one transaction.
// ---------------------------------------------------------------------------

export async function commitImport(
  input: Parameters<typeof buildPreview>[0] & { acknowledgeNonZeroSuspense?: boolean },
  performedBy: { id: string; name: string }
) {
  const preview = await buildPreview(input);
  if (preview.alreadyLocked) {
    throw conflict("Opening balances have already been imported and can't be imported again.");
  }
  if (!preview.ledgerEmpty) {
    throw conflict("The ledger already has transactions in it — opening balances can only be imported before any normal transaction is recorded.");
  }
  if (preview.totalErrorCount > 0) {
    throw conflict(`This import still has ${preview.totalErrorCount} validation error(s) — fix them and re-validate before confirming.`);
  }
  if (Math.abs(preview.suspenseBalance) > 0.01 && !input.acknowledgeNonZeroSuspense) {
    throw conflict(
      `Opening Balance Equity (30900) would be ${preview.suspenseBalance.toFixed(2)} after this import, not zero. ` +
        `Add the missing accounts to the "Other GL opening balances" sheet, or confirm again with the override ` +
        `acknowledged if this is intentional.`
    );
  }

  const cutoffDate = new Date(input.cutoffDate);

  const result = await prisma.$transaction(
    async (tx) => {
      const memberIdByNumber = new Map<string, string>();
      for (const existing of await tx.member.findMany({ select: { id: true, memberNumber: true } })) {
        memberIdByNumber.set(existing.memberNumber, existing.id);
      }

      for (const row of preview.members.rows) {
        if (!row.data) continue;
        const member = await tx.member.create({
          data: {
            memberNumber: row.data.memberNumber,
            fullName: row.data.fullName,
            phone: row.data.phone,
            email: row.data.email,
            address: row.data.address,
            dateJoined: row.data.dateJoined,
            status: row.data.status,
            membershipClass: row.data.membershipClass,
            beneficiaryName: row.data.beneficiaryName,
            beneficiaryRelationship: row.data.beneficiaryRelationship,
            createdById: performedBy.id,
          },
        });
        memberIdByNumber.set(member.memberNumber, member.id);
        await writeAuditLog(tx, {
          entityType: "Member",
          entityId: member.id,
          action: "create",
          newValue: { memberNumber: member.memberNumber, fullName: member.fullName, source: "opening_balance_import" },
          performedBy,
        });
      }

      for (const row of preview.shareCapital.rows) {
        if (!row.data || row.data.balance === 0) continue;
        const memberId = memberIdByNumber.get(row.data.memberNumber)!;
        const account = await tx.shareCapitalAccount.create({
          data: { memberId, balance: row.data.balance },
        });
        const txn = await tx.shareCapitalTransaction.create({
          data: {
            shareCapitalAccountId: account.id,
            type: "subscription",
            amount: row.data.balance,
            status: "posted",
            createdById: performedBy.id,
            approvedById: performedBy.id,
            approvedAt: cutoffDate,
            createdAt: cutoffDate,
          },
        });
        await postLedgerBatch(tx, {
          sourceType: "share_capital",
          shareCapitalTransactionId: txn.id,
          createdById: performedBy.id,
          memo: `Opening balance import — share capital, member ${row.data.memberNumber}`,
          entryDate: cutoffDate,
          lines: [
            { accountCode: ACCOUNTS.MEMBERS_SHARE_CAPITAL, credit: row.data.balance },
            { accountCode: ACCOUNTS.OPENING_BALANCE_EQUITY, debit: row.data.balance },
          ],
        });
      }

      for (const row of preview.loans.rows) {
        if (!row.data) continue;
        const r = row as (typeof row & { glOutstandingPrincipal: number; resultingStatus: LoanStatus });
        const memberId = memberIdByNumber.get(row.data.memberNumber)!;
        const schedule = computeLoanSchedule(
          row.data.computationMethod,
          row.data.principalAmount,
          row.data.interestRate,
          row.data.termMonths,
          row.data.releaseDate
        );
        const aging = computeAging({ schedule, totalRepaid: row.data.totalRepaidToDate, asOf: cutoffDate });
        const product = row.data.loanProductName ? await tx.loanProduct.findUnique({ where: { name: row.data.loanProductName } }) : null;

        const loan = await tx.loanAccount.create({
          data: {
            memberId,
            loanProduct: row.data.loanProductName,
            loanProductId: product?.id,
            principalAmount: row.data.principalAmount,
            interestRate: row.data.interestRate,
            computationMethod: row.data.computationMethod,
            ratePeriod: row.data.ratePeriod,
            termMonths: row.data.termMonths,
            status: r.resultingStatus,
            releaseDate: row.data.releaseDate,
          },
        });
        const loanTxn = await tx.loanTransaction.create({
          data: {
            loanAccountId: loan.id,
            type: "release",
            amount: row.data.principalAmount,
            balanceAfter: aging.outstandingBalance,
            createdById: performedBy.id,
            createdAt: cutoffDate,
          },
        });
        await writeAuditLog(tx, {
          entityType: "LoanAccount",
          entityId: loan.id,
          action: "create",
          newValue: { memberId, principal: row.data.principalAmount, status: r.resultingStatus, source: "opening_balance_import" },
          performedBy,
        });

        if (r.glOutstandingPrincipal > 0.01) {
          const receivableAccount = receivableAccountForStatus(r.resultingStatus) ?? ACCOUNTS.LOANS_RECEIVABLE_CURRENT;
          await postLedgerBatch(tx, {
            sourceType: "loan",
            loanTransactionId: loanTxn.id,
            createdById: performedBy.id,
            memo: `Opening balance import — loan, member ${row.data.memberNumber}`,
            entryDate: cutoffDate,
            lines: [
              { accountCode: receivableAccount, debit: r.glOutstandingPrincipal },
              { accountCode: ACCOUNTS.OPENING_BALANCE_EQUITY, credit: r.glOutstandingPrincipal },
            ],
          });
        }
      }

      for (const row of preview.deposits.rows) {
        if (!row.data) continue;
        const memberId = memberIdByNumber.get(row.data.memberNumber)!;
        const product = await tx.depositProduct.findUnique({ where: { name: row.data.depositProductName } });
        const account = await tx.depositAccount.create({
          data: {
            memberId,
            depositProductId: product!.id,
            balance: row.data.balance,
            status: row.data.status,
            openedAt: row.data.openedAt,
          },
        });
        if (row.data.balance > 0) {
          const txn = await tx.depositTransaction.create({
            data: {
              depositAccountId: account.id,
              type: "deposit",
              amount: row.data.balance,
              balanceAfter: row.data.balance,
              createdById: performedBy.id,
              createdAt: cutoffDate,
            },
          });
          const receivableAccount = product!.type === "time" ? ACCOUNTS.TIME_DEPOSITS : ACCOUNTS.SAVINGS_DEPOSITS;
          await postLedgerBatch(tx, {
            sourceType: "deposit",
            depositTransactionId: txn.id,
            createdById: performedBy.id,
            memo: `Opening balance import — deposit, member ${row.data.memberNumber}`,
            entryDate: cutoffDate,
            lines: [
              { accountCode: ACCOUNTS.OPENING_BALANCE_EQUITY, debit: row.data.balance },
              { accountCode: receivableAccount, credit: row.data.balance },
            ],
          });
        }
      }

      for (const row of preview.other.rows) {
        if (!row.data) continue;
        const amount = row.data.debit > 0 ? row.data.debit : row.data.credit;
        await postLedgerBatch(tx, {
          sourceType: "manual",
          createdById: performedBy.id,
          memo: `Opening balance import — account ${row.data.accountCode}`,
          entryDate: cutoffDate,
          lines:
            row.data.debit > 0
              ? [
                  { accountCode: row.data.accountCode, debit: amount },
                  { accountCode: ACCOUNTS.OPENING_BALANCE_EQUITY, credit: amount },
                ]
              : [
                  { accountCode: row.data.accountCode, credit: amount },
                  { accountCode: ACCOUNTS.OPENING_BALANCE_EQUITY, debit: amount },
                ],
        });
      }

      const lockRow = await tx.openingBalanceImport.create({
        data: {
          cutoffDate,
          membersImported: preview.members.rows.filter((r) => r.data).length,
          shareCapitalImported: preview.shareCapital.rows.filter((r) => r.data).length,
          loansImported: preview.loans.rows.filter((r) => r.data).length,
          depositsImported: preview.deposits.rows.filter((r) => r.data).length,
          otherLinesImported: preview.other.rows.filter((r) => r.data).length,
          suspenseBalance: preview.suspenseBalance,
          performedById: performedBy.id,
          performedByName: performedBy.name,
        },
      });
      await writeAuditLog(tx, {
        entityType: "OpeningBalanceImport",
        entityId: lockRow.id,
        action: "create",
        newValue: lockRow,
        performedBy,
      });

      return lockRow;
    },
    { timeout: 60000 }
  );

  return result;
}
