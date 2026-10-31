/**
 * Proves the global Audit Log viewer (GET /api/audit, GET /api/audit/filters,
 * GET /api/audit/export) — manager/admin only, filterable by user/action/
 * date, paginated, and CSV-exportable — plus that the existing per-entity
 * GET /api/audit/:entityType/:entityId still works after extracting its
 * phrasing logic into lib/audit.ts for reuse by the new routes.
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
const ENTITY_TYPE = `TestAuditEntity${RUN_ID}`;
const ENTITY_ID = `entity-${RUN_ID}`;

let managerUser: { id: string; email: string };
let cashierUser: { id: string; email: string };
let managerToken: string;
let cashierToken: string;

const OLD_DATE = new Date("2020-01-15T10:00:00Z");
const RECENT_DATE = new Date("2026-01-15T10:00:00Z");
const LATEST_DATE = new Date("2026-01-15T11:00:00Z");

before(async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  managerUser = await prisma.user.create({
    data: { name: `Test Audit Manager ${RUN_ID}`, email: `test-audit-manager-${RUN_ID}@example.com`, passwordHash, role: "manager" },
  });
  cashierUser = await prisma.user.create({
    data: { name: `Test Audit Cashier ${RUN_ID}`, email: `test-audit-cashier-${RUN_ID}@example.com`, passwordHash, role: "cashier" },
  });

  const managerLogin = await request(app).post("/api/auth/login").send({ email: managerUser.email, password: PASSWORD });
  managerToken = managerLogin.body.token;
  assert.ok(managerToken);

  const cashierLogin = await request(app).post("/api/auth/login").send({ email: cashierUser.email, password: PASSWORD });
  cashierToken = cashierLogin.body.token;
  assert.ok(cashierToken);

  await prisma.auditLog.createMany({
    data: [
      {
        entityType: ENTITY_TYPE,
        entityId: ENTITY_ID,
        action: "create",
        performedById: managerUser.id,
        performedByName: managerUser.name,
        performedAt: OLD_DATE,
        newValue: { note: "old create" },
      },
      {
        entityType: ENTITY_TYPE,
        entityId: ENTITY_ID,
        action: "approve",
        performedById: managerUser.id,
        performedByName: managerUser.name,
        performedAt: RECENT_DATE,
        newValue: { note: "recent approve" },
      },
      {
        entityType: ENTITY_TYPE,
        entityId: ENTITY_ID,
        action: "update",
        performedById: cashierUser.id,
        performedByName: cashierUser.name,
        performedAt: LATEST_DATE,
        newValue: { status: "void", voidReason: "test void, contains, a comma" },
      },
    ],
  });
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { entityType: ENTITY_TYPE } });
  await prisma.user.deleteMany({ where: { id: { in: [managerUser.id, cashierUser.id] } } });
  await prisma.$disconnect();
});

test("a non-manager, non-admin role gets 403 on every global audit route", async () => {
  const list = await request(app).get("/api/audit").set("Authorization", `Bearer ${cashierToken}`);
  assert.equal(list.status, 403);
  const filters = await request(app).get("/api/audit/filters").set("Authorization", `Bearer ${cashierToken}`);
  assert.equal(filters.status, 403);
  const exportRes = await request(app).get("/api/audit/export").set("Authorization", `Bearer ${cashierToken}`);
  assert.equal(exportRes.status, 403);
});

test("the existing per-entity activity log still works after the shared-phrasing refactor", async () => {
  const res = await request(app)
    .get(`/api/audit/${ENTITY_TYPE}/${ENTITY_ID}`)
    .set("Authorization", `Bearer ${cashierToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 3);
  assert.match(res.body[0].description, new RegExp(`${cashierUser.name} updated this`));
});

test("the global list returns matching rows, newest first, with pagination metadata", async () => {
  const res = await request(app)
    .get(`/api/audit?userId=${managerUser.id}`)
    .set("Authorization", `Bearer ${managerToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 2);
  assert.equal(res.body.page, 1);
  assert.equal(res.body.logs.length, 2);
  assert.equal(res.body.logs[0].action, "approve");
  assert.equal(res.body.logs[1].action, "create");
});

test("filtering by action narrows the results", async () => {
  const scoped = await request(app)
    .get(`/api/audit?action=approve&userId=${managerUser.id}`)
    .set("Authorization", `Bearer ${managerToken}`);
  assert.equal(scoped.status, 200);
  assert.equal(scoped.body.total, 1);
  assert.equal(scoped.body.logs[0].action, "approve");
});

test("an invalid action value is rejected", async () => {
  const res = await request(app).get("/api/audit?action=not_a_real_action").set("Authorization", `Bearer ${managerToken}`);
  assert.equal(res.status, 400);
});

test("filtering by date range excludes rows outside it", async () => {
  const res = await request(app)
    .get(`/api/audit?userId=${managerUser.id}&dateFrom=2025-01-01&dateTo=2025-12-31`)
    .set("Authorization", `Bearer ${managerToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 0);

  const res2 = await request(app)
    .get(`/api/audit?userId=${managerUser.id}&dateFrom=2026-01-01&dateTo=2026-01-31`)
    .set("Authorization", `Bearer ${managerToken}`);
  assert.equal(res2.status, 200);
  assert.equal(res2.body.total, 1);
  assert.equal(res2.body.logs[0].action, "approve");
});

test("the filters endpoint returns the distinct users who appear in the log", async () => {
  const res = await request(app).get("/api/audit/filters").set("Authorization", `Bearer ${managerToken}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.users.some((u: any) => u.id === managerUser.id));
  assert.ok(res.body.users.some((u: any) => u.id === cashierUser.id));
  assert.deepEqual(res.body.actions, ["create", "update", "approve", "reject", "delete_attempt"]);
});

test("the CSV export honors the same filters and produces one row per matching log", async () => {
  const res = await request(app)
    .get(`/api/audit/export?userId=${cashierUser.id}`)
    .set("Authorization", `Bearer ${managerToken}`);
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /text\/csv/);
  const lines = res.text.trim().split("\n");
  assert.equal(lines[0], "Date,User,Action,Entity Type,Entity ID,Description");
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^\d{4}-\d{2}-\d{2}/);
  assert.ok(lines[1].includes(cashierUser.name));
  assert.ok(lines[1].includes(ENTITY_TYPE));
});
