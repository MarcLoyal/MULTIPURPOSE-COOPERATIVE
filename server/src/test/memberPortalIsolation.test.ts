/**
 * Proves the member portal's data isolation: a member login can only
 * ever see their own Member record, and a member login gets a 403 on
 * every staff router (loans, members, cash, accounting, audit,
 * dashboard, settings, deposits, fiscal years, share capital) — not
 * just the ones that happen to mention another member by id.
 *
 * Runs against the app's real Express instance (no server listening,
 * just the handler stack — see app.ts) and the dev database via
 * Prisma, through supertest. All fixtures are created and torn down
 * here; nothing here depends on seed data existing.
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

let memberA: { id: string };
let memberB: { id: string };
let userA: { id: string; email: string };
let userB: { id: string; email: string };
let staffUser: { id: string; email: string };
let tokenA: string;
let tokenB: string;
let staffToken: string;

before(async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  memberA = await prisma.member.create({
    data: { memberNumber: `TEST-A-${RUN_ID}`, fullName: "Test Member A", status: "active" },
  });
  await prisma.shareCapitalAccount.create({ data: { memberId: memberA.id, balance: 1000 } });

  memberB = await prisma.member.create({
    data: { memberNumber: `TEST-B-${RUN_ID}`, fullName: "Test Member B", status: "active" },
  });
  await prisma.shareCapitalAccount.create({ data: { memberId: memberB.id, balance: 2000 } });

  userA = await prisma.user.create({
    data: {
      name: "Test Member A",
      email: `test-member-a-${RUN_ID}@example.com`,
      passwordHash,
      role: "member",
      memberId: memberA.id,
    },
  });
  userB = await prisma.user.create({
    data: {
      name: "Test Member B",
      email: `test-member-b-${RUN_ID}@example.com`,
      passwordHash,
      role: "member",
      memberId: memberB.id,
    },
  });
  staffUser = await prisma.user.create({
    data: {
      name: "Test Staff",
      email: `test-staff-${RUN_ID}@example.com`,
      passwordHash,
      role: "manager",
    },
  });

  const loginA = await request(app).post("/api/auth/login").send({ email: userA.email, password: PASSWORD });
  const loginB = await request(app).post("/api/auth/login").send({ email: userB.email, password: PASSWORD });
  const loginStaff = await request(app)
    .post("/api/auth/login")
    .send({ email: staffUser.email, password: PASSWORD });
  tokenA = loginA.body.token;
  tokenB = loginB.body.token;
  staffToken = loginStaff.body.token;

  assert.ok(tokenA, "member A login should succeed");
  assert.ok(tokenB, "member B login should succeed");
  assert.ok(staffToken, "staff login should succeed");
});

after(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id, staffUser.id] } } });
  await prisma.shareCapitalAccount.deleteMany({ where: { memberId: { in: [memberA.id, memberB.id] } } });
  await prisma.member.deleteMany({ where: { id: { in: [memberA.id, memberB.id] } } });
  await prisma.$disconnect();
});

test("a member can view their own portal record", async () => {
  const res = await request(app).get("/api/portal/me").set("Authorization", `Bearer ${tokenA}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.id, memberA.id);
  assert.equal(Number(res.body.shareCapitalAccount.balance), 1000);
});

test("the portal route takes no memberId input — it always resolves to the caller's own, even if one is supplied", async () => {
  // portal.routes.ts's currentMemberId() reads only req.user.memberId
  // (from the signed JWT), never req.params/query/body — this proves a
  // client-supplied id can't redirect it to someone else's record.
  const res = await request(app).get(`/api/portal/me?memberId=${memberB.id}`).set("Authorization", `Bearer ${tokenA}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.id, memberA.id);
  assert.notEqual(res.body.id, memberB.id);
});

test("member A's loan-limit is computed from member A's own share capital, not member B's", async () => {
  const resA = await request(app).get("/api/portal/loan-limit").set("Authorization", `Bearer ${tokenA}`);
  assert.equal(resA.status, 200);
  assert.equal(resA.body.memberId, memberA.id);
  assert.equal(resA.body.shareCapitalBalance, 1000);

  const resB = await request(app).get("/api/portal/loan-limit").set("Authorization", `Bearer ${tokenB}`);
  assert.equal(resB.status, 200);
  assert.equal(resB.body.memberId, memberB.id);
  assert.equal(resB.body.shareCapitalBalance, 2000);
});

test("a member gets 403 on the staff member-detail route, even for their own id", async () => {
  // Proves this isn't "member B's id specifically is blocked" — the
  // entire staff router is off-limits to role=member, full stop.
  const res = await request(app).get(`/api/members/${memberA.id}`).set("Authorization", `Bearer ${tokenA}`);
  assert.equal(res.status, 403);
});

test("a member gets 403 on every staff router", async () => {
  const staffGetRoutes = [
    "/api/members",
    "/api/share-capital/transactions",
    "/api/loans",
    "/api/cash/transactions",
    "/api/accounting/ledger",
    `/api/audit/Member/${memberB.id}`,
    "/api/dashboard",
    "/api/settings/loan-limit",
    "/api/deposits",
    "/api/accounting/fiscal-years",
  ];

  for (const path of staffGetRoutes) {
    const res = await request(app).get(path).set("Authorization", `Bearer ${tokenA}`);
    assert.equal(res.status, 403, `expected 403 for GET ${path} as a member, got ${res.status}`);
  }
});

test("staff can still reach member B's record through the staff route", async () => {
  const res = await request(app).get(`/api/members/${memberB.id}`).set("Authorization", `Bearer ${staffToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.id, memberB.id);
});

test("an unauthenticated request to the portal is rejected", async () => {
  const res = await request(app).get("/api/portal/me");
  assert.equal(res.status, 401);
});

test("a staff login cannot use the member portal", async () => {
  const res = await request(app).get("/api/portal/me").set("Authorization", `Bearer ${staffToken}`);
  assert.equal(res.status, 403);
});
