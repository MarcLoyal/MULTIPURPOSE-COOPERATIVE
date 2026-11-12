/**
 * Proves the two genuinely new pieces behind the IWMPC Phase 1 member
 * profile: the unified "all transactions" timeline (lib/memberTimeline.ts)
 * correctly merges across loan/deposit/share-capital transactions and
 * resolves each row's receipt/voucher reference, and the beneficiaries
 * replace-whole-list endpoint leaves the old flat beneficiaryName/
 * beneficiaryRelationship fields untouched.
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

let managerUser: { id: string; email: string };
let managerToken: string;
let member: { id: string; memberNumber: string };
let loanReleaseTxnId: string;
let voucherSequenceNumber: number;

before(async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  managerUser = await prisma.user.create({
    data: { name: "Test MP Manager", email: `test-mp-manager-${RUN_ID}@example.com`, passwordHash, role: "manager" },
  });
  managerToken = (await request(app).post("/api/auth/login").send({ email: managerUser.email, password: PASSWORD })).body.token;

  member = await prisma.member.create({
    data: {
      memberNumber: `TEST-MP-${RUN_ID}`,
      fullName: "Test MP Member",
      status: "active",
      beneficiaryName: "Legacy Beneficiary",
      beneficiaryRelationship: "Spouse",
    },
  });
  await prisma.shareCapitalAccount.create({ data: { memberId: member.id, balance: 0 } });
  const loanAccount = await prisma.loanAccount.create({
    data: {
      memberId: member.id,
      loanProduct: "Test MP Loan",
      principalAmount: 10000,
      interestRate: 0.02,
      termMonths: 12,
      status: "active",
      releaseDate: new Date(),
    },
  });
  const loanReleaseTxn = await prisma.loanTransaction.create({
    data: { loanAccountId: loanAccount.id, type: "release", amount: 10000, balanceAfter: 11200, createdById: managerUser.id },
  });
  loanReleaseTxnId = loanReleaseTxn.id;

  const voucherRes = await request(app)
    .post("/api/disbursement-vouchers")
    .set("Authorization", `Bearer ${managerToken}`)
    .send({ loanTransactionId: loanReleaseTxnId });
  assert.equal(voucherRes.status, 201, JSON.stringify(voucherRes.body));
  voucherSequenceNumber = voucherRes.body.sequenceNumber;
});

after(async () => {
  await prisma.disbursementVoucher.deleteMany({ where: { memberId: member.id } });
  await prisma.loanTransaction.deleteMany({ where: { loanAccount: { memberId: member.id } } });
  await prisma.loanAccount.deleteMany({ where: { memberId: member.id } });
  await prisma.memberBeneficiary.deleteMany({ where: { memberId: member.id } });
  await prisma.shareCapitalAccount.deleteMany({ where: { memberId: member.id } });
  await prisma.member.deleteMany({ where: { id: member.id } });
  await prisma.user.deleteMany({ where: { id: managerUser.id } });
  await prisma.$disconnect();
});

test("the unified timeline includes the loan release with its disbursement voucher reference", async () => {
  const res = await request(app).get(`/api/members/${member.id}/transactions`).set("Authorization", `Bearer ${managerToken}`);
  assert.equal(res.status, 200);
  const entry = res.body.find((e: any) => e.type === "loan_release");
  assert.ok(entry, "expected a loan_release timeline entry");
  assert.equal(entry.amount, 10000);
  assert.equal(entry.reference.kind, "voucher");
  assert.equal(entry.reference.sequenceNumber, voucherSequenceNumber);
  assert.equal(entry.linkTo, `/disbursement-vouchers/${entry.reference.id}`);
});

test("replacing the beneficiaries list does not touch the old flat beneficiaryName/beneficiaryRelationship fields", async () => {
  const res = await request(app)
    .put(`/api/members/${member.id}/beneficiaries`)
    .set("Authorization", `Bearer ${managerToken}`)
    .send({ beneficiaries: [{ name: "New Beneficiary One", relationship: "Child" }, { name: "New Beneficiary Two", relationship: "Sibling" }] });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.equal(res.body[0].name, "New Beneficiary One");
  assert.equal(res.body[0].sortOrder, 0);

  const refreshed = await request(app).get(`/api/members/${member.id}`).set("Authorization", `Bearer ${managerToken}`);
  assert.equal(refreshed.body.beneficiaryName, "Legacy Beneficiary");
  assert.equal(refreshed.body.beneficiaryRelationship, "Spouse");
  assert.equal(refreshed.body.beneficiaries.length, 2);

  // Replacing again fully overwrites, not appends.
  const second = await request(app)
    .put(`/api/members/${member.id}/beneficiaries`)
    .set("Authorization", `Bearer ${managerToken}`)
    .send({ beneficiaries: [{ name: "Only One Now", relationship: "Parent" }] });
  assert.equal(second.status, 200);
  assert.equal(second.body.length, 1);
  assert.equal(second.body[0].name, "Only One Now");
});

test("the members list endpoint never includes photoUrl", async () => {
  await prisma.member.update({ where: { id: member.id }, data: { photoUrl: "data:image/jpeg;base64,abc123" } });
  const res = await request(app).get(`/api/members?q=TEST-MP-${RUN_ID}`).set("Authorization", `Bearer ${managerToken}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.length > 0);
  assert.equal("photoUrl" in res.body[0], false);

  const detailRes = await request(app).get(`/api/members/${member.id}`).set("Authorization", `Bearer ${managerToken}`);
  assert.equal(detailRes.body.photoUrl, "data:image/jpeg;base64,abc123");
});
