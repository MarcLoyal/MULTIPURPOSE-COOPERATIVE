/**
 * Proves the opening-balances-import validation logic (POST
 * /api/opening-balances/validate) without ever calling /commit — commit
 * is one-time-locked and requires an empty ledger (see
 * lib/openingBalances.ts's doc comment), neither of which this shared
 * dev database can guarantee, so the actual commit flow is verified
 * separately against a freshly migrated local database, not here.
 * Everything /validate does is read-only, so it's safe to exercise
 * against this database as-is.
 *
 * Run with: npm test (see package.json)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import bcrypt from "bcryptjs";
import { app } from "../app";
import { prisma } from "../lib/prisma";

const PASSWORD = "TestPassword123!";
const RUN_ID = Date.now();

let adminUser: { id: string; email: string };
let adminToken: string;
let managerUser: { id: string; email: string };
let managerToken: string;
let existingMember: { id: string; memberNumber: string };
let depositProduct: { id: string; name: string };

before(async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  adminUser = await prisma.user.create({
    data: { name: "Test OB Admin", email: `test-ob-admin-${RUN_ID}@example.com`, passwordHash, role: "admin" },
  });
  managerUser = await prisma.user.create({
    data: { name: "Test OB Manager", email: `test-ob-manager-${RUN_ID}@example.com`, passwordHash, role: "manager" },
  });
  existingMember = await prisma.member.create({
    data: { memberNumber: `TEST-OB-EXISTING-${RUN_ID}`, fullName: "Existing Member", status: "active" },
  });
  depositProduct = await prisma.depositProduct.create({
    data: { name: `Test OB Savings ${RUN_ID}`, type: "savings", interestRate: 0.01 },
  });

  const adminLogin = await request(app).post("/api/auth/login").send({ email: adminUser.email, password: PASSWORD });
  adminToken = adminLogin.body.token;
  assert.ok(adminToken, "admin login should succeed");

  const managerLogin = await request(app)
    .post("/api/auth/login")
    .send({ email: managerUser.email, password: PASSWORD });
  managerToken = managerLogin.body.token;
  assert.ok(managerToken, "manager login should succeed");
});

after(async () => {
  await prisma.member.deleteMany({ where: { id: existingMember.id } });
  await prisma.user.deleteMany({ where: { id: { in: [adminUser.id, managerUser.id] } } });
  await prisma.depositProduct.deleteMany({ where: { id: depositProduct.id } });
  await prisma.$disconnect();
});

function validate(token: string, body: Record<string, unknown>) {
  return request(app).post("/api/opening-balances/validate").set("Authorization", `Bearer ${token}`).send(body);
}

test("a non-admin role gets 403 on the opening balances router", async () => {
  const res = await validate(managerToken, { cutoffDate: "2026-01-01" });
  assert.equal(res.status, 403);
});

test("interest_rate given as a bare number over 1 is rejected with a clear percentage message, '2%' is accepted", async () => {
  const loansCsv = [
    "member_number,loan_product_name,principal_amount,interest_rate,rate_period,computation_method,term_months,release_date,total_repaid_to_date,outstanding_principal",
    `${existingMember.memberNumber},Ad Hoc Loan,10000,2,monthly,diminishing_balance,12,2024-01-01,0,`,
  ].join("\n");
  const res = await validate(adminToken, { cutoffDate: "2026-01-01", loansCsv });
  assert.equal(res.status, 200);
  assert.equal(res.body.loans.errorCount, 1);
  assert.match(res.body.loans.rows[0].errors[0], /percentage|decimal fraction/i);

  const okCsv = loansCsv.replace(",2,monthly,", ",2%,monthly,");
  const okRes = await validate(adminToken, { cutoffDate: "2026-01-01", loansCsv: okCsv });
  assert.equal(okRes.status, 200);
  assert.equal(okRes.body.loans.errorCount, 0);
});

test("an ambiguous date format (MM/DD/YYYY) is rejected; YYYY-MM-DD and YYYY/MM/DD are both accepted", async () => {
  const header = "member_number,deposit_product_name,balance,opened_at,status";

  const badRes = await validate(adminToken, {
    cutoffDate: "2026-01-01",
    depositsCsv: [header, `${existingMember.memberNumber},${depositProduct.name},5000,01/15/2024,active`].join("\n"),
  });
  assert.equal(badRes.body.deposits.errorCount, 1);
  assert.match(badRes.body.deposits.rows[0].errors[0], /YYYY-MM-DD/);

  const okRes = await validate(adminToken, {
    cutoffDate: "2026-01-01",
    depositsCsv: [header, `${existingMember.memberNumber},${depositProduct.name},5000,2024/01/15,active`].join("\n"),
  });
  assert.equal(okRes.body.deposits.errorCount, 0, `unexpected error(s): ${JSON.stringify(okRes.body.deposits.rows[0]?.errors)}`);
});

test("a member number with a leading zero survives as text, not coerced to a number", async () => {
  const membersCsv = [
    "member_number,full_name,phone,email,address,date_joined,status,membership_class,beneficiary_name,beneficiary_relationship",
    `OB-0007-${RUN_ID},Leading Zero Member,,,,2024-01-01,active,regular,,`,
  ].join("\n");
  const res = await validate(adminToken, { cutoffDate: "2026-01-01", membersCsv });
  assert.equal(res.status, 200);
  assert.equal(res.body.members.errorCount, 0);
  assert.equal(res.body.members.rows[0].data.memberNumber, `OB-0007-${RUN_ID}`);
});

test("a duplicate member_number within the Members sheet is rejected", async () => {
  const membersCsv = [
    "member_number,full_name,phone,email,address,date_joined,status,membership_class,beneficiary_name,beneficiary_relationship",
    `OB-DUP-${RUN_ID},First,,,,2024-01-01,active,regular,,`,
    `OB-DUP-${RUN_ID},Second,,,,2024-01-01,active,regular,,`,
  ].join("\n");
  const res = await validate(adminToken, { cutoffDate: "2026-01-01", membersCsv });
  assert.equal(res.body.members.errorCount, 1);
  assert.match(res.body.members.rows[1].errors[0], /more than once/);
});

test("a share capital row referencing a member_number not in the Members sheet or the database is rejected", async () => {
  const res = await validate(adminToken, {
    cutoffDate: "2026-01-01",
    shareCapitalCsv: ["member_number,balance", `NO-SUCH-MEMBER-${RUN_ID},1000`].join("\n"),
  });
  assert.equal(res.body.shareCapital.errorCount, 1);
  assert.match(res.body.shareCapital.rows[0].errors[0], /isn't in the Members sheet/);
});

test("a reserved account code on the Other GL sheet is rejected, pointing at the dedicated template", async () => {
  const res = await validate(adminToken, {
    cutoffDate: "2026-01-01",
    otherCsv: ["account_code,debit,credit", "30130,,5000"].join("\n"),
  });
  assert.equal(res.body.other.errorCount, 1);
  assert.match(res.body.other.rows[0].errors[0], /handled by one of the other templates/);
});

test("30900 nets to zero when every imported row balances, and canConfirm reflects it", async () => {
  const res = await validate(adminToken, {
    cutoffDate: "2026-01-01",
    shareCapitalCsv: ["member_number,balance", `${existingMember.memberNumber},10000`].join("\n"),
    otherCsv: ["account_code,debit,credit", "11110,10000,"].join("\n"),
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.totalErrorCount, 0);
  assert.equal(res.body.suspenseBalance, 0);
  // canConfirm also requires an empty ledger and no existing lock,
  // neither of which this shared dev database can guarantee — see
  // openingBalancesCommit's own live verification for that path.
});

test("30900 is nonzero when the sheets don't fully balance, and is reported prominently, and canConfirm is false without an override", async () => {
  const res = await validate(adminToken, {
    cutoffDate: "2026-01-01",
    shareCapitalCsv: ["member_number,balance", `${existingMember.memberNumber},10000`].join("\n"),
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.totalErrorCount, 0);
  assert.equal(res.body.suspenseBalance, -10000);
  assert.equal(res.body.canConfirm, false);
});

test("outstanding_principal override is honored and its difference from the schedule-derived figure is reported", async () => {
  const loansCsv = [
    "member_number,loan_product_name,principal_amount,interest_rate,rate_period,computation_method,term_months,release_date,total_repaid_to_date,outstanding_principal",
    `${existingMember.memberNumber},Ad Hoc Loan,10000,1%,monthly,diminishing_balance,12,2024-01-01,0,7000`,
  ].join("\n");
  const res = await validate(adminToken, { cutoffDate: "2026-01-01", loansCsv });
  assert.equal(res.status, 200);
  assert.equal(res.body.loans.errorCount, 0);
  const row = res.body.loans.rows[0];
  assert.equal(row.glOutstandingPrincipal, 7000);
  assert.ok(typeof row.overrideDifference === "number");
  assert.notEqual(row.overrideDifference, 0);
});
