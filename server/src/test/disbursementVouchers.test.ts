/**
 * Proves the disbursement voucher flow end to end: issuing for a loan
 * release, a deposit withdrawal, and a share capital withdrawal; a
 * gap-free sequence across a void; void with a reason (never deleted);
 * reprint marking; and that only an eligible transaction type/role can
 * trigger each step — the outflow counterpart to
 * forcePasswordChange.test.ts's receipt coverage.
 *
 * Run with: npm test (see package.json)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { app } from "../app";
import { prisma } from "../lib/prisma";

const PASSWORD = "TestPassword123!";
const RUN_ID = Date.now();

let cashierUser: { id: string; email: string };
let creditOfficerUser: { id: string; email: string };
let cashierToken: string;
let creditOfficerToken: string;
let member: { id: string; memberNumber: string };

let loanReleaseTxnId: string;
let repaymentTxnId: string;
let depositWithdrawalTxnId: string;
let shareCapitalWithdrawalTxnId: string;
let shareCapitalSubscriptionTxnId: string;

before(async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  cashierUser = await prisma.user.create({
    data: { name: "Test DV Cashier", email: `test-dv-cashier-${RUN_ID}@example.com`, passwordHash, role: "cashier" },
  });
  creditOfficerUser = await prisma.user.create({
    data: {
      name: "Test DV Credit Officer",
      email: `test-dv-credit-${RUN_ID}@example.com`,
      passwordHash,
      role: "credit_officer",
    },
  });

  const cashierLogin = await request(app).post("/api/auth/login").send({ email: cashierUser.email, password: PASSWORD });
  cashierToken = cashierLogin.body.token;
  assert.ok(cashierToken, "cashier login should succeed");

  const creditLogin = await request(app)
    .post("/api/auth/login")
    .send({ email: creditOfficerUser.email, password: PASSWORD });
  creditOfficerToken = creditLogin.body.token;
  assert.ok(creditOfficerToken, "credit officer login should succeed");

  member = await prisma.member.create({
    data: { memberNumber: `TEST-DV-${RUN_ID}`, fullName: "Test DV Member", status: "active" },
  });
  const shareCapitalAccount = await prisma.shareCapitalAccount.create({ data: { memberId: member.id, balance: 20000 } });
  const depositProduct = await prisma.depositProduct.create({
    data: { name: `Test DV Savings ${RUN_ID}`, type: "savings", interestRate: 0.01 },
  });
  const depositAccount = await prisma.depositAccount.create({
    data: { memberId: member.id, depositProductId: depositProduct.id, balance: 5000, status: "active" },
  });
  const loanAccount = await prisma.loanAccount.create({
    data: {
      memberId: member.id,
      loanProduct: "Test DV Loan Product",
      principalAmount: 50000,
      interestRate: 0.02,
      termMonths: 12,
      status: "active",
      releaseDate: new Date(),
    },
  });

  const loanReleaseTxn = await prisma.loanTransaction.create({
    data: { loanAccountId: loanAccount.id, type: "release", amount: 50000, balanceAfter: 56000, createdById: cashierUser.id },
  });
  loanReleaseTxnId = loanReleaseTxn.id;
  await prisma.ledgerEntry.createMany({
    data: [
      { batchId: randomUUID(), accountCode: "11210", debit: 50000, credit: 0, sourceType: "loan", loanTransactionId: loanReleaseTxnId, createdById: cashierUser.id },
      { batchId: randomUUID(), accountCode: "11110", debit: 0, credit: 50000, sourceType: "loan", loanTransactionId: loanReleaseTxnId, createdById: cashierUser.id },
    ],
  });

  const repaymentTxn = await prisma.loanTransaction.create({
    data: { loanAccountId: loanAccount.id, type: "repayment", amount: 5000, balanceAfter: 51000, createdById: cashierUser.id },
  });
  repaymentTxnId = repaymentTxn.id;

  const depositWithdrawalTxn = await prisma.depositTransaction.create({
    data: { depositAccountId: depositAccount.id, type: "withdrawal", amount: 1000, balanceAfter: 4000, createdById: cashierUser.id },
  });
  depositWithdrawalTxnId = depositWithdrawalTxn.id;
  await prisma.ledgerEntry.createMany({
    data: [
      { batchId: randomUUID(), accountCode: "21110", debit: 1000, credit: 0, sourceType: "deposit", depositTransactionId: depositWithdrawalTxnId, createdById: cashierUser.id },
      { batchId: randomUUID(), accountCode: "11110", debit: 0, credit: 1000, sourceType: "deposit", depositTransactionId: depositWithdrawalTxnId, createdById: cashierUser.id },
    ],
  });

  const shareCapitalWithdrawalTxn = await prisma.shareCapitalTransaction.create({
    data: {
      shareCapitalAccountId: shareCapitalAccount.id,
      type: "withdrawal",
      amount: 2000,
      status: "posted",
      createdById: cashierUser.id,
      approvedById: cashierUser.id,
      approvedAt: new Date(),
    },
  });
  shareCapitalWithdrawalTxnId = shareCapitalWithdrawalTxn.id;

  const shareCapitalSubscriptionTxn = await prisma.shareCapitalTransaction.create({
    data: {
      shareCapitalAccountId: shareCapitalAccount.id,
      type: "subscription",
      amount: 3000,
      status: "posted",
      createdById: cashierUser.id,
      approvedById: cashierUser.id,
      approvedAt: new Date(),
    },
  });
  shareCapitalSubscriptionTxnId = shareCapitalSubscriptionTxn.id;
});

after(async () => {
  await prisma.disbursementVoucher.deleteMany({ where: { memberId: member.id } });
  await prisma.ledgerEntry.deleteMany({ where: { loanTransactionId: loanReleaseTxnId } });
  await prisma.ledgerEntry.deleteMany({ where: { depositTransactionId: depositWithdrawalTxnId } });
  await prisma.loanTransaction.deleteMany({ where: { loanAccount: { memberId: member.id } } });
  await prisma.loanAccount.deleteMany({ where: { memberId: member.id } });
  await prisma.depositTransaction.deleteMany({ where: { depositAccount: { memberId: member.id } } });
  await prisma.depositAccount.deleteMany({ where: { memberId: member.id } });
  await prisma.shareCapitalTransaction.deleteMany({ where: { account: { memberId: member.id } } });
  await prisma.shareCapitalAccount.deleteMany({ where: { memberId: member.id } });
  await prisma.depositProduct.deleteMany({ where: { name: { contains: RUN_ID.toString() } } });
  await prisma.member.deleteMany({ where: { id: member.id } });
  await prisma.user.deleteMany({ where: { id: { in: [cashierUser.id, creditOfficerUser.id] } } });
  await prisma.$disconnect();
});

test("a non-voucher role gets 403 issuing a disbursement voucher", async () => {
  const res = await request(app)
    .post("/api/disbursement-vouchers")
    .set("Authorization", `Bearer ${creditOfficerToken}`)
    .send({ loanTransactionId: loanReleaseTxnId });
  assert.equal(res.status, 403);
});

test("only an eligible transaction type can get a disbursement voucher", async () => {
  const res = await request(app)
    .post("/api/disbursement-vouchers")
    .set("Authorization", `Bearer ${cashierToken}`)
    .send({ loanTransactionId: repaymentTxnId });
  assert.equal(res.status, 400);

  const scRes = await request(app)
    .post("/api/disbursement-vouchers")
    .set("Authorization", `Bearer ${cashierToken}`)
    .send({ shareCapitalTransactionId: shareCapitalSubscriptionTxnId });
  assert.equal(scRes.status, 400);
});

let firstSequenceNumber: number;
let loanVoucherId: string;

test("issuing a voucher for a loan release succeeds and assigns a sequence number", async () => {
  const res = await request(app)
    .post("/api/disbursement-vouchers")
    .set("Authorization", `Bearer ${cashierToken}`)
    .send({ loanTransactionId: loanReleaseTxnId });
  assert.equal(res.status, 201);
  assert.ok(Number.isInteger(res.body.sequenceNumber));
  firstSequenceNumber = res.body.sequenceNumber;
  loanVoucherId = res.body.id;
});

test("issuing a second voucher for the same transaction is blocked", async () => {
  const res = await request(app)
    .post("/api/disbursement-vouchers")
    .set("Authorization", `Bearer ${cashierToken}`)
    .send({ loanTransactionId: loanReleaseTxnId });
  assert.equal(res.status, 409);
});

test("sequence numbers are consecutive across a deposit withdrawal and a share capital withdrawal voucher", async () => {
  const depositRes = await request(app)
    .post("/api/disbursement-vouchers")
    .set("Authorization", `Bearer ${cashierToken}`)
    .send({ depositTransactionId: depositWithdrawalTxnId });
  assert.equal(depositRes.status, 201);
  assert.equal(depositRes.body.sequenceNumber, firstSequenceNumber + 1);

  const scRes = await request(app)
    .post("/api/disbursement-vouchers")
    .set("Authorization", `Bearer ${cashierToken}`)
    .send({ shareCapitalTransactionId: shareCapitalWithdrawalTxnId });
  assert.equal(scRes.status, 201);
  assert.equal(scRes.body.sequenceNumber, firstSequenceNumber + 2);
});

test("the printable page shows amount in words and the real account entries, and increments print count", async () => {
  const first = await request(app).get(`/api/disbursement-vouchers/${loanVoucherId}`).set("Authorization", `Bearer ${cashierToken}`);
  assert.equal(first.status, 200);
  assert.equal(first.body.isReprint, false);
  assert.equal(first.body.amount, 50000);
  assert.match(first.body.amountInWords, /Fifty Thousand Pesos and 00\/100/);
  assert.equal(first.body.accountEntries.length, 2);
  assert.ok(first.body.accountEntries.some((e: any) => e.accountCode === "11210" && e.debit === 50000));
  assert.ok(first.body.accountEntries.some((e: any) => e.accountCode === "11110" && e.credit === 50000));

  const second = await request(app).get(`/api/disbursement-vouchers/${loanVoucherId}`).set("Authorization", `Bearer ${cashierToken}`);
  assert.equal(second.body.isReprint, true);
});

test("voiding a voucher records the reason and leaves its sequence number permanently consumed, not reusable", async () => {
  const voidRes = await request(app)
    .post(`/api/disbursement-vouchers/${loanVoucherId}/void`)
    .set("Authorization", `Bearer ${cashierToken}`)
    .send({ reason: "Issued against the wrong loan account" });
  assert.equal(voidRes.status, 200);
  assert.equal(voidRes.body.status, "void");
  assert.equal(voidRes.body.voidReason, "Issued against the wrong loan account");

  const voidAgain = await request(app)
    .post(`/api/disbursement-vouchers/${loanVoucherId}/void`)
    .set("Authorization", `Bearer ${cashierToken}`)
    .send({ reason: "Trying again" });
  assert.equal(voidAgain.status, 409);

  const stillExists = await prisma.disbursementVoucher.findUnique({ where: { id: loanVoucherId } });
  assert.ok(stillExists, "a voided voucher must never be deleted");
  assert.equal(stillExists!.sequenceNumber, firstSequenceNumber);

  // The void above must not have rewound the shared counter — the
  // next voucher issued anywhere in the system should still continue
  // from +2, not reuse the voided number.
  const counter = await prisma.disbursementVoucherSequenceCounter.findFirst();
  assert.equal(counter!.lastNumber, firstSequenceNumber + 2);
});
