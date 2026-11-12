/**
 * Proves the IWMPC Phase 1 module on/off switch: default state leaves
 * every existing role/route behaving exactly as before (the other
 * cooperative's deployment sees zero change); turning a report module
 * off blocks every non-admin role but never admin; the "advanced"
 * bucket covers settings/staff-users/opening-balances/audit-log but
 * never the per-entity Activity Log route those pages' own tabs still
 * use; and critically, turning Share Capital off does NOT block its
 * transaction-recording endpoints, which the member profile's "Receive
 * Payment" action depends on regardless (see lib/moduleSettings.ts's
 * doc comment).
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
let managerUser: { id: string; email: string };
let cashierUser: { id: string; email: string };
let adminToken: string;
let managerToken: string;
let cashierToken: string;
let member: { id: string; memberNumber: string };

before(async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  adminUser = await prisma.user.create({
    data: { name: "Test MS Admin", email: `test-ms-admin-${RUN_ID}@example.com`, passwordHash, role: "admin" },
  });
  managerUser = await prisma.user.create({
    data: { name: "Test MS Manager", email: `test-ms-manager-${RUN_ID}@example.com`, passwordHash, role: "manager" },
  });
  cashierUser = await prisma.user.create({
    data: { name: "Test MS Cashier", email: `test-ms-cashier-${RUN_ID}@example.com`, passwordHash, role: "cashier" },
  });

  adminToken = (await request(app).post("/api/auth/login").send({ email: adminUser.email, password: PASSWORD })).body.token;
  managerToken = (await request(app).post("/api/auth/login").send({ email: managerUser.email, password: PASSWORD })).body.token;
  cashierToken = (await request(app).post("/api/auth/login").send({ email: cashierUser.email, password: PASSWORD })).body.token;

  member = await prisma.member.create({
    data: { memberNumber: `TEST-MS-${RUN_ID}`, fullName: "Test MS Member", status: "active" },
  });
  await prisma.shareCapitalAccount.create({ data: { memberId: member.id, balance: 0 } });
});

after(async () => {
  // Always restore both flags this suite touches, regardless of which
  // assertion failed, so a failed run never leaves another test (or a
  // human testing the preview right after) looking at a disabled
  // module by accident.
  await prisma.moduleSetting.update({ where: { key: "generalLedger" }, data: { enabled: true } });
  await prisma.moduleSetting.update({ where: { key: "shareCapital" }, data: { enabled: true } });
  await prisma.moduleSetting.update({ where: { key: "advanced" }, data: { enabled: true } });
  await prisma.shareCapitalTransaction.deleteMany({ where: { account: { memberId: member.id } } });
  await prisma.shareCapitalAccount.deleteMany({ where: { memberId: member.id } });
  await prisma.member.deleteMany({ where: { id: member.id } });
  await prisma.user.deleteMany({ where: { id: { in: [adminUser.id, managerUser.id, cashierUser.id] } } });
  await prisma.$disconnect();
});

test("by default (every module enabled), every role reaches every route exactly as before", async () => {
  const ledgerRes = await request(app).get("/api/accounting/ledger").set("Authorization", `Bearer ${cashierToken}`);
  assert.equal(ledgerRes.status, 200);
  const advancedRes = await request(app).get("/api/users").set("Authorization", `Bearer ${adminToken}`);
  assert.equal(advancedRes.status, 200);
});

test("GET /api/settings/modules is readable by any staff role, including cashier", async () => {
  const res = await request(app).get("/api/settings/modules").set("Authorization", `Bearer ${cashierToken}`);
  assert.equal(res.status, 200);
  assert.equal(typeof res.body.generalLedger, "boolean");
});

test("disabling a report module blocks cashier and manager but never admin", async () => {
  const patchRes = await request(app)
    .patch("/api/settings/modules/generalLedger")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ enabled: false });
  assert.equal(patchRes.status, 200);
  assert.equal(patchRes.body.enabled, false);

  const cashierRes = await request(app).get("/api/accounting/ledger").set("Authorization", `Bearer ${cashierToken}`);
  assert.equal(cashierRes.status, 403);

  const managerRes = await request(app).get("/api/accounting/ledger").set("Authorization", `Bearer ${managerToken}`);
  assert.equal(managerRes.status, 403);

  const adminRes = await request(app).get("/api/accounting/ledger").set("Authorization", `Bearer ${adminToken}`);
  assert.equal(adminRes.status, 200);

  await request(app)
    .patch("/api/settings/modules/generalLedger")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ enabled: true });
});

test("a non-admin role is rejected from PATCH /settings/modules/:key", async () => {
  const res = await request(app)
    .patch("/api/settings/modules/generalLedger")
    .set("Authorization", `Bearer ${managerToken}`)
    .send({ enabled: false });
  assert.equal(res.status, 403);
});

test("disabling 'advanced' blocks the global audit log for a manager, but never the per-entity activity log any staff role's Activity Log tab depends on", async () => {
  await prisma.moduleSetting.update({ where: { key: "advanced" }, data: { enabled: false } });

  const globalRes = await request(app).get("/api/audit").set("Authorization", `Bearer ${managerToken}`);
  assert.equal(globalRes.status, 403);

  const perEntityRes = await request(app)
    .get(`/api/audit/Member/${member.id}`)
    .set("Authorization", `Bearer ${cashierToken}`);
  assert.equal(perEntityRes.status, 200);

  const adminGlobalRes = await request(app).get("/api/audit").set("Authorization", `Bearer ${adminToken}`);
  assert.equal(adminGlobalRes.status, 200);

  await prisma.moduleSetting.update({ where: { key: "advanced" }, data: { enabled: true } });
});

test("disabling Share Capital does NOT block its transaction-recording endpoints — the member profile's Receive Payment action depends on this", async () => {
  await prisma.moduleSetting.update({ where: { key: "shareCapital" }, data: { enabled: false } });

  const createRes = await request(app)
    .post("/api/share-capital/transactions")
    .set("Authorization", `Bearer ${cashierToken}`)
    .send({ memberId: member.id, type: "subscription", amount: 500 });
  assert.equal(createRes.status, 201, JSON.stringify(createRes.body));

  const approveRes = await request(app)
    .post(`/api/share-capital/transactions/${createRes.body.id}/approve`)
    .set("Authorization", `Bearer ${managerToken}`);
  assert.equal(approveRes.status, 200);

  await prisma.moduleSetting.update({ where: { key: "shareCapital" }, data: { enabled: true } });
});
